import os

os.environ["DATABASE_URL"] = "sqlite:///:memory:"

from datetime import date

import pytest
from fastapi.testclient import TestClient
from conftest import authenticated_client
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
    return authenticated_client(app)


def test_list_create_update_delete_liability(client):
    assert client.get("/api/liabilities/").json() == []

    created = client.post(
        "/api/liabilities/",
        json={
            "name": "Visa",
            "category": "credit_card",
            "balance_owed": 800.25,
            "as_of_date": str(date.today()),
        },
    )
    assert created.status_code == 200
    liability_id = created.json()["id"]
    assert created.json()["balance_owed"] == 800.25

    listed = client.get("/api/liabilities/").json()
    assert len(listed) == 1

    updated = client.put(
        f"/api/liabilities/{liability_id}",
        json={"balance_owed": 500},
    )
    assert updated.status_code == 200
    assert updated.json()["balance_owed"] == 500

    deleted = client.delete(f"/api/liabilities/{liability_id}")
    assert deleted.status_code == 200
    assert client.get("/api/liabilities/").json() == []


def test_liability_not_found_404(client):
    assert client.put("/api/liabilities/999", json={"name": "x"}).status_code == 404
    assert client.delete("/api/liabilities/999").status_code == 404