import os

os.environ["DATABASE_URL"] = "sqlite:///:memory:"

import pytest
from conftest import authenticated_client
from sqlalchemy import delete

from import_parsers.chase import parse_chase_csv
from main import Base, app, engine, market_data

SAMPLE_CSV = """Transaction Date,Post Date,Description,Category,Type,Amount,Memo
04/26/2026,04/26/2026,Payment Thank You-Mobile,,Payment,3.00,
04/19/2026,04/20/2026,ORCA*00QN2SD,Travel,Sale,-3.00,
04/02/2026,04/02/2026,AUTOMATIC PAYMENT - THANK,,Payment,30.00,
02/22/2026,02/24/2026,WESTIN AUSTIN DOWNTOWN,Travel,Sale,-30.00,
08/23/2025,08/24/2025,COSTCO WHSE #0001,Shopping,Sale,-74.16,
08/18/2025,08/20/2025,FLATSTICK PUB REDMOND,Food & Drink,Sale,-14.31,
"""

BLANK_CATEGORY_CSV = """Transaction Date,Post Date,Description,Category,Type,Amount,Memo
04/19/2026,04/20/2026,MERCHANT,,Sale,-3.00,
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


def test_parse_chase_imports_negative_sales_and_skips_payments():
    rows = parse_chase_csv(SAMPLE_CSV)
    assert len(rows) == 4
    assert rows[0].date.isoformat() == "2026-04-19"
    assert rows[0].amount == 3.00
    assert rows[0].category == "Travel"
    assert rows[0].description == "ORCA*00QN2SD"
    assert rows[0].account_mask == "chase"
    assert {row.description for row in rows} == {
        "ORCA*00QN2SD",
        "WESTIN AUSTIN DOWNTOWN",
        "COSTCO WHSE #0001",
        "FLATSTICK PUB REDMOND",
    }
    costco = next(r for r in rows if r.description == "COSTCO WHSE #0001")
    assert costco.category == "Costco"


def test_parse_chase_blank_category_defaults_to_uncategorized():
    rows = parse_chase_csv(BLANK_CATEGORY_CSV)
    assert len(rows) == 1
    assert rows[0].category == "Uncategorized"


def test_parse_chase_missing_headers_raises():
    with pytest.raises(ValueError, match="Missing required columns"):
        parse_chase_csv("Date,Amount\n2026-01-01,-10\n")


def test_chase_preview_and_commit_does_not_change_net_worth(client):
    nw_before = client.get("/api/net-worth/").json()["total"]

    files = {"file": ("chase.csv", SAMPLE_CSV, "text/csv")}
    preview = client.post("/api/imports/chase/preview", files=files)
    assert preview.status_code == 200
    body = preview.json()
    assert body["bank"] == "Chase"
    assert body["summary"]["total_parsed"] == 4
    assert body["summary"]["new"] == 4
    assert body["summary"]["duplicate"] == 0
    assert body["rows"][0]["account_mask"] == "chase"
    assert body["rows"][0]["account_display"] == "Chase ···chase"

    commit = client.post(
        "/api/imports/chase/commit",
        json={
            "filename": "chase.csv",
            "rows": commit_rows(body["rows"]),
        },
    )
    assert commit.status_code == 200
    assert commit.json()["inserted"] == 4

    txs = client.get("/api/transactions/").json()
    assert len(txs) == 4
    assert {tx["type"] for tx in txs} == {"expense"}
    assert {tx["source"] for tx in txs} == {"import"}
    assert {tx["account_display"] for tx in txs} == {"Chase ···chase"}

    nw_after = client.get("/api/net-worth/").json()
    assert nw_after["total"] == nw_before

    list_banks = client.get("/api/imports/banks")
    assert list_banks.status_code == 200
    assert any(b["slug"] == "chase" for b in list_banks.json())


def test_chase_second_commit_skips_duplicate_dedupe_key(client):
    preview = client.post(
        "/api/imports/chase/preview",
        files={"file": ("chase.csv", SAMPLE_CSV, "text/csv")},
    )
    assert preview.status_code == 200
    body = preview.json()
    commit_body = {"filename": "chase.csv", "rows": commit_rows(body["rows"])}

    first = client.post("/api/imports/chase/commit", json=commit_body)
    assert first.status_code == 200
    assert first.json()["inserted"] == 4

    second = client.post("/api/imports/chase/commit", json=commit_body)
    assert second.status_code == 200
    assert second.json()["inserted"] == 0
    assert second.json()["skipped"] == 4
    assert len(client.get("/api/transactions/").json()) == 4


def test_chase_preview_rejects_bad_header(client):
    bad = "Date,Amount\n2026-01-01,-10\n"
    r = client.post(
        "/api/imports/chase/preview",
        files={"file": ("bad.csv", bad, "text/csv")},
    )
    assert r.status_code == 400
    assert "Missing required columns" in r.json()["detail"]
