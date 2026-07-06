import os

os.environ["DATABASE_URL"] = "sqlite:///:memory:"

import pytest
from conftest import authenticated_client
from sqlalchemy import delete

from import_parsers.x_money import parse_x_money_csv
from main import Base, app, engine, market_data

SAMPLE_CSV = """Date,Account,Description,Type,Category,Amount,Status
6/24/2026,Main account,,Deposit,,$0.01,Completed
6/29/2026,Main account,GDP*JCB Concepts,Card Purchase,General Services,$-16.58,Completed
7/1/2026,Main account,Cashback Redemption,Cashback Rewards,,$0.49,Completed
7/1/2026,Main account,interest deposit,Interest Payout,,$8.49,Completed
7/2/2026,Main account,SPACE EXPLORATIO,External Deposit,General Services,$0.00,Completed
7/4/2026,Main account,,Deposit,,$3000.00,Completed
7/5/2026,Main account,WEB PMTS,Payment,Income,$-2596.13,Completed
7/6/2026,Main account,SQ *HAYTON FARMS BERRIES,Card Purchase,General Merchandise,$-11.00,Completed
7/6/2026,Main account,SQ *SECRET VALLEY PRODUCE,Card Purchase,Food And Drink,$-20.33,Completed
7/6/2026,Main account,SQ *MARKET MINIS,Card Purchase,Food And Drink,$-4.50,Completed
7/6/2026,Main account,SQ *HARBOR HERBALIST,Card Purchase,General Merchandise,$-46.30,Completed
7/6/2026,Main account,SQ *CAPITOL HILL FARMERS,Card Purchase,General Merchandise,$-6.00,Completed
7/6/2026,Main account,SQ *CHA NEW LIFE GARDEN L,Card Purchase,General Merchandise,$-3.50,Completed
7/6/2026,Main account,SQ *BAUTISTA FARMS,Card Purchase,General Merchandise,$-13.00,Completed
7/6/2026,Main account,SQ *YOUA HER LOR GARDEN,Card Purchase,General Merchandise,$-17.69,Completed
"""


def commit_rows(preview_rows):
    return [
        {
            "dedupe_key": row["dedupe_key"],
            "date": row["date"],
            "account_mask": row["account_mask"],
            "description": row["description"],
            "category": row["category"],
            "amount": row["amount"],
        }
        for row in preview_rows
    ]


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


def test_parse_x_money_imports_completed_card_purchases_only():
    rows = parse_x_money_csv(SAMPLE_CSV)

    assert len(rows) == 9
    assert rows[0].date.isoformat() == "2026-06-29"
    assert rows[0].account_mask == "Main account"
    assert rows[0].description == "GDP*JCB Concepts"
    assert rows[0].category == "General Services"
    assert rows[0].amount == 16.58
    assert {row.description for row in rows}.isdisjoint(
        {"Cashback Redemption", "interest deposit", "WEB PMTS", "SPACE EXPLORATIO"}
    )


def test_parse_x_money_skips_pending_and_positive_card_rows():
    csv = """Date,Account,Description,Type,Category,Amount,Status
7/1/2026,Main account,PENDING SHOP,Card Purchase,Shopping,$-10.00,Pending
7/2/2026,Main account,REFUND,Card Purchase,Shopping,$10.00,Completed
"""
    assert parse_x_money_csv(csv) == []


def test_parse_x_money_missing_headers_raises():
    with pytest.raises(ValueError, match="Missing required columns"):
        parse_x_money_csv("Date,Amount\n2026-01-01,-10\n")


def test_x_money_preview_and_commit_does_not_change_net_worth(client):
    nw_before = client.get("/api/net-worth/").json()["total"]

    preview = client.post(
        "/api/imports/x-money/preview",
        files={"file": ("x-money.csv", SAMPLE_CSV, "text/csv")},
    )
    assert preview.status_code == 200
    body = preview.json()
    assert body["bank"] == "X Money"
    assert body["summary"] == {"total_parsed": 9, "new": 9, "duplicate": 0}
    assert body["rows"][0]["account_display"] == "X Money ···Main account"

    commit = client.post(
        "/api/imports/x-money/commit",
        json={"filename": "x-money.csv", "rows": commit_rows(body["rows"])},
    )
    assert commit.status_code == 200
    assert commit.json()["inserted"] == 9

    txs = client.get("/api/transactions/").json()
    assert len(txs) == 9
    assert {tx["type"] for tx in txs} == {"expense"}
    assert {tx["source"] for tx in txs} == {"import"}

    nw_after = client.get("/api/net-worth/").json()
    assert nw_after["total"] == nw_before

    list_banks = client.get("/api/imports/banks")
    assert list_banks.status_code == 200
    assert any(b["slug"] == "x_money" for b in list_banks.json())


def test_x_money_second_commit_skips_duplicate_dedupe_key(client):
    preview = client.post(
        "/api/imports/x-money/preview",
        files={"file": ("x-money.csv", SAMPLE_CSV, "text/csv")},
    )
    assert preview.status_code == 200
    commit_body = {"filename": "x-money.csv", "rows": commit_rows(preview.json()["rows"])}

    first = client.post("/api/imports/x-money/commit", json=commit_body)
    assert first.status_code == 200
    assert first.json()["inserted"] == 9

    second = client.post("/api/imports/x-money/commit", json=commit_body)
    assert second.status_code == 200
    assert second.json()["inserted"] == 0
    assert second.json()["skipped"] == 9
