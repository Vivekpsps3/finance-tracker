import base64
import os

os.environ["DATABASE_URL"] = "sqlite:///:memory:"

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete

from conftest import authenticated_client
from main import Base, app, engine
from models import UserRole


@pytest.fixture(autouse=True)
def reset_db():
    Base.metadata.create_all(bind=engine)
    with engine.begin() as conn:
        for table in reversed(Base.metadata.sorted_tables):
            conn.execute(delete(table))


def _b64(n: int = 32) -> str:
    return base64.b64encode(b"x" * n).decode("ascii")


def test_admin_sql_disabled():
    client = authenticated_client(app, email="admin-sql@example.com", role=UserRole.admin)
    res = client.post("/api/admin/sql", json={"sql": "SELECT 1"})
    assert res.status_code == 403
    assert "disabled" in res.json()["detail"].lower()


def test_vault_setup_and_record_roundtrip():
    client = authenticated_client(app, email="vault@example.com")
    status = client.get("/api/vault/status")
    assert status.status_code == 200
    body = status.json()
    assert body["exists"] is False
    assert body["migrated"] is False

    setup = client.post(
        "/api/vault/setup",
        json={
            "kdf_algorithm": "PBKDF2",
            "kdf_salt_b64": _b64(16),
            "kdf_iterations": 310000,
            "wrapped_dek_b64": _b64(48),
            "recovery_wrapped_dek_b64": _b64(48),
            "key_version": 1,
        },
    )
    assert setup.status_code == 200, setup.text
    assert setup.json()["exists"] is True
    assert setup.json()["migration_status"] == "vault_ready"

    upsert = client.post(
        "/api/vault/records/upsert",
        json={
            "records": [
                {
                    "collection": "assets",
                    "client_id": "asset-001",
                    "ciphertext_b64": _b64(64),
                    "schema_version": 1,
                    "key_version": 1,
                    "indexes": [
                        {
                            "index_name": "dedupe",
                            "index_value_b64": _b64(32),
                        }
                    ],
                }
            ]
        },
    )
    assert upsert.status_code == 200, upsert.text
    rows = upsert.json()
    assert len(rows) == 1
    assert rows[0]["client_id"] == "asset-001"
    assert rows[0]["revision"] == 1

    listed = client.get("/api/vault/records?collection=assets")
    assert listed.status_code == 200
    assert len(listed.json()) == 1
    assert "ciphertext_b64" in listed.json()[0]

    conflict = client.post(
        "/api/vault/records/upsert",
        json={
            "records": [
                {
                    "collection": "assets",
                    "client_id": "asset-001",
                    "ciphertext_b64": _b64(64),
                    "expected_revision": 99,
                }
            ]
        },
    )
    assert conflict.status_code == 409

    ok = client.post(
        "/api/vault/records/upsert",
        json={
            "records": [
                {
                    "collection": "assets",
                    "client_id": "asset-001",
                    "ciphertext_b64": _b64(80),
                    "expected_revision": 1,
                }
            ]
        },
    )
    assert ok.status_code == 200
    assert ok.json()[0]["revision"] == 2

    counts = client.get("/api/vault/counts")
    assert counts.status_code == 200
    assert counts.json()["counts"]["assets"] == 1


def test_migration_completion_blocks_legacy_and_wipes_plaintext():
    client = authenticated_client(app, email="migrate@example.com")

    created = client.post(
        "/api/assets/",
        json={
            "name": "Secret Cash",
            "category": "cash",
            "current_value": 1234.56,
            "as_of_date": "2026-01-01",
            "notes": "sensitive",
        },
    )
    assert created.status_code in (200, 201), created.text

    setup = client.post(
        "/api/vault/setup",
        json={
            "kdf_algorithm": "PBKDF2",
            "kdf_salt_b64": _b64(16),
            "kdf_iterations": 310000,
            "wrapped_dek_b64": _b64(48),
            "recovery_wrapped_dek_b64": _b64(48),
        },
    )
    assert setup.status_code == 200

    enc = client.post(
        "/api/vault/records/upsert",
        json={
            "records": [
                {
                    "collection": "assets",
                    "client_id": "migrated-asset-1",
                    "ciphertext_b64": _b64(96),
                }
            ]
        },
    )
    assert enc.status_code == 200

    verified = client.put(
        "/api/vault/migration",
        json={
            "status": "verified",
            "legacy_counts": {"assets": 1},
            "encrypted_counts": {"assets": 1},
        },
    )
    assert verified.status_code == 200
    assert verified.json()["status"] == "verified"

    completed = client.put(
        "/api/vault/migration",
        json={
            "status": "completed",
            "legacy_counts": {"assets": 1},
            "encrypted_counts": {"assets": 1},
        },
    )
    assert completed.status_code == 200
    assert completed.json()["status"] == "completed"

    blocked = client.get("/api/assets/")
    assert blocked.status_code == 410

    nw = client.get("/api/net-worth/")
    assert nw.status_code == 410

    listed = client.get("/api/vault/records?collection=assets")
    assert listed.status_code == 200
    assert len(listed.json()) == 1
