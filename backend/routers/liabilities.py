from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from crypto_gate import require_legacy_finance_access as get_current_user
from database import get_db
from models import Liability, User
from schemas import LiabilityCreate, LiabilityResponse, LiabilityUpdate
from services.finance import liability_to_response

router = APIRouter(tags=["liabilities"])


@router.get("/liabilities/", response_model=List[LiabilityResponse])
def list_liabilities(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    rows = db.query(Liability).filter(Liability.user_id == current_user.id).order_by(Liability.name.asc()).all()
    return [liability_to_response(li) for li in rows]


@router.post("/liabilities/", response_model=LiabilityResponse)
def create_liability(body: LiabilityCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    row = Liability(**body.model_dump(), user_id=current_user.id)
    db.add(row)
    db.commit()
    db.refresh(row)
    return liability_to_response(row)


@router.put("/liabilities/{liability_id}", response_model=LiabilityResponse)
def update_liability(
    liability_id: int, body: LiabilityUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    row = db.query(Liability).filter(Liability.id == liability_id, Liability.user_id == current_user.id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Liability not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(row, field, value)
    db.commit()
    db.refresh(row)
    return liability_to_response(row)


@router.delete("/liabilities/{liability_id}")
def delete_liability(liability_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    row = db.query(Liability).filter(Liability.id == liability_id, Liability.user_id == current_user.id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Liability not found")
    db.delete(row)
    db.commit()
    return {"ok": True}