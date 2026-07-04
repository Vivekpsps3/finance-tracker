from __future__ import annotations

import hashlib
import json
from collections import Counter
from datetime import date
from typing import List

from fastapi import HTTPException, UploadFile
from sqlalchemy.orm import Session

from models import TaxDocument, TaxDocumentType
from schemas import TaxDocumentResponse, TaxYearSummary

MAX_TAX_DOCUMENT_BYTES = 25 * 1024 * 1024
ALLOWED_CONTENT_TYPES = {
    "application/pdf",
    "text/csv",
    "text/plain",
    "image/jpeg",
    "image/png",
}
RECOMMENDED_BY_YEAR = [
    TaxDocumentType.w2.value,
    TaxDocumentType.form_1099.value,
    TaxDocumentType.tax_return_1040.value,
]
SUMMARY_FIELDS = {
    "wages",
    "federal_income_tax_withheld",
    "social_security_wages",
    "social_security_tax_withheld",
    "medicare_wages",
    "medicare_tax_withheld",
    "state_wages",
    "state_income_tax_withheld",
    "interest_income",
    "ordinary_dividends",
    "qualified_dividends",
    "capital_gain_distributions",
    "retirement_contributions",
    "agi",
    "taxable_income",
    "total_tax",
    "refund_or_amount_owed",
}


def _normalize_filename(filename: str | None) -> str:
    name = (filename or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Missing filename")
    # Metadata only. File bytes live in SQLite, so path separators have no role.
    return name.replace("/", "_").replace("\\", "_")[:255]


async def _read_document(file: UploadFile) -> bytes:
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Uploaded document is empty")
    if len(content) > MAX_TAX_DOCUMENT_BYTES:
        raise HTTPException(status_code=413, detail="Tax document exceeds 25 MiB limit")
    return content


def tax_document_to_response(doc: TaxDocument) -> TaxDocumentResponse:
    dtype = doc.document_type.value if hasattr(doc.document_type, "value") else str(doc.document_type)
    try:
        summary = json.loads(doc.summary_json or "{}")
    except json.JSONDecodeError:
        summary = {}
    return TaxDocumentResponse(
        id=doc.id,
        tax_year=doc.tax_year,
        document_type=dtype,
        issuer=doc.issuer,
        taxpayer=doc.taxpayer,
        filename=doc.filename,
        content_type=doc.content_type,
        size_bytes=doc.size_bytes,
        sha256=doc.sha256,
        summary=summary,
        notes=doc.notes,
        uploaded_at=doc.uploaded_at,
    )


def parse_summary_json(raw: str | None) -> dict[str, float]:
    if not raw or not raw.strip():
        return {}
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="summary_json must be valid JSON") from exc
    if not isinstance(data, dict):
        raise HTTPException(status_code=400, detail="summary_json must be an object")

    out: dict[str, float] = {}
    for key, value in data.items():
        if key not in SUMMARY_FIELDS:
            raise HTTPException(status_code=400, detail=f"Unsupported tax summary field: {key}")
        if value in (None, ""):
            continue
        try:
            out[key] = round(float(value), 2)
        except (TypeError, ValueError) as exc:
            raise HTTPException(status_code=400, detail=f"Invalid numeric value for {key}") from exc
    return out


def validate_file_signature(content_type: str, content: bytes) -> None:
    if content_type == "application/pdf" and not content.startswith(b"%PDF"):
        raise HTTPException(status_code=400, detail="PDF upload does not look like a PDF file")
    if content_type == "image/png" and not content.startswith(b"\x89PNG\r\n\x1a\n"):
        raise HTTPException(status_code=400, detail="PNG upload does not look like a PNG file")
    if content_type == "image/jpeg" and not content.startswith(b"\xff\xd8\xff"):
        raise HTTPException(status_code=400, detail="JPEG upload does not look like a JPEG file")


async def store_tax_document(
    db: Session,
    *,
    tax_year: int,
    document_type: TaxDocumentType,
    file: UploadFile,
    issuer: str | None = None,
    taxpayer: str | None = None,
    summary_json: str | None = None,
    notes: str | None = None,
    user_id: int,
) -> TaxDocumentResponse:
    current_year = date.today().year + 1
    if tax_year < 1990 or tax_year > current_year:
        raise HTTPException(status_code=400, detail="Tax year is outside the supported range")

    filename = _normalize_filename(file.filename)
    content_type = file.content_type or "application/octet-stream"
    if content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(status_code=400, detail="Upload a PDF, CSV, text, JPG, or PNG file")

    content = await _read_document(file)
    validate_file_signature(content_type, content)
    digest = hashlib.sha256(content).hexdigest()
    duplicate = (
        db.query(TaxDocument)
        .filter(
            TaxDocument.user_id == user_id,
            TaxDocument.tax_year == tax_year,
            TaxDocument.document_type == document_type,
            TaxDocument.sha256 == digest,
        )
        .first()
    )
    if duplicate:
        raise HTTPException(status_code=409, detail="This tax document is already stored for that year and type")

    summary = parse_summary_json(summary_json)
    doc = TaxDocument(
        user_id=user_id,
        tax_year=tax_year,
        document_type=document_type,
        issuer=(issuer or "").strip() or None,
        taxpayer=(taxpayer or "").strip() or None,
        filename=filename,
        content_type=content_type,
        size_bytes=len(content),
        sha256=digest,
        file_bytes=content,
        summary_json=json.dumps(summary, sort_keys=True),
        notes=(notes or "").strip() or None,
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    return tax_document_to_response(doc)


def list_tax_documents(db: Session, user_id: int, tax_year: int | None = None) -> List[TaxDocumentResponse]:
    query = db.query(TaxDocument).filter(TaxDocument.user_id == user_id)
    if tax_year is not None:
        query = query.filter(TaxDocument.tax_year == tax_year)
    rows = query.order_by(TaxDocument.tax_year.desc(), TaxDocument.uploaded_at.desc()).all()
    return [tax_document_to_response(row) for row in rows]


def get_tax_document(db: Session, user_id: int, document_id: int) -> TaxDocument:
    doc = db.query(TaxDocument).filter(TaxDocument.id == document_id, TaxDocument.user_id == user_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Tax document not found")
    return doc


def delete_tax_document(db: Session, user_id: int, document_id: int) -> dict:
    doc = get_tax_document(db, user_id, document_id)
    db.delete(doc)
    db.commit()
    return {"ok": True}


def summarize_tax_year(db: Session, user_id: int, tax_year: int) -> TaxYearSummary:
    docs = (
        db.query(TaxDocument)
        .filter(TaxDocument.user_id == user_id, TaxDocument.tax_year == tax_year)
        .order_by(TaxDocument.uploaded_at.desc())
        .all()
    )
    responses = [tax_document_to_response(doc) for doc in docs]
    counts = Counter(doc.document_type for doc in responses)
    missing = [name for name in RECOMMENDED_BY_YEAR if counts.get(name, 0) == 0]
    totals: dict[str, float] = {}
    for doc in responses:
        for key, value in doc.summary.items():
            if key in {"agi", "taxable_income", "total_tax", "refund_or_amount_owed"}:
                # Return-level metrics should represent the latest uploaded return,
                # not a sum across amended/duplicate return docs.
                if key not in totals:
                    totals[key] = value
            else:
                totals[key] = round(totals.get(key, 0.0) + value, 2)
    return TaxYearSummary(
        tax_year=tax_year,
        document_count=len(responses),
        total_size_bytes=sum(doc.size_bytes for doc in responses),
        document_counts=dict(counts),
        totals=totals,
        missing_recommended=missing,
        documents=responses,
    )
