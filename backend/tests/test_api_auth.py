import os

os.environ["DATABASE_URL"] = "sqlite:///:memory:"

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete

from main import Base, app, engine, market_data


@pytest.fixture(autouse=True)
def reset_db():
    Base.metadata.create_all(bind=engine)
    market_data.clear_memory_cache()
    with engine.begin() as conn:
        for table in reversed(Base.metadata.sorted_tables):
            conn.execute(delete(table))


@pytest.fixture
def client():
    return TestClient(app)


def test_no_key_required_when_api_key_unset(client, monkeypatch):
    monkeypatch.delenv("API_KEY", raising=False)
    monkeypatch.delenv("FINANCE_API_KEY", raising=False)
    r = client.get("/api/transactions/")
    assert r.status_code == 200


def test_health_exempt_when_api_key_set(client, monkeypatch):
    monkeypatch.setenv("API_KEY", "test-secret-key")
    monkeypatch.delenv("FINANCE_API_KEY", raising=False)
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_api_rejects_missing_key_when_set(client, monkeypatch):
    monkeypatch.setenv("API_KEY", "test-secret-key")
    r = client.get("/api/transactions/")
    assert r.status_code == 401


def test_api_accepts_x_api_key_header(client, monkeypatch):
    monkeypatch.setenv("API_KEY", "test-secret-key")
    r = client.get(
        "/api/transactions/",
        headers={"X-API-Key": "test-secret-key"},
    )
    assert r.status_code == 200


def test_api_accepts_bearer_token(client, monkeypatch):
    monkeypatch.setenv("FINANCE_API_KEY", "bearer-only-key")
    monkeypatch.delenv("API_KEY", raising=False)
    r = client.get(
        "/api/transactions/",
        headers={"Authorization": "Bearer bearer-only-key"},
    )
    assert r.status_code == 200