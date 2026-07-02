from typing import List, Optional
from urllib.parse import quote

from fastapi import APIRouter, Depends, File, Form, UploadFile
from fastapi.responses import Response
from sqlalchemy.orm import Session

from database import get_db
from models import TaxDocumentType
from schemas import TaxDocumentResponse, TaxYearSummary
from services.taxes import (
    delete_tax_document,
    get_tax_document,
    list_tax_documents,
    store_tax_document,
    summarize_tax_year,
)

router = APIRouter(tags=["taxes"])


@router.get("/taxes/documents", response_model=List[TaxDocumentResponse])
def get_tax_documents(
    tax_year: Optional[int] = None,
    db: Session = Depends(get_db),
):
    return list_tax_documents(db, tax_year=tax_year)


@router.post("/taxes/documents", response_model=TaxDocumentResponse)
async def upload_tax_document(
    tax_year: int = Form(...),
    document_type: TaxDocumentType = Form(...),
    issuer: Optional[str] = Form(None),
    taxpayer: Optional[str] = Form(None),
    summary_json: Optional[str] = Form(None),
    notes: Optional[str] = Form(None),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    return await store_tax_document(
        db,
        tax_year=tax_year,
        document_type=document_type,
        issuer=issuer,
        taxpayer=taxpayer,
        summary_json=summary_json,
        notes=notes,
        file=file,
    )


@router.get("/taxes/years/{tax_year}/summary", response_model=TaxYearSummary)
def get_tax_year_summary(tax_year: int, db: Session = Depends(get_db)):
    return summarize_tax_year(db, tax_year)


@router.get("/taxes/documents/{document_id}/download")
def download_tax_document(document_id: int, db: Session = Depends(get_db)):
    doc = get_tax_document(db, document_id)
    safe_filename = "".join(ch if ch.isprintable() and ch not in '"\r\n;' else "_" for ch in doc.filename)
    headers = {
        "Content-Disposition": (
            f'attachment; filename="{safe_filename}"; '
            f"filename*=UTF-8''{quote(safe_filename)}"
        ),
        "X-Content-Type-Options": "nosniff",
    }
    return Response(content=doc.file_bytes, media_type=doc.content_type, headers=headers)


@router.delete("/taxes/documents/{document_id}")
def remove_tax_document(document_id: int, db: Session = Depends(get_db)):
    return delete_tax_document(db, document_id)
