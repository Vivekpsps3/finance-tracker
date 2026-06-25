from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database import get_db
from schemas import NetWorthResponse
from services.finance import compute_net_worth

router = APIRouter(tags=["net-worth"])


@router.get("/net-worth/", response_model=NetWorthResponse)
def get_net_worth(db: Session = Depends(get_db)):
    return compute_net_worth(db)