import os

os.environ["DATABASE_URL"] = "sqlite:///:memory:"

import pytest
from conftest import authenticated_client
from sqlalchemy import delete

from import_parsers.citi import parse_citi_csv
from main import Base, app, engine, market_data

SAMPLE_CSV = """Status,Date,Description,Debit,Credit,Member Name
Cleared,07/02/2026,"COSTCO WHSE #1225 REDMOND WA",44.39,,RAGHAVA VIV PANCHAGNULA
Cleared,07/02/2026,"COSTCO WHSE #1225 REDMOND WA",22.07,,RAGHAVA VIV PANCHAGNULA
Cleared,07/01/2026,"MAYURI FOODS REDMOND WA",16.72,,RAGHAVA VIV PANCHAGNULA
Cleared,07/01/2026,"AUTOPAY 251003011142759RAUTOPAY AUTO-PMT",,-179.60,RAGHAVA VIV PANCHAGNULA
Cleared,06/30/2026,"COSTCO GAS #1225 REDMOND WA",45.77,,RAGHAVA VIV PANCHAGNULA
Pending,06/30/2026,"SHOULD SKIP PENDING",10.00,,RAGHAVA VIV PANCHAGNULA
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


def test_parse_citi_imports_debits_skips_credits_and_pending():
    rows = parse_citi_csv(SAMPLE_CSV)
    assert len(rows) == 4
    costco_rows = [r for r in rows if "COSTCO" in r.description]
    assert len(costco_rows) == 3
    assert all(r.category == "Costco" for r in costco_rows)
    mayuri = next(r for r in rows if "MAYURI" in r.description)
    assert mayuri.category == "Uncategorized"
    assert mayuri.amount == 16.72
    assert mayuri.account_mask == "RAGHAVA VIV PANCHAGNULA"


def test_parse_citi_missing_headers_raises():
    with pytest.raises(ValueError, match="Missing required columns"):
        parse_citi_csv("Date,Amount\n2026-01-01,10\n")


def test_citi_preview_and_commit_does_not_change_net_worth(client):
    nw_before = client.get("/api/net-worth/").json()["total"]

    files = {"file": ("citi.csv", SAMPLE_CSV, "text/csv")}
    preview = client.post("/api/imports/citi/preview", files=files)
    assert preview.status_code == 200
    body = preview.json()
    assert body["bank"] == "Citi"
    assert body["summary"]["total_parsed"] == 4
    assert body["summary"]["new"] == 4

    commit = client.post(
        "/api/imports/citi/commit",
        json={"filename": "citi.csv", "rows": commit_rows(body["rows"])},
    )
    assert commit.status_code == 200
    assert commit.json()["inserted"] == 4

    txs = client.get("/api/transactions/").json()
    assert len(txs) == 4
    assert {tx["type"] for tx in txs} == {"expense"}
    assert sum(1 for tx in txs if tx["category"] == "Costco") == 3

    nw_after = client.get("/api/net-worth/").json()
    assert nw_after["total"] == nw_before

    list_banks = client.get("/api/imports/banks")
    assert any(b["slug"] == "citi" for b in list_banks.json())


def test_citi_second_commit_skips_duplicate_dedupe_key(client):
    preview = client.post(
        "/api/imports/citi/preview",
        files={"file": ("citi.csv", SAMPLE_CSV, "text/csv")},
    )
    body = preview.json()
    commit_body = {"filename": "citi.csv", "rows": commit_rows(body["rows"])}

    first = client.post("/api/imports/citi/commit", json=commit_body)
    assert first.json()["inserted"] == 4

    second = client.post("/api/imports/citi/commit", json=commit_body)
    assert second.json()["inserted"] == 0
    assert second.json()["skipped"] == 4