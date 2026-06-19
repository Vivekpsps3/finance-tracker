import os

os.environ["DATABASE_URL"] = "sqlite:///:memory:"

from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete

from main import Base, app, engine, market_data
from import_parsers.capital_one import parse_capital_one_csv

SAMPLE_CSV = """Transaction Date,Posted Date,Card No.,Description,Category,Debit,Credit
2026-06-15,2026-06-16,3866,TST* TANDOORI FLAME,Dining,140.98,
2026-06-10,2026-06-11,3866,PAYMENT - THANK YOU,,,500.00
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


def test_parse_capital_one_skips_credits():
    rows = parse_capital_one_csv(SAMPLE_CSV)
    assert len(rows) == 1
    assert rows[0].amount == 140.98
    assert rows[0].category == "Dining"
    assert rows[0].account_mask == "3866"


def test_capital_one_preview_and_commit(client):
    files = {"file": ("capital.csv", SAMPLE_CSV, "text/csv")}
    preview = client.post("/imports/capital-one/preview", files=files)
    assert preview.status_code == 200
    body = preview.json()
    assert body["summary"]["new"] == 1
    assert body["rows"][0]["account_display"] == "Capital One ···3866"

    commit = client.post(
        "/imports/capital-one/commit",
        json={
            "filename": "capital.csv",
            "rows": [
                {
                    "dedupe_key": body["rows"][0]["dedupe_key"],
                    "date": body["rows"][0]["date"],
                    "account_mask": "3866",
                    "description": body["rows"][0]["description"],
                    "category": "Dining",
                    "amount": 140.98,
                }
            ],
        },
    )
    assert commit.status_code == 200
    assert commit.json()["inserted"] == 1

    txs = client.get("/transactions/").json()
    assert len(txs) == 1
    assert txs[0]["type"] == "expense"
    assert txs[0]["category"] == "Dining"
    assert txs[0]["source"] == "import"
    assert txs[0]["account_display"] == "Capital One ···3866"

    nw = client.get("/net-worth/").json()
    assert nw["cash"] == -140.98

    list_banks = client.get("/imports/banks")
    assert list_banks.status_code == 200
    assert any(b["slug"] == "capital_one" for b in list_banks.json())

    preview_slug = client.post("/imports/capital_one/preview", files=files)
    assert preview_slug.status_code == 200

    preview2 = client.post("/imports/capital-one/preview", files=files)
    assert preview2.json()["summary"]["duplicate"] == 1

    delete = client.delete(f"/transactions/{txs[0]['id']}")
    assert delete.status_code == 200