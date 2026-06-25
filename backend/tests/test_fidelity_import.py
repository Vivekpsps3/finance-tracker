import os

os.environ["DATABASE_URL"] = "sqlite:///:memory:"

from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete

from import_parsers.fidelity import parse_fidelity_csv
from main import Base, app, engine, market_data

SAMPLE_CSV = """Account Number,Account Name,Symbol,Description,Quantity,Average Cost Basis
Z111,Individual,SPAXX**,CASH,,,
Z111,Individual,VOO,VOO ETF,2,$500.00
Z222,Roth IRA,VT,VT ETF,1,100
"""

MINIMAL_HEADERS_CSV = """Account Number,Account Name,Symbol,Quantity,Average Cost Basis
ACC1,Brokerage,AAPL,10,150
"""


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


def test_parse_fidelity_skips_zero_quantity_and_spaxx():
    rows = parse_fidelity_csv(SAMPLE_CSV)
    assert len(rows) == 2
    symbols = {r.symbol for r in rows}
    assert symbols == {"VOO", "VT"}
    voo = next(r for r in rows if r.symbol == "VOO")
    assert voo.account_mask == "Z111"
    assert voo.shares == 2.0


def test_parse_fidelity_requires_headers():
    with pytest.raises(ValueError, match="Missing required columns"):
        parse_fidelity_csv("Symbol,Quantity\nAAPL,1\n")


def test_fidelity_preview_lists_accounts_and_rows(client):
    files = {"file": ("fidelity.csv", MINIMAL_HEADERS_CSV, "text/csv")}
    preview = client.post("/api/imports/fidelity/preview", files=files)
    assert preview.status_code == 200
    body = preview.json()
    assert body["summary"]["accounts"] == 1
    assert body["summary"]["positions"] == 1
    assert body["rows"][0]["symbol"] == "AAPL"
    assert "Fidelity" in body["rows"][0]["account_display"]


def test_fidelity_commit_replaces_scoped_account_only(client, monkeypatch):
    def fake_price(symbol, force_refresh=False, db=None):
        return 100.0, "live", None

    monkeypatch.setattr("main.market_data.get_price", fake_price)

    manual = client.post(
        "/api/holdings/",
        json={
            "symbol": "MANUAL",
            "shares": 1,
            "purchase_price": 10,
            "purchase_date": str(date.today()),
        },
    )
    assert manual.status_code == 200

    files = {"file": ("fidelity.csv", MINIMAL_HEADERS_CSV, "text/csv")}
    preview = client.post("/api/imports/fidelity/preview", files=files).json()
    commit = client.post(
        "/api/imports/fidelity/commit",
        json={
            "filename": "fidelity.csv",
            "rows": [
                {
                    "account_mask": preview["rows"][0]["account_mask"],
                    "symbol": preview["rows"][0]["symbol"],
                    "shares": preview["rows"][0]["shares"],
                    "avg_cost_basis": preview["rows"][0]["avg_cost_basis"],
                }
            ],
        },
    )
    assert commit.status_code == 200
    assert commit.json()["inserted"] == 1

    holdings = client.get("/api/holdings/").json()
    symbols = {h["symbol"] for h in holdings}
    assert "MANUAL" in symbols
    assert "AAPL" in symbols


def test_fidelity_commit_changes_net_worth_via_portfolio(client, monkeypatch):
    def fake_price(symbol, force_refresh=False, db=None):
        prices = {"AAPL": 200.0}
        return prices.get(symbol.upper(), 50.0), "live", None

    monkeypatch.setattr("main.market_data.get_price", fake_price)

    nw_before = client.get("/api/net-worth/").json()["total"]

    preview = client.post(
        "/api/imports/fidelity/preview",
        files={"file": ("f.csv", MINIMAL_HEADERS_CSV, "text/csv")},
    ).json()
    client.post(
        "/api/imports/fidelity/commit",
        json={
            "filename": "f.csv",
            "rows": [
                {
                    "account_mask": preview["rows"][0]["account_mask"],
                    "symbol": "AAPL",
                    "shares": 10,
                    "avg_cost_basis": 150,
                }
            ],
        },
    )

    nw_after = client.get("/api/net-worth/").json()
    assert nw_after["portfolio"] == 2000.0
    assert nw_after["total"] == nw_before + 2000.0


def test_fidelity_second_commit_replaces_not_appends(client, monkeypatch):
    monkeypatch.setattr(
        "main.market_data.get_price",
        lambda symbol, force_refresh=False, db=None: (10.0, "live", None),
    )

    def commit_symbol(symbol: str):
        preview = client.post(
            "/api/imports/fidelity/preview",
            files={
                "file": (
                    "f.csv",
                    f"Account Number,Account Name,Symbol,Quantity,Average Cost Basis\n"
                    f"ACC1,Brokerage,{symbol},1,10\n",
                    "text/csv",
                ),
            },
        ).json()
        return client.post(
            "/api/imports/fidelity/commit",
            json={
                "filename": "f.csv",
                "rows": [
                    {
                        "account_mask": "ACC1",
                        "symbol": symbol,
                        "shares": 1,
                        "avg_cost_basis": 10,
                    }
                ],
            },
        )

    commit_symbol("AAA")
    commit_symbol("BBB")
    holdings = client.get("/api/holdings/").json()
    brokerage = [h for h in holdings if h.get("brokerage_account_id")]
    assert len(brokerage) == 1
    assert brokerage[0]["symbol"] == "BBB"