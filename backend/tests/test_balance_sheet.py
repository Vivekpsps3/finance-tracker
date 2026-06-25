import os

os.environ["DATABASE_URL"] = "sqlite:///:memory:"

from datetime import date

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


def test_asset_and_liability_affect_net_worth(client, monkeypatch):
    def fake_price(symbol, force_refresh=False, db=None):
        return 100.0, "live", None

    monkeypatch.setattr("main.market_data.get_price", fake_price)

    client.post(
        "/api/holdings/",
        json={
            "symbol": "AAPL",
            "shares": 1,
            "purchase_price": 50,
            "purchase_date": str(date.today()),
        },
    )
    client.post(
        "/api/assets/",
        json={
            "name": "Checking",
            "category": "checking",
            "current_value": 10000,
            "as_of_date": str(date.today()),
        },
    )
    client.post(
        "/api/liabilities/",
        json={
            "name": "Credit card",
            "category": "credit_card",
            "balance_owed": 2000,
            "as_of_date": str(date.today()),
        },
    )

    nw = client.get("/api/net-worth/").json()
    assert nw["other_assets"] == 10000
    assert nw["portfolio"] == 100
    assert nw["liabilities"] == 2000
    assert nw["total_assets"] == 10100
    assert nw["total"] == 8100


def test_expense_transaction_does_not_change_net_worth(client):
    client.post(
        "/api/transactions/",
        json={
            "date": str(date.today()),
            "type": "expense",
            "category": "Food",
            "amount": 120,
        },
    )
    nw = client.get("/api/net-worth/").json()
    assert nw["total"] == 0


def test_income_transaction_does_not_change_net_worth(client):
    client.post(
        "/api/transactions/",
        json={
            "date": str(date.today()),
            "type": "income",
            "category": "Salary",
            "amount": 5000,
        },
    )
    nw = client.get("/api/net-worth/").json()
    assert nw["total"] == 0
    assert nw["other_assets"] == 0