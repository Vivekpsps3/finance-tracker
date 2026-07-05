import os

os.environ["DATABASE_URL"] = "sqlite:///:memory:"

import pytest
from conftest import authenticated_client
from sqlalchemy import delete

from import_parsers.amex import parse_amex_csv
from main import Base, app, engine, market_data

SAMPLE_CSV = """Date,Description,Card Member,Account #,Amount
06/27/2026,SEATTLE METER PARKINSEATTLE             WA,VIVEK PANCHAGNULA,-61000,4.00
06/21/2026,SWAGATH HOME FOODS  REDMOND             WA,VIVEK PANCHAGNULA,-61000,33.47
06/21/2026,WHOLE FOODS MARKET  REDMOND             WA,VIVEK PANCHAGNULA,-61000,37.01
"""

WITH_CATEGORY_CSV = """Date,Description,Card Member,Account #,Amount,Extended Details,Category,Ignored
06/27/2026,SEATTLE METER PARKINSEATTLE             WA,VIVEK PANCHAGNULA,-61000,4.00,"line one
line two",Other-Government Services,ignored
06/21/2026,SWAGATH HOME FOODS  REDMOND             WA,VIVEK PANCHAGNULA,-61000,33.47,details,Merchandise & Supplies-Groceries,ignored
06/21/2026,YOUR CASH REWARD/REFUND IS,VIVEK PANCHAGNULA,-61000,-11.23,details,Fees & Adjustments-Fees & Adjustments,ignored
"""

NO_CARD_MEMBER_CSV = """Date,Description,Account #,Amount,Extra Column
06/27/2026,SEATTLE METER PARKINSEATTLE             WA,-61000,4.00,ignored
06/28/2026,CREDIT TEST,-61000,-2.00,ignored
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


def test_parse_amex_imports_positive_amounts():
    rows = parse_amex_csv(SAMPLE_CSV)
    assert len(rows) == 3
    assert rows[0].date.isoformat() == "2026-06-27"
    assert rows[0].description == "SEATTLE METER PARKINSEATTLE WA"
    assert rows[0].account_mask == "61000"
    assert rows[0].amount == 4.00
    assert {row.category for row in rows} == {"Uncategorized"}


def test_parse_amex_uses_category_when_present():
    rows = parse_amex_csv(WITH_CATEGORY_CSV)
    assert len(rows) == 2
    assert rows[0].category == "Other-Government Services"
    assert rows[1].category == "Merchandise & Supplies-Groceries"


def test_parse_amex_card_member_optional_and_extra_columns_ignored():
    rows = parse_amex_csv(NO_CARD_MEMBER_CSV)
    assert len(rows) == 1
    assert rows[0].description == "SEATTLE METER PARKINSEATTLE WA"
    assert rows[0].account_mask == "61000"
    assert rows[0].amount == 4.00


def test_parse_amex_missing_headers_raises():
    with pytest.raises(ValueError, match="Missing required columns"):
        parse_amex_csv("Date,Amount\n2026-01-01,10\n")


def test_amex_preview_and_commit_does_not_change_net_worth(client):
    nw_before = client.get("/api/net-worth/").json()["total"]

    files = {"file": ("amex.csv", SAMPLE_CSV, "text/csv")}
    preview = client.post("/api/imports/amex/preview", files=files)
    assert preview.status_code == 200
    body = preview.json()
    assert body["bank"] == "American Express"
    assert body["summary"]["total_parsed"] == 3
    assert body["summary"]["new"] == 3
    assert body["rows"][0]["account_mask"] == "61000"
    assert body["rows"][0]["account_display"] == "American Express ···61000"

    commit = client.post(
        "/api/imports/amex/commit",
        json={"filename": "amex.csv", "rows": commit_rows(body["rows"])},
    )
    assert commit.status_code == 200
    assert commit.json()["inserted"] == 3

    txs = client.get("/api/transactions/").json()
    assert len(txs) == 3
    assert {tx["type"] for tx in txs} == {"expense"}
    assert {tx["source"] for tx in txs} == {"import"}
    assert {tx["account_display"] for tx in txs} == {"American Express ···61000"}

    nw_after = client.get("/api/net-worth/").json()
    assert nw_after["total"] == nw_before

    list_banks = client.get("/api/imports/banks")
    assert list_banks.status_code == 200
    assert any(b["slug"] == "amex" for b in list_banks.json())
