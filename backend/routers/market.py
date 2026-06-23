from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from constants import SYMBOL_PATTERN
from database import get_db
from schemas import MarketPriceResponse
from services.market_data import market_data

router = APIRouter(tags=["market"])


@router.get("/market/price/{symbol}", response_model=MarketPriceResponse)
def get_market_price(
    symbol: str,
    refresh: bool = Query(False, description="Bypass cache and fetch live"),
    db: Session = Depends(get_db),
):
    upper = symbol.upper().strip()
    if not SYMBOL_PATTERN.match(upper):
        raise HTTPException(status_code=400, detail="Invalid symbol format")
    price, source, as_of = market_data.get_price(upper, force_refresh=refresh, db=db)
    valid = price > 0
    return MarketPriceResponse(
        symbol=upper,
        price=round(price, 2) if valid else 0.0,
        price_source=source,
        price_as_of=as_of,
        valid=valid,
    )