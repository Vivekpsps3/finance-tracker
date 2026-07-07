from __future__ import annotations

from typing import Any

from fastapi import HTTPException
from sqlalchemy import inspect, text
from sqlalchemy.orm import Session

from models import (
    Asset,
    AuditEvent,
    BankAccount,
    BrokerageAccount,
    EncryptedRecord,
    EncryptedRecordIndex,
    FixedExpense,
    Holding,
    ImportBatch,
    JobIncome,
    Liability,
    NetWorthSnapshot,
    PlanningAssumptionProfile,
    PlanningScenarioRun,
    Subscription,
    Transaction,
    User,
    UserCryptoMigration,
    UserSession,
    UserVault,
)

USER_OWNED_MODELS = [
    Transaction,
    BankAccount,
    ImportBatch,
    Asset,
    Liability,
    NetWorthSnapshot,
    Holding,
    BrokerageAccount,
    JobIncome,
    FixedExpense,
    Subscription,
    PlanningAssumptionProfile,
    PlanningScenarioRun,
]

def admin_metrics(db: Session) -> dict[str, Any]:
    users = db.query(User).all()
    active_users = sum(1 for u in users if u.is_active)
    admins = sum(1 for u in users if (u.role.value if hasattr(u.role, "value") else str(u.role)) == "admin")
    totals = {
        "users": len(users),
        "active_users": active_users,
        "admins": admins,
        "sessions": db.query(UserSession).count(),
        "active_sessions": db.query(UserSession).filter(UserSession.revoked_at.is_(None)).count(),
        "audit_events": db.query(AuditEvent).count(),
    }
    finance_rows = {model.__tablename__: db.query(model).count() for model in USER_OWNED_MODELS}
    finance_rows["encrypted_records"] = db.query(EncryptedRecord).count()
    finance_rows["user_vaults"] = db.query(UserVault).count()
    per_user = []
    for user in users:
        migration = (
            db.query(UserCryptoMigration)
            .filter(UserCryptoMigration.user_id == user.id)
            .one_or_none()
        )
        row = {
            "id": user.id,
            "email": user.email,
            "display_name": user.display_name,
            "role": user.role.value if hasattr(user.role, "value") else str(user.role),
            "is_active": user.is_active,
            "crypto_migration_status": migration.status if migration else "none",
            "has_vault": db.query(UserVault).filter(UserVault.user_id == user.id).count() > 0,
            "encrypted_records": db.query(EncryptedRecord).filter(EncryptedRecord.user_id == user.id).count(),
        }
        row.update({model.__tablename__: db.query(model).filter(model.user_id == user.id).count() for model in USER_OWNED_MODELS})
        per_user.append(row)
    inspector = inspect(db.bind)
    tables = []
    for table in inspector.get_table_names():
        try:
            count = db.execute(text(f'SELECT COUNT(*) FROM "{table}"')).scalar_one()
        except Exception:
            count = None
        tables.append({"name": table, "rows": count})
    return {"totals": totals, "finance_rows": finance_rows, "per_user": per_user, "tables": tables}


def execute_admin_sql(db: Session, sql: str) -> dict[str, Any]:
    # Server-blind storage: admins must not query finance plaintext or ciphertext payloads.
    raise HTTPException(
        status_code=403,
        detail="Admin SQL console is disabled. Use metrics counts and account tools only.",
    )


def reset_user_contents(db: Session, user: User, *, actor_user_id: int, revoke_sessions: bool = True) -> None:
    for model in USER_OWNED_MODELS:
        db.query(model).filter(model.user_id == user.id).delete(synchronize_session=False)
    db.query(EncryptedRecordIndex).filter(EncryptedRecordIndex.user_id == user.id).delete(synchronize_session=False)
    db.query(EncryptedRecord).filter(EncryptedRecord.user_id == user.id).delete(synchronize_session=False)
    db.query(UserVault).filter(UserVault.user_id == user.id).delete(synchronize_session=False)
    db.query(UserCryptoMigration).filter(UserCryptoMigration.user_id == user.id).delete(synchronize_session=False)
    if revoke_sessions:
        db.query(UserSession).filter(UserSession.user_id == user.id).delete(synchronize_session=False)
    audit = AuditEvent(
        actor_user_id=actor_user_id,
        target_user_id=user.id,
        event_type="user_contents_reset",
        detail=f"reset_user_email={user.email}",
    )
    db.add(audit)


def delete_user_account(db: Session, user: User, *, actor_user_id: int) -> None:
    for model in USER_OWNED_MODELS:
        db.query(model).filter(model.user_id == user.id).delete(synchronize_session=False)
    db.query(EncryptedRecordIndex).filter(EncryptedRecordIndex.user_id == user.id).delete(synchronize_session=False)
    db.query(EncryptedRecord).filter(EncryptedRecord.user_id == user.id).delete(synchronize_session=False)
    db.query(UserVault).filter(UserVault.user_id == user.id).delete(synchronize_session=False)
    db.query(UserCryptoMigration).filter(UserCryptoMigration.user_id == user.id).delete(synchronize_session=False)
    db.query(UserSession).filter(UserSession.user_id == user.id).delete(synchronize_session=False)
    db.query(AuditEvent).filter(AuditEvent.actor_user_id == user.id).update(
        {AuditEvent.actor_user_id: None}, synchronize_session=False
    )
    db.query(AuditEvent).filter(AuditEvent.target_user_id == user.id).update(
        {AuditEvent.target_user_id: None}, synchronize_session=False
    )
    audit = AuditEvent(
        actor_user_id=actor_user_id,
        target_user_id=None,
        event_type="user_deleted",
        detail=f"deleted_user_email={user.email}",
    )
    db.add(audit)
    db.delete(user)
