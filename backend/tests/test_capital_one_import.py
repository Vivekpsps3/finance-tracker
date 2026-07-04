import os

os.environ["DATABASE_URL"] = "sqlite:///:memory:"

from datetime import date

import pytest
from fastapi.testclient import TestClient
from conftest import authenticated_client
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
    return authenticated_client(app)


def test_parse_capital_one_skips_credits():
    rows = parse_capital_one_csv(SAMPLE_CSV)
    assert len(rows) == 1
    assert rows[0].amount == 140.98
    assert rows[0].category == "Dining"
    assert rows[0].account_mask == "3866"


def test_capital_one_preview_and_commit_does_not_change_net_worth(client):
    nw_before = client.get("/api/net-worth/").json()["total"]

    files = {"file": ("capital.csv", SAMPLE_CSV, "text/csv")}
    preview = client.post("/api/imports/capital-one/preview", files=files)
    assert preview.status_code == 200
    body = preview.json()
    assert body["summary"]["new"] == 1

    commit = client.post(
        "/api/imports/capital-one/commit",
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

    txs = client.get("/api/transactions/").json()
    assert len(txs) == 1
    assert txs[0]["type"] == "expense"
    assert txs[0]["source"] == "import"

    nw_after = client.get("/api/net-worth/").json()
    assert nw_after["total"] == nw_before

    list_banks = client.get("/api/imports/banks")
    assert list_banks.status_code == 200
    assert any(b["slug"] == "capital_one" for b in list_banks.json())


def test_capital_one_second_commit_skips_duplicate_dedupe_key(client):
    files = {"file": ("capital.csv", SAMPLE_CSV, "text/csv")}
    preview = client.post("/api/imports/capital-one/preview", files=files)
    assert preview.status_code == 200
    row = preview.json()["rows"][0]
    commit_body = {
        "filename": "capital.csv",
        "rows": [
            {
                "dedupe_key": row["dedupe_key"],
                "date": row["date"],
                "account_mask": "3866",
                "description": row["description"],
                "category": "Dining",
                "amount": 140.98,
            }
        ],
    }

    first = client.post("/api/imports/capital-one/commit", json=commit_body)
    assert first.status_code == 200
    assert first.json()["inserted"] == 1
    assert len(client.get("/api/transactions/").json()) == 1

    second = client.post("/api/imports/capital-one/commit", json=commit_body)
    assert second.status_code == 200
    assert second.json()["inserted"] == 0
    assert second.json()["skipped"] >= 1
    assert len(client.get("/api/transactions/").json()) == 1


def test_parse_capital_one_missing_headers_raises():
    with pytest.raises(ValueError, match="Missing required columns"):
        parse_capital_one_csv("Date,Amount\n2026-01-01,10\n")


def test_capital_one_preview_rejects_bad_header(client):
    bad = "Date,Amount\n2026-01-01,10\n"
    r = client.post(
        "/api/imports/capital-one/preview",
        files={"file": ("bad.csv", bad, "text/csv")},
    )
    assert r.status_code == 400
    assert "Missing required columns" in r.json()["detail"]


def test_preview_rejects_csv_over_10mb(client):
    oversized = b"a" * (10 * 1024 * 1024 + 1)
    r = client.post(
        "/api/imports/capital-one/preview",
        files={"file": ("big.csv", oversized, "text/csv")},
    )
    assert r.status_code == 413