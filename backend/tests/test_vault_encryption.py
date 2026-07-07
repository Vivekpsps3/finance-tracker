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


def test_legacy_finance_api_gone_when_not_explicitly_allowed(monkeypatch):
    monkeypatch.delenv("ALLOW_LEGACY_FINANCE", raising=False)
    monkeypatch.setenv("ALLOW_LEGACY_FINANCE", "0")
    client = authenticated_client(app, email="legacy-gone@example.com")
    assert client.get("/api/assets/").status_code == 410
    assert client.get("/api/net-worth/").status_code == 410
    assert client.get("/api/transactions/").status_code == 410


def test_vault_setup_and_record_roundtrip():
    client = authenticated_client(app, email="vault@example.com")
    status = client.get("/api/vault/status")
    assert status.status_code == 200
    body = status.json()
    assert body["exists"] is False

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
    assert setup.json()["migrated"] is True
    assert setup.json()["migration_status"] == "completed"

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


def test_vault_setup_accepts_browser_packed_recovery_wrap():
    """Browser packs recovery as base64(salt).base64(iv||ciphertext)."""
    client = authenticated_client(app, email="vault-packed@example.com")
    setup = client.post(
        "/api/vault/setup",
        json={
            "kdf_algorithm": "PBKDF2",
            "kdf_salt_b64": "r9qDiTPiAKP3Ouf3/61xzQ==",
            "kdf_iterations": 310000,
            "wrapped_dek_b64": "LqGH7LVNXPcZ5h9kpbk1wRSWCAV/DlqD0LQ5AHn4UlRh7/qKd6EllAwQH7GbW3qevfadFIKzgBQgo7TA",
            "recovery_wrapped_dek_b64": (
                "bPvdPISm7G3VfHBXCUT+JQ==."
                "+JiKGYsPusAELZcxOlkK+0Ukn0FVo+urQM5/Xwb6/SU3a52qdE2YVWa3cZrX+6oOsHBY9LEC9Ca88n4o"
            ),
            "key_version": 1,
        },
    )
    assert setup.status_code == 200, setup.text
    assert setup.json()["exists"] is True
    assert setup.json()["migrated"] is True
