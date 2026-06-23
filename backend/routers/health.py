from fastapi import APIRouter

from services.market_data import market_data

router = APIRouter(tags=["health"])


@router.get("/health")
def health():
    return {
        "status": "ok",
        "cache_size": len(market_data._memory),
        "version": "2.0.0",
    }