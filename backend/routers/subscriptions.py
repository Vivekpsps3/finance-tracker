from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from crypto_gate import require_legacy_finance_access as get_current_user
from database import get_db
from models import Subscription, User
from schemas import SubscriptionCreate, SubscriptionResponse, SubscriptionUpdate
from services.cashflow import annual_recurring_amount, next_occurrence

router = APIRouter(tags=["subscriptions"])


def _to_response(row: Subscription) -> SubscriptionResponse:
    annual = round(annual_recurring_amount(float(row.amount or 0), row.frequency), 2)
    return SubscriptionResponse(
        id=row.id,
        name=row.name,
        category=row.category,
        amount=row.amount,
        frequency=row.frequency.value if hasattr(row.frequency, "value") else str(row.frequency),
        next_bill_date=row.next_bill_date,
        end_date=row.end_date,
        payment_account=row.payment_account,
        is_active=row.is_active,
        notes=row.notes,
        next_due_date=next_occurrence(row.next_bill_date, row.frequency),
        monthly_amount=round(annual / 12, 2),
        annual_amount=annual,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


@router.get("/subscriptions/", response_model=List[SubscriptionResponse])
def list_subscriptions(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    rows = (
        db.query(Subscription)
        .filter(Subscription.user_id == current_user.id)
        .order_by(Subscription.is_active.desc(), Subscription.next_bill_date.asc(), Subscription.name.asc())
        .all()
    )
    return [_to_response(row) for row in rows]


@router.post("/subscriptions/", response_model=SubscriptionResponse)
def create_subscription(
    body: SubscriptionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    row = Subscription(**body.model_dump(), user_id=current_user.id)
    db.add(row)
    db.commit()
    db.refresh(row)
    return _to_response(row)


@router.put("/subscriptions/{subscription_id}", response_model=SubscriptionResponse)
def update_subscription(
    subscription_id: int,
    body: SubscriptionUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    row = (
        db.query(Subscription)
        .filter(Subscription.id == subscription_id, Subscription.user_id == current_user.id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Subscription not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(row, field, value)
    db.commit()
    db.refresh(row)
    return _to_response(row)


@router.delete("/subscriptions/{subscription_id}")
def delete_subscription(
    subscription_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    row = (
        db.query(Subscription)
        .filter(Subscription.id == subscription_id, Subscription.user_id == current_user.id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Subscription not found")
    db.delete(row)
    db.commit()
    return {"ok": True}
