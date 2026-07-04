from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from auth import get_current_user
from database import get_db
from models import User
from schemas import NetWorthResponse, NetWorthSnapshotCreate, NetWorthSnapshotResponse
from services.finance import compute_net_worth, create_net_worth_snapshot, list_net_worth_snapshots

router = APIRouter(tags=["net-worth"])


@router.get("/net-worth/", response_model=NetWorthResponse)
def get_net_worth(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return compute_net_worth(db, current_user.id)


@router.get("/net-worth/snapshots", response_model=list[NetWorthSnapshotResponse])
def get_net_worth_snapshots(limit: int = 120, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    capped_limit = min(max(limit, 1), 500)
    return list_net_worth_snapshots(db, current_user.id, limit=capped_limit)


@router.post("/net-worth/snapshots", response_model=NetWorthSnapshotResponse)
def post_net_worth_snapshot(body: NetWorthSnapshotCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return create_net_worth_snapshot(db, snapshot_date=body.snapshot_date, note=body.note, user_id=current_user.id)
