from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from crypto_gate import require_legacy_finance_access as get_current_user
from database import get_db
from models import FixedExpense, User
from schemas import FixedExpenseCreate, FixedExpenseResponse, FixedExpenseUpdate
from services.cashflow import annual_recurring_amount, next_occurrence

router = APIRouter(tags=["fixed-expenses"])


def _to_response(row: FixedExpense) -> FixedExpenseResponse:
    annual = round(annual_recurring_amount(float(row.amount or 0), row.frequency), 2)
    return FixedExpenseResponse(
        id=row.id,
        name=row.name,
        category=row.category,
        amount=row.amount,
        frequency=row.frequency.value if hasattr(row.frequency, "value") else str(row.frequency),
        start_date=row.start_date,
        end_date=row.end_date,
        due_day=row.due_day,
        autopay=bool(row.autopay),
        payment_account=row.payment_account,
        is_active=row.is_active,
        notes=row.notes,
        next_due_date=next_occurrence(row.start_date, row.frequency),
        monthly_amount=round(annual / 12, 2),
        annual_amount=annual,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


@router.get("/fixed-expenses/", response_model=List[FixedExpenseResponse])
def list_fixed_expenses(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    rows = (
        db.query(FixedExpense)
        .filter(FixedExpense.user_id == current_user.id)
        .order_by(FixedExpense.is_active.desc(), FixedExpense.category.asc(), FixedExpense.name.asc())
        .all()
    )
    return [_to_response(row) for row in rows]


@router.post("/fixed-expenses/", response_model=FixedExpenseResponse)
def create_fixed_expense(
    body: FixedExpenseCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    row = FixedExpense(**body.model_dump(), user_id=current_user.id)
    db.add(row)
    db.commit()
    db.refresh(row)
    return _to_response(row)


@router.put("/fixed-expenses/{expense_id}", response_model=FixedExpenseResponse)
def update_fixed_expense(
    expense_id: int,
    body: FixedExpenseUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    row = db.query(FixedExpense).filter(FixedExpense.id == expense_id, FixedExpense.user_id == current_user.id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Fixed expense not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(row, field, value)
    db.commit()
    db.refresh(row)
    return _to_response(row)


@router.delete("/fixed-expenses/{expense_id}")
def delete_fixed_expense(
    expense_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    row = db.query(FixedExpense).filter(FixedExpense.id == expense_id, FixedExpense.user_id == current_user.id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Fixed expense not found")
    db.delete(row)
    db.commit()
    return {"ok": True}
