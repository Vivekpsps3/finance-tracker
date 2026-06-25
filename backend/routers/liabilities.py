from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models import Liability
from schemas import LiabilityCreate, LiabilityResponse, LiabilityUpdate
from services.finance import liability_to_response

router = APIRouter(tags=["liabilities"])


@router.get("/liabilities/", response_model=List[LiabilityResponse])
def list_liabilities(db: Session = Depends(get_db)):
    rows = db.query(Liability).order_by(Liability.name.asc()).all()
    return [liability_to_response(li) for li in rows]


@router.post("/liabilities/", response_model=LiabilityResponse)
def create_liability(body: LiabilityCreate, db: Session = Depends(get_db)):
    row = Liability(**body.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return liability_to_response(row)


@router.put("/liabilities/{liability_id}", response_model=LiabilityResponse)
def update_liability(
    liability_id: int, body: LiabilityUpdate, db: Session = Depends(get_db)
):
    row = db.query(Liability).filter(Liability.id == liability_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Liability not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(row, field, value)
    db.commit()
    db.refresh(row)
    return liability_to_response(row)


@router.delete("/liabilities/{liability_id}")
def delete_liability(liability_id: int, db: Session = Depends(get_db)):
    row = db.query(Liability).filter(Liability.id == liability_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Liability not found")
    db.delete(row)
    db.commit()
    return {"ok": True}