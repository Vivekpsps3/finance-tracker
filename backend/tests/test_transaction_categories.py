import os

os.environ["DATABASE_URL"] = "sqlite:///:memory:"

import pytest
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


def create_tx(client, category: str):
    return client.post(
        "/api/transactions/",
        json={
            "date": "2026-07-01",
            "type": "expense",
            "category": category,
            "amount": 10,
            "description": category,
        },
    )


def test_bulk_rename_transaction_categories(client):
    assert create_tx(client, "General Merchandise").status_code == 200
    assert create_tx(client, "General Services").status_code == 200
    assert create_tx(client, "Food And Drink").status_code == 200

    response = client.put(
        "/api/transactions/categories/bulk-rename",
        json={
            "renames": [
                {"from_category": "General Merchandise", "to_category": "Shopping"},
                {"from_category": "Food And Drink", "to_category": "Food & Drink"},
                {"from_category": "General Services", "to_category": "General Services"},
                {"from_category": "Missing", "to_category": "Other"},
            ]
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["updated"] == 2
    assert body["renames"] == [
        {"from_category": "General Merchandise", "to_category": "Shopping", "updated": 1},
        {"from_category": "Food And Drink", "to_category": "Food & Drink", "updated": 1},
        {"from_category": "Missing", "to_category": "Other", "updated": 0},
    ]

    categories = {tx["description"]: tx["category"] for tx in client.get("/api/transactions/").json()}
    assert categories["General Merchandise"] == "Shopping"
    assert categories["Food And Drink"] == "Food & Drink"
    assert categories["General Services"] == "General Services"
