import os

import pytest
import json

os.environ["DATABASE_URL"] = "sqlite:///:memory:"

from conftest import authenticated_client
from sqlalchemy import delete

from main import Base, app, engine


@pytest.fixture
def client():
    return authenticated_client(app)


def setup_function():
    Base.metadata.create_all(bind=engine)
    with engine.begin() as conn:
        for table in reversed(Base.metadata.sorted_tables):
            conn.execute(delete(table))


def test_upload_tax_document_and_year_summary(client):
    res = client.post(
        "/api/taxes/documents",
        data={
            "tax_year": "2025",
            "document_type": "w2",
            "issuer": "Example Employer",
            "taxpayer": "Vivek",
            "summary_json": json.dumps({
                "wages": 120000,
                "federal_income_tax_withheld": 22000,
                "state_income_tax_withheld": 8000,
            }),
            "notes": "Primary W-2",
        },
        files={"file": ("w2.pdf", b"%PDF-1.4 fake", "application/pdf")},
    )
    assert res.status_code == 200, res.text
    doc = res.json()
    assert doc["tax_year"] == 2025
    assert doc["document_type"] == "w2"
    assert doc["issuer"] == "Example Employer"
    assert doc["filename"] == "w2.pdf"
    assert doc["summary"]["wages"] == 120000
    assert "file_bytes" not in doc

    summary = client.get("/api/taxes/years/2025/summary").json()
    assert summary["document_count"] == 1
    assert summary["document_counts"] == {"w2": 1}
    assert summary["totals"]["wages"] == 120000
    assert summary["totals"]["federal_income_tax_withheld"] == 22000
    assert "1099" in summary["missing_recommended"]
    assert "1040" in summary["missing_recommended"]


def test_download_tax_document_returns_original_bytes(client):
    content = b"tax document bytes"
    created = client.post(
        "/api/taxes/documents",
        data={"tax_year": "2024", "document_type": "1040"},
        files={"file": ("return.txt", content, "text/plain")},
    ).json()

    res = client.get(f"/api/taxes/documents/{created['id']}/download")
    assert res.status_code == 200
    assert res.content == content
    assert res.headers["content-type"].startswith("text/plain")


def test_tax_document_rejects_large_or_unknown_type(client):
    res = client.post(
        "/api/taxes/documents",
        data={"tax_year": "2025", "document_type": "w2"},
        files={"file": ("w2.exe", b"nope", "application/octet-stream")},
    )
    assert res.status_code == 400


def test_tax_summary_latest_return_level_values_win(client):
    client.post(
        "/api/taxes/documents",
        data={
            "tax_year": "2025",
            "document_type": "1040",
            "summary_json": json.dumps({"agi": 100000, "total_tax": 15000}),
        },
        files={"file": ("return-old.txt", b"old return", "text/plain")},
    )
    client.post(
        "/api/taxes/documents",
        data={
            "tax_year": "2025",
            "document_type": "1040",
            "summary_json": json.dumps({"agi": 110000, "total_tax": 17000}),
        },
        files={"file": ("return-new.txt", b"new return", "text/plain")},
    )

    summary = client.get("/api/taxes/years/2025/summary").json()
    assert summary["totals"]["agi"] == 110000
    assert summary["totals"]["total_tax"] == 17000


def test_tax_document_rejects_duplicate_hash_for_same_year_and_type(client):
    content = b"same document"
    for expected in (200, 409):
        res = client.post(
            "/api/taxes/documents",
            data={"tax_year": "2025", "document_type": "1099"},
            files={"file": ("1099.txt", content, "text/plain")},
        )
        assert res.status_code == expected
