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


def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_transaction_crud_and_net_worth(client):
    payload = {
        "date": str(date.today()),
        "type": "income",
        "category": "Salary",
        "amount": 5000,
        "description": "Test",
    }
    create = client.post("/transactions/", json=payload)
    assert create.status_code == 200
    tx_id = create.json()["id"]

    listing = client.get("/transactions/")
    assert len(listing.json()) == 1

    nw = client.get("/net-worth/")
    assert nw.status_code == 200
    assert nw.json()["cash"] == 5000

    update = client.put(f"/transactions/{tx_id}", json={"amount": 4500})
    assert update.status_code == 200
    assert update.json()["amount"] == 4500

    delete = client.delete(f"/transactions/{tx_id}")
    assert delete.status_code == 200
    assert client.get("/transactions/").json() == []


def test_holding_uses_market_data_on_update(client, monkeypatch):
    def fake_price(symbol, force_refresh=False, db=None):
        return 100.0, "live", None

    monkeypatch.setattr("main.market_data.get_price", fake_price)

    create = client.post(
        "/holdings/",
        json={
            "symbol": "AAPL",
            "shares": 2,
            "purchase_price": 50,
            "purchase_date": str(date.today()),
        },
    )
    assert create.status_code == 200
    hid = create.json()["id"]
    assert create.json()["current_price"] == 100

    update = client.put(f"/holdings/{hid}", json={"shares": 3})
    assert update.status_code == 200
    assert update.json()["price_source"] in ("live", "cached", "fallback_purchase")
    assert update.json()["value"] == 300


def test_market_price_and_refresh_holdings(client, monkeypatch):
    def fake_price(symbol, force_refresh=False, db=None):
        return 42.5, "live", None

    monkeypatch.setattr("main.market_data.get_price", fake_price)

    quote = client.get("/market/price/MSFT", params={"refresh": True})
    assert quote.status_code == 200
    assert quote.json()["price"] == 42.5
    assert quote.json()["valid"] is True

    create = client.post(
        "/holdings/",
        json={
            "symbol": "MSFT",
            "shares": 1,
            "purchase_price": 40,
            "purchase_date": str(date.today()),
        },
    )
    hid = create.json()["id"]
    refreshed = client.post(f"/holdings/{hid}/refresh-price")
    assert refreshed.status_code == 200
    assert refreshed.json()["current_price"] == 42.5


def test_net_worth_history(client):
    client.post(
        "/transactions/",
        json={
            "date": "2026-01-01",
            "type": "income",
            "category": "Bonus",
            "amount": 1000,
        },
    )
    hist = client.get("/net-worth/history")
    assert hist.status_code == 200
    assert len(hist.json()) >= 1