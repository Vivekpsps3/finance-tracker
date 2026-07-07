from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from crypto_gate import require_legacy_finance_access as get_current_user
from database import get_db
from models import User
from schemas import NetWorthResponse
from services.finance import compute_net_worth

router = APIRouter(tags=["net-worth"])


@router.get("/net-worth/", response_model=NetWorthResponse)
def get_net_worth(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return compute_net_worth(db, current_user.id)
