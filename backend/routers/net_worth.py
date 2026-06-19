from datetime import datetime
from typing import List

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database import get_db
from schemas import NetWorthHistoryPoint, NetWorthResponse
from services.finance import build_net_worth_history, compute_cash, compute_portfolio

router = APIRouter(tags=["net-worth"])


@router.get("/net-worth/", response_model=NetWorthResponse)
def get_net_worth(db: Session = Depends(get_db)):
    cash = compute_cash(db)
    portfolio, sources = compute_portfolio(db)
    return NetWorthResponse(
        cash=cash,
        portfolio=portfolio,
        total=round(cash + portfolio, 2),
        as_of=datetime.utcnow(),
        portfolio_sources=sources,
    )


@router.get("/net-worth/history", response_model=List[NetWorthHistoryPoint])
def get_net_worth_history(db: Session = Depends(get_db)):
    return build_net_worth_history(db)