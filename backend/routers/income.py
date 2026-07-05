from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from auth import get_current_user
from database import get_db
from models import JobIncome, User
from schemas import JobIncomeCreate, JobIncomeResponse, JobIncomeUpdate
from services.cashflow import income_summary

router = APIRouter(tags=["income"])


def _to_response(row: JobIncome) -> JobIncomeResponse:
    summary = income_summary(row)
    return JobIncomeResponse(
        id=row.id,
        employer=row.employer,
        role_title=row.role_title,
        pay_frequency=row.pay_frequency.value if hasattr(row.pay_frequency, "value") else str(row.pay_frequency),
        base_pay=row.base_pay,
        hours_per_week=row.hours_per_week,
        annual_bonus=row.annual_bonus,
        annual_equity=row.annual_equity,
        annual_other=row.annual_other,
        annual_taxes=summary["annual_taxes"],
        annual_deductions=summary["annual_deductions"],
        taxes_per_period=summary["taxes_per_period"],
        deductions_per_period=summary["deductions_per_period"],
        effective_date=row.effective_date,
        is_active=row.is_active,
        notes=row.notes,
        pay_periods_per_year=int(summary["pay_periods_per_year"]),
        annual_base_pay=summary["annual_base_pay"],
        annual_gross=summary["annual_gross"],
        monthly_gross=summary["monthly_gross"],
        period_gross=summary["period_gross"],
        period_net=summary["period_net"],
        annual_net=summary["annual_net"],
        monthly_net=summary["monthly_net"],
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


@router.get("/income/", response_model=List[JobIncomeResponse])
def list_job_incomes(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    rows = (
        db.query(JobIncome)
        .filter(JobIncome.user_id == current_user.id)
        .order_by(JobIncome.is_active.desc(), JobIncome.effective_date.desc(), JobIncome.employer.asc())
        .all()
    )
    return [_to_response(row) for row in rows]


@router.post("/income/", response_model=JobIncomeResponse)
def create_job_income(
    body: JobIncomeCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    payload = body.model_dump()
    if not payload.get("taxes_per_period") and payload.get("annual_taxes"):
        # Backward compatible clients may still send annual values.
        from services.cashflow import periods_per_year

        periods = periods_per_year(payload["pay_frequency"])
        payload["taxes_per_period"] = round(float(payload["annual_taxes"] or 0) / periods, 2)
    if not payload.get("deductions_per_period") and payload.get("annual_deductions"):
        from services.cashflow import periods_per_year

        periods = periods_per_year(payload["pay_frequency"])
        payload["deductions_per_period"] = round(float(payload["annual_deductions"] or 0) / periods, 2)
    row = JobIncome(**payload, user_id=current_user.id)
    db.add(row)
    db.commit()
    db.refresh(row)
    return _to_response(row)


@router.put("/income/{income_id}", response_model=JobIncomeResponse)
def update_job_income(
    income_id: int,
    body: JobIncomeUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    row = db.query(JobIncome).filter(JobIncome.id == income_id, JobIncome.user_id == current_user.id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Income entry not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(row, field, value)
    db.commit()
    db.refresh(row)
    return _to_response(row)


@router.delete("/income/{income_id}")
def delete_job_income(
    income_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    row = db.query(JobIncome).filter(JobIncome.id == income_id, JobIncome.user_id == current_user.id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Income entry not found")
    db.delete(row)
    db.commit()
    return {"ok": True}
