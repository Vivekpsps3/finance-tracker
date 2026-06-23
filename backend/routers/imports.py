from typing import List

from fastapi import APIRouter, Depends, File, UploadFile
from sqlalchemy.orm import Session

from database import get_db
from import_registry import list_bank_imports
from schemas import BankImportOption, ImportCommitRequest, ImportCommitResponse, ImportPreviewResponse
from services.finance import commit_bank_import, preview_bank_import

router = APIRouter(tags=["imports"])


@router.get("/imports/banks", response_model=List[BankImportOption])
def list_import_banks():
    return list_bank_imports()


@router.post("/imports/capital-one/preview", response_model=ImportPreviewResponse)
async def preview_capital_one_import_alias(
    file: UploadFile = File(...), db: Session = Depends(get_db)
):
    return await preview_bank_import("capital_one", file, db)


@router.post("/imports/capital-one/commit", response_model=ImportCommitResponse)
def commit_capital_one_import_alias(body: ImportCommitRequest, db: Session = Depends(get_db)):
    return commit_bank_import("capital_one", body, db)


@router.post("/imports/{bank_slug}/preview", response_model=ImportPreviewResponse)
async def preview_bank_import_route(
    bank_slug: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    return await preview_bank_import(bank_slug, file, db)


@router.post("/imports/{bank_slug}/commit", response_model=ImportCommitResponse)
def commit_bank_import_route(
    bank_slug: str, body: ImportCommitRequest, db: Session = Depends(get_db)
):
    return commit_bank_import(bank_slug, body, db)