from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from auth import get_current_user
from database import get_db
from models import User
from schemas import CashflowSummaryResponse
from services.cashflow import build_cashflow_summary

router = APIRouter(tags=["cashflow"])


@router.get("/cashflow/summary", response_model=CashflowSummaryResponse)
def cashflow_summary(
    start_date: date = Query(...),
    end_date: date = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if end_date < start_date:
        raise HTTPException(status_code=400, detail="end_date must be on or after start_date")
    return build_cashflow_summary(db, current_user.id, start_date, end_date)
