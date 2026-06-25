from typing import List

from fastapi import APIRouter, Depends, File, UploadFile
from sqlalchemy.orm import Session

from database import get_db
from import_registry import list_bank_imports, list_brokerage_imports
from schemas import (
    BankImportOption,
    BrokerageAccountResponse,
    FidelityCommitRequest,
    FidelityCommitResponse,
    FidelityPreviewResponse,
    ImportCommitRequest,
    ImportCommitResponse,
    ImportPreviewResponse,
    SetAccountNickname,
)
from services.finance import (
    commit_bank_import,
    commit_fidelity_import,
    preview_bank_import,
    preview_fidelity_import,
    set_brokerage_account_nickname,
)

router = APIRouter(tags=["imports"])


@router.get("/imports/banks", response_model=List[BankImportOption])
def list_import_banks():
    return list_bank_imports()


@router.get("/imports/brokerages", response_model=List[BankImportOption])  # reuse shape for simplicity

def list_import_brokerages():
    return list_brokerage_imports()


@router.post("/imports/capital-one/preview", response_model=ImportPreviewResponse)
async def preview_capital_one_import_alias(
    file: UploadFile = File(...), db: Session = Depends(get_db)
):
    return await preview_bank_import("capital_one", file, db)


@router.post("/imports/capital-one/commit", response_model=ImportCommitResponse)
def commit_capital_one_import_alias(body: ImportCommitRequest, db: Session = Depends(get_db)):
    return commit_bank_import("capital_one", body, db)


@router.post("/imports/fidelity/preview", response_model=FidelityPreviewResponse)
async def preview_fidelity_import_route(
    file: UploadFile = File(...), db: Session = Depends(get_db)
):
    return await preview_fidelity_import(file, db)


@router.post("/imports/fidelity/commit", response_model=FidelityCommitResponse)
def commit_fidelity_import_route(
    body: FidelityCommitRequest, db: Session = Depends(get_db)
):
    return commit_fidelity_import(body, db)


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


@router.put("/imports/brokerage-accounts/{account_id}/nickname", response_model=BrokerageAccountResponse)
def set_brokerage_nickname(
    account_id: int, body: SetAccountNickname, db: Session = Depends(get_db)
):
    acc = set_brokerage_account_nickname(db, account_id, body.nickname or "")
    return {"id": acc.id, "nickname": acc.nickname, "label": acc.label, "account_mask": acc.account_mask}