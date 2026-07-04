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


def test_list_create_update_delete_asset(client):
    assert client.get("/api/assets/").json() == []

    created = client.post(
        "/api/assets/",
        json={
            "name": "Checking",
            "category": "checking",
            "current_value": 1500.5,
            "as_of_date": str(date.today()),
            "notes": "Primary",
        },
    )
    assert created.status_code == 200
    asset_id = created.json()["id"]
    assert created.json()["name"] == "Checking"
    assert created.json()["current_value"] == 1500.5

    listed = client.get("/api/assets/").json()
    assert len(listed) == 1
    assert listed[0]["id"] == asset_id

    updated = client.put(
        f"/api/assets/{asset_id}",
        json={"name": "Checking (updated)", "current_value": 2000},
    )
    assert updated.status_code == 200
    assert updated.json()["name"] == "Checking (updated)"
    assert updated.json()["current_value"] == 2000

    deleted = client.delete(f"/api/assets/{asset_id}")
    assert deleted.status_code == 200
    assert deleted.json() == {"ok": True}
    assert client.get("/api/assets/").json() == []


def test_asset_not_found_404(client):
    assert client.put("/api/assets/999", json={"name": "x"}).status_code == 404
    assert client.delete("/api/assets/999").status_code == 404