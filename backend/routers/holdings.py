from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from crypto_gate import require_legacy_finance_access as get_current_user
from database import get_db
from logging_config import get_logger
from models import Holding, User
from schemas import HoldingCreate, HoldingResponse, HoldingUpdate
from services.finance import holding_to_response

router = APIRouter(tags=["holdings"])
logger = get_logger()


@router.get("/holdings/", response_model=List[HoldingResponse])
def get_holdings(
    db: Session = Depends(get_db),
    refresh_prices: bool = Query(False, description="Bypass price cache for all holdings"),
    current_user: User = Depends(get_current_user),
):
    holdings = db.query(Holding).filter(Holding.user_id == current_user.id).all()
    if refresh_prices and holdings:
        logger.info("holdings_list refresh_prices=true count=%s", len(holdings))
    return [holding_to_response(h, force_refresh=refresh_prices, db=db) for h in holdings]


@router.post("/holdings/", response_model=HoldingResponse)
def create_holding(h: HoldingCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    db_h = Holding(**h.model_dump(), user_id=current_user.id)
    db.add(db_h)
    db.commit()
    db.refresh(db_h)
    return holding_to_response(db_h, db=db)


@router.post("/holdings/{holding_id}/refresh-price", response_model=HoldingResponse)
def refresh_holding_price(holding_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    h = db.query(Holding).filter(Holding.id == holding_id, Holding.user_id == current_user.id).first()
    if not h:
        raise HTTPException(status_code=404, detail="Holding not found")
    return holding_to_response(h, force_refresh=True, db=db)


@router.put("/holdings/{holding_id}", response_model=HoldingResponse)
def update_holding(holding_id: int, update: HoldingUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    h = db.query(Holding).filter(Holding.id == holding_id, Holding.user_id == current_user.id).first()
    if not h:
        raise HTTPException(status_code=404, detail="Holding not found")
    for field, value in update.model_dump(exclude_unset=True).items():
        setattr(h, field, value)
    db.commit()
    db.refresh(h)
    return holding_to_response(h, db=db)


@router.delete("/holdings/{holding_id}")
def delete_holding(holding_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    h = db.query(Holding).filter(Holding.id == holding_id, Holding.user_id == current_user.id).first()
    if not h:
        raise HTTPException(status_code=404, detail="Holding not found")
    db.delete(h)
    db.commit()
    return {"ok": True}