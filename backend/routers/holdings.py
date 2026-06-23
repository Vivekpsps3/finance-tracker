from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from database import get_db
from logging_config import get_logger
from models import Holding
from schemas import HoldingCreate, HoldingResponse, HoldingUpdate
from services.finance import holding_to_response, record_net_worth_snapshot

router = APIRouter(tags=["holdings"])
logger = get_logger()


@router.get("/holdings/", response_model=List[HoldingResponse])
def get_holdings(
    db: Session = Depends(get_db),
    refresh_prices: bool = Query(False, description="Bypass price cache for all holdings"),
):
    holdings = db.query(Holding).all()
    if refresh_prices and holdings:
        logger.info("holdings_list refresh_prices=true count=%s", len(holdings))
    return [holding_to_response(h, force_refresh=refresh_prices, db=db) for h in holdings]


@router.post("/holdings/", response_model=HoldingResponse)
def create_holding(h: HoldingCreate, db: Session = Depends(get_db)):
    db_h = Holding(**h.model_dump())
    db.add(db_h)
    db.commit()
    db.refresh(db_h)
    record_net_worth_snapshot(db)
    return holding_to_response(db_h, db=db)


@router.post("/holdings/{holding_id}/refresh-price", response_model=HoldingResponse)
def refresh_holding_price(holding_id: int, db: Session = Depends(get_db)):
    h = db.query(Holding).filter(Holding.id == holding_id).first()
    if not h:
        raise HTTPException(status_code=404, detail="Holding not found")
    return holding_to_response(h, force_refresh=True, db=db)


@router.put("/holdings/{holding_id}", response_model=HoldingResponse)
def update_holding(holding_id: int, update: HoldingUpdate, db: Session = Depends(get_db)):
    h = db.query(Holding).filter(Holding.id == holding_id).first()
    if not h:
        raise HTTPException(status_code=404, detail="Holding not found")
    for field, value in update.model_dump(exclude_unset=True).items():
        setattr(h, field, value)
    db.commit()
    db.refresh(h)
    record_net_worth_snapshot(db)
    return holding_to_response(h, db=db)


@router.delete("/holdings/{holding_id}")
def delete_holding(holding_id: int, db: Session = Depends(get_db)):
    h = db.query(Holding).filter(Holding.id == holding_id).first()
    if not h:
        raise HTTPException(status_code=404, detail="Holding not found")
    db.delete(h)
    db.commit()
    record_net_worth_snapshot(db)
    return {"ok": True}