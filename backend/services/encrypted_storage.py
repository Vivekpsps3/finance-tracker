from __future__ import annotations

import base64
import json
import re
from typing import Any

from fastapi import HTTPException
from fastapi.encoders import jsonable_encoder
from sqlalchemy.orm import Session

from models import (
    Asset,
    BankAccount,
    BrokerageAccount,
    EncryptedRecord,
    EncryptedRecordIndex,
    FixedExpense,
    Holding,
    ImportBatch,
    JobIncome,
    Liability,
    PlanningAssumptionProfile,
    PlanningScenarioRun,
    Subscription,
    Transaction,
    UserCryptoMigration,
    UserVault,
    utc_now,
)

ALLOWED_COLLECTIONS = frozenset(
    {
        "transactions",
        "bank_accounts",
        "import_batches",
        "assets",
        "liabilities",
        "holdings",
        "brokerage_accounts",
        "job_incomes",
        "fixed_expenses",
        "subscriptions",
        "planning_profiles",
        "planning_runs",
        "stock_lab_scenarios",
    }
)

CLIENT_ID_RE = re.compile(r"^[A-Za-z0-9_.:-]{8,128}$")
MAX_CIPHERTEXT_BYTES = 512_000
MAX_BATCH = 200
CURRENT_RECORD_SCHEMA_VERSION = 2

LEGACY_COLLECTIONS = {
    "transactions": Transaction,
    "bank_accounts": BankAccount,
    "import_batches": ImportBatch,
    "assets": Asset,
    "liabilities": Liability,
    "holdings": Holding,
    "brokerage_accounts": BrokerageAccount,
    "job_incomes": JobIncome,
    "fixed_expenses": FixedExpense,
    "subscriptions": Subscription,
    "planning_profiles": PlanningAssumptionProfile,
    "planning_runs": PlanningScenarioRun,
}

# Delete dependent rows first so this remains valid on databases enforcing foreign keys.
LEGACY_DELETE_ORDER = (
    Transaction,
    Holding,
    PlanningScenarioRun,
    BankAccount,
    ImportBatch,
    BrokerageAccount,
    Asset,
    Liability,
    JobIncome,
    FixedExpense,
    Subscription,
    PlanningAssumptionProfile,
)


def _b64_decode(value: str) -> bytes:
    """Decode non-empty RFC 4648 base64 without normalizing client input."""
    raw = value or ""
    if not raw:
        raise HTTPException(status_code=400, detail="Invalid base64 payload")
    try:
        decoded = base64.b64decode(raw, altchars=b"-_", validate=True)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid base64 payload") from exc
    if not decoded:
        raise HTTPException(status_code=400, detail="Invalid base64 payload")
    return decoded


def _b64_len(value: str) -> int:
    return len(_b64_decode(value))


def _validate_recovery_wrap(value: str) -> None:
    """
    Recovery-key path is retired. Empty means unused.
    Legacy non-empty wraps are still stored opaquely for old rows.
    """
    packed = (value or "").strip()
    if not packed:
        return
    if "." not in packed:
        if _b64_len(packed) < 32:
            raise HTTPException(status_code=400, detail="Recovery wrap too short")
        return
    salt_b64, wrapped_b64 = packed.split(".", 1)
    if not salt_b64 or not wrapped_b64:
        raise HTTPException(status_code=400, detail="Invalid recovery wrap format")
    if _b64_len(salt_b64) < 16:
        raise HTTPException(status_code=400, detail="Recovery salt too short")
    if _b64_len(wrapped_b64) < 32:
        raise HTTPException(status_code=400, detail="Recovery wrap too short")


def validate_collection(collection: str) -> str:
    if collection not in ALLOWED_COLLECTIONS:
        raise HTTPException(status_code=400, detail=f"Unknown collection: {collection}")
    return collection


def validate_client_id(client_id: str) -> str:
    if not CLIENT_ID_RE.match(client_id or ""):
        raise HTTPException(status_code=400, detail="Invalid client_id")
    return client_id


def get_vault(db: Session, user_id: int) -> UserVault | None:
    return db.query(UserVault).filter(UserVault.user_id == user_id).one_or_none()


def get_or_create_migration(db: Session, user_id: int) -> UserCryptoMigration:
    row = db.query(UserCryptoMigration).filter(UserCryptoMigration.user_id == user_id).one_or_none()
    if row:
        return row
    row = UserCryptoMigration(user_id=user_id, status="none")
    db.add(row)
    db.flush()
    return row


def is_user_migrated(db: Session, user_id: int) -> bool:
    row = db.query(UserCryptoMigration).filter(UserCryptoMigration.user_id == user_id).one_or_none()
    return bool(row and row.status == "completed")


def create_vault(
    db: Session,
    user_id: int,
    *,
    kdf_algorithm: str,
    kdf_salt_b64: str,
    kdf_iterations: int,
    wrapped_dek_b64: str,
    recovery_wrapped_dek_b64: str = "",
    key_version: int = 1,
) -> UserVault:
    if get_vault(db, user_id):
        raise HTTPException(status_code=409, detail="Vault already exists")
    if kdf_algorithm != "PBKDF2":
        raise HTTPException(status_code=400, detail="Only PBKDF2 is supported")
    if kdf_iterations < 100_000 or kdf_iterations > 5_000_000:
        raise HTTPException(status_code=400, detail="Invalid KDF iterations")
    if _b64_len(kdf_salt_b64) < 16:
        raise HTTPException(status_code=400, detail="KDF salt too short")
    if _b64_len(wrapped_dek_b64) < 32:
        raise HTTPException(status_code=400, detail="Wrapped DEK too short")
    _validate_recovery_wrap(recovery_wrapped_dek_b64)
    vault = UserVault(
        user_id=user_id,
        kdf_algorithm=kdf_algorithm,
        kdf_salt_b64=kdf_salt_b64,
        kdf_iterations=kdf_iterations,
        wrapped_dek_b64=wrapped_dek_b64,
        recovery_wrapped_dek_b64=recovery_wrapped_dek_b64 or "",
        key_version=key_version,
    )
    db.add(vault)
    legacy_counts = legacy_collection_counts(db, user_id)
    set_migration_status(
        db,
        user_id,
        status="vault_ready" if legacy_counts else "completed",
        legacy_counts=legacy_counts,
        encrypted_counts=collection_counts(db, user_id),
    )
    return vault


def update_vault_wraps(
    db: Session,
    user_id: int,
    *,
    kdf_salt_b64: str | None = None,
    kdf_iterations: int | None = None,
    wrapped_dek_b64: str | None = None,
    recovery_wrapped_dek_b64: str | None = None,
    key_version: int | None = None,
) -> UserVault:
    vault = get_vault(db, user_id)
    if not vault:
        raise HTTPException(status_code=404, detail="Vault not found")
    if kdf_salt_b64 is not None:
        if _b64_len(kdf_salt_b64) < 16:
            raise HTTPException(status_code=400, detail="KDF salt too short")
        vault.kdf_salt_b64 = kdf_salt_b64
    if kdf_iterations is not None:
        if kdf_iterations < 100_000 or kdf_iterations > 5_000_000:
            raise HTTPException(status_code=400, detail="Invalid KDF iterations")
        vault.kdf_iterations = kdf_iterations
    if wrapped_dek_b64 is not None:
        if _b64_len(wrapped_dek_b64) < 32:
            raise HTTPException(status_code=400, detail="Wrapped DEK too short")
        vault.wrapped_dek_b64 = wrapped_dek_b64
    if recovery_wrapped_dek_b64 is not None:
        _validate_recovery_wrap(recovery_wrapped_dek_b64)
        vault.recovery_wrapped_dek_b64 = recovery_wrapped_dek_b64
    if key_version is not None:
        if key_version < vault.key_version:
            raise HTTPException(status_code=400, detail="key_version cannot decrease")
        vault.key_version = key_version
    vault.updated_at = utc_now()
    return vault


def list_records(
    db: Session,
    user_id: int,
    *,
    collection: str | None = None,
    since_revision: int | None = None,
) -> list[EncryptedRecord]:
    q = db.query(EncryptedRecord).filter(EncryptedRecord.user_id == user_id)
    if collection:
        validate_collection(collection)
        q = q.filter(EncryptedRecord.collection == collection)
    if since_revision is not None:
        q = q.filter(EncryptedRecord.revision > since_revision)
    return q.order_by(EncryptedRecord.revision.asc(), EncryptedRecord.id.asc()).all()


def upsert_records(db: Session, user_id: int, items: list[dict[str, Any]]) -> list[EncryptedRecord]:
    if not items:
        raise HTTPException(status_code=400, detail="No records provided")
    if len(items) > MAX_BATCH:
        raise HTTPException(status_code=400, detail=f"Batch too large (max {MAX_BATCH})")
    out: list[EncryptedRecord] = []
    for item in items:
        collection = validate_collection(str(item.get("collection", "")))
        client_id = validate_client_id(str(item.get("client_id", "")))
        ciphertext_b64 = str(item.get("ciphertext_b64", ""))
        if not ciphertext_b64 or _b64_len(ciphertext_b64) > MAX_CIPHERTEXT_BYTES:
            raise HTTPException(status_code=400, detail="Invalid ciphertext")
        schema_version = int(item.get("schema_version", 1))
        key_version = int(item.get("key_version", 1))
        if schema_version not in {1, CURRENT_RECORD_SCHEMA_VERSION} or key_version < 1:
            raise HTTPException(status_code=400, detail="Invalid version fields")
        row = (
            db.query(EncryptedRecord)
            .filter(
                EncryptedRecord.user_id == user_id,
                EncryptedRecord.collection == collection,
                EncryptedRecord.client_id == client_id,
            )
            .one_or_none()
        )
        if row:
            expected_revision = item.get("expected_revision")
            if expected_revision is None:
                raise HTTPException(status_code=400, detail="expected_revision is required for updates")
            expected = int(expected_revision)
            if expected != row.revision:
                raise HTTPException(
                    status_code=409,
                    detail=f"Revision conflict for {collection}/{client_id}",
                )
            row.ciphertext_b64 = ciphertext_b64
            row.schema_version = schema_version
            row.key_version = key_version
            row.revision = row.revision + 1
            row.updated_at = utc_now()
        else:
            row = EncryptedRecord(
                user_id=user_id,
                collection=collection,
                client_id=client_id,
                ciphertext_b64=ciphertext_b64,
                schema_version=schema_version,
                key_version=key_version,
                revision=1,
            )
            db.add(row)
        indexes = item.get("indexes") or []
        if not isinstance(indexes, list):
            raise HTTPException(status_code=400, detail="indexes must be a list")
        db.query(EncryptedRecordIndex).filter(
            EncryptedRecordIndex.user_id == user_id,
            EncryptedRecordIndex.collection == collection,
            EncryptedRecordIndex.client_id == client_id,
        ).delete(synchronize_session=False)
        for idx in indexes:
            name = str(idx.get("index_name", ""))
            value = str(idx.get("index_value_b64", ""))
            if not name or not value:
                raise HTTPException(status_code=400, detail="Invalid blind index")
            if _b64_len(value) > 128:
                raise HTTPException(status_code=400, detail="Blind index too long")
            db.add(
                EncryptedRecordIndex(
                    user_id=user_id,
                    collection=collection,
                    client_id=client_id,
                    index_name=name[:64],
                    index_value_b64=value,
                )
            )
        out.append(row)
    db.flush()
    return out


def delete_records(db: Session, user_id: int, items: list[dict[str, Any]]) -> int:
    if len(items) > MAX_BATCH:
        raise HTTPException(status_code=400, detail=f"Batch too large (max {MAX_BATCH})")
    deleted = 0
    for item in items:
        collection = validate_collection(str(item.get("collection", "")))
        client_id = validate_client_id(str(item.get("client_id", "")))
        expected_revision = int(item["expected_revision"])
        deleted_count = (
            db.query(EncryptedRecord)
            .filter(
                EncryptedRecord.user_id == user_id,
                EncryptedRecord.collection == collection,
                EncryptedRecord.client_id == client_id,
                EncryptedRecord.revision == expected_revision,
            )
            .delete(synchronize_session=False)
        )
        if not deleted_count:
            existing = (
                db.query(EncryptedRecord.id)
                .filter(
                    EncryptedRecord.user_id == user_id,
                    EncryptedRecord.collection == collection,
                    EncryptedRecord.client_id == client_id,
                )
                .one_or_none()
            )
            if existing:
                raise HTTPException(
                    status_code=409,
                    detail=f"Revision conflict for {collection}/{client_id}",
                )
            continue
        deleted += deleted_count
        db.query(EncryptedRecordIndex).filter(
            EncryptedRecordIndex.user_id == user_id,
            EncryptedRecordIndex.collection == collection,
            EncryptedRecordIndex.client_id == client_id,
        ).delete(synchronize_session=False)
    return deleted


def lookup_blind_index(
    db: Session, user_id: int, *, collection: str, index_name: str, index_value_b64: str
) -> list[str]:
    validate_collection(collection)
    rows = (
        db.query(EncryptedRecordIndex)
        .filter(
            EncryptedRecordIndex.user_id == user_id,
            EncryptedRecordIndex.collection == collection,
            EncryptedRecordIndex.index_name == index_name,
            EncryptedRecordIndex.index_value_b64 == index_value_b64,
        )
        .all()
    )
    return [r.client_id for r in rows]


def collection_counts(db: Session, user_id: int) -> dict[str, int]:
    counts = {name: 0 for name in sorted(ALLOWED_COLLECTIONS)}
    rows = (
        db.query(EncryptedRecord.collection, EncryptedRecord.id)
        .filter(EncryptedRecord.user_id == user_id)
        .all()
    )
    for collection, _ in rows:
        if collection in counts:
            counts[collection] += 1
    return counts


def legacy_collection_counts(db: Session, user_id: int) -> dict[str, int]:
    counts: dict[str, int] = {}
    for collection, model in LEGACY_COLLECTIONS.items():
        count = db.query(model).filter(model.user_id == user_id).count()
        if count:
            counts[collection] = count
    return counts


def export_legacy_records(db: Session, user_id: int) -> tuple[dict[str, int], list[dict[str, Any]]]:
    """Return plaintext only while the browser is replacing it with encrypted records."""
    migration = get_or_create_migration(db, user_id)
    if migration.status != "vault_ready":
        raise HTTPException(status_code=409, detail="Legacy export is available only while migration is vault_ready")

    records: list[dict[str, Any]] = []
    for collection, model in LEGACY_COLLECTIONS.items():
        rows = db.query(model).filter(model.user_id == user_id).order_by(model.id).all()
        for row in rows:
            data = {
                column.name: getattr(row, column.name)
                for column in model.__table__.columns
                if column.name != "user_id"
            }
            records.append({"collection": collection, "data": jsonable_encoder(data)})
    return legacy_collection_counts(db, user_id), records


def complete_legacy_migration(
    db: Session,
    user_id: int,
    *,
    counts: dict[str, int],
    records: list[dict[str, str]],
) -> UserCryptoMigration:
    migration = get_or_create_migration(db, user_id)
    if migration.status == "completed":
        return migration

    actual_counts = legacy_collection_counts(db, user_id)
    normalized_counts: dict[str, int] = {}
    for collection, count in counts.items():
        validate_collection(collection)
        if not isinstance(count, int) or isinstance(count, bool) or count < 0:
            raise HTTPException(status_code=400, detail="Invalid migration counts")
        if count:
            normalized_counts[collection] = count
    if normalized_counts != actual_counts:
        raise HTTPException(status_code=409, detail="Legacy migration count mismatch")

    expected = {(item["collection"], item["client_id"]) for item in records}
    if len(expected) != len(records):
        raise HTTPException(status_code=400, detail="Duplicate migration record identity")
    record_counts: dict[str, int] = {}
    for collection, client_id in expected:
        validate_collection(collection)
        validate_client_id(client_id)
        record_counts[collection] = record_counts.get(collection, 0) + 1
    if record_counts != actual_counts:
        raise HTTPException(status_code=409, detail="Encrypted migration count mismatch")

    for collection, client_id in expected:
        replacement = (
            db.query(EncryptedRecord.id)
            .filter(
                EncryptedRecord.user_id == user_id,
                EncryptedRecord.collection == collection,
                EncryptedRecord.client_id == client_id,
                EncryptedRecord.schema_version == CURRENT_RECORD_SCHEMA_VERSION,
            )
            .one_or_none()
        )
        if not replacement:
            raise HTTPException(status_code=409, detail="Encrypted migration replacement mismatch")

    for model in LEGACY_DELETE_ORDER:
        db.query(model).filter(model.user_id == user_id).delete(synchronize_session=False)
    set_migration_status(
        db,
        user_id,
        status="completed",
        legacy_counts=actual_counts,
        encrypted_counts=collection_counts(db, user_id),
    )
    return migration


def set_migration_status(
    db: Session,
    user_id: int,
    *,
    status: str,
    legacy_counts: dict[str, int] | None = None,
    encrypted_counts: dict[str, int] | None = None,
    error_message: str | None = None,
) -> UserCryptoMigration:
    allowed = {"none", "vault_ready", "in_progress", "verified", "completed", "failed"}
    if status not in allowed:
        raise HTTPException(status_code=400, detail="Invalid migration status")
    row = get_or_create_migration(db, user_id)
    row.status = status
    row.updated_at = utc_now()
    if legacy_counts is not None:
        row.legacy_counts_json = json.dumps(legacy_counts)
    if encrypted_counts is not None:
        row.encrypted_counts_json = json.dumps(encrypted_counts)
    if error_message is not None:
        row.error_message = error_message
    if status == "verified":
        row.verified_at = utc_now()
    if status == "completed":
        row.completed_at = utc_now()
        row.error_message = None
    return row


def wipe_encrypted_user_data(db: Session, user_id: int) -> None:
    db.query(EncryptedRecordIndex).filter(EncryptedRecordIndex.user_id == user_id).delete(
        synchronize_session=False
    )
    db.query(EncryptedRecord).filter(EncryptedRecord.user_id == user_id).delete(
        synchronize_session=False
    )
    db.query(UserVault).filter(UserVault.user_id == user_id).delete(synchronize_session=False)
    db.query(UserCryptoMigration).filter(UserCryptoMigration.user_id == user_id).delete(
        synchronize_session=False
    )
