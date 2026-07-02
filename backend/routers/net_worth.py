from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database import get_db
from schemas import NetWorthResponse, NetWorthSnapshotCreate, NetWorthSnapshotResponse
from services.finance import compute_net_worth, create_net_worth_snapshot, list_net_worth_snapshots

router = APIRouter(tags=["net-worth"])


@router.get("/net-worth/", response_model=NetWorthResponse)
def get_net_worth(db: Session = Depends(get_db)):
    return compute_net_worth(db)


@router.get("/net-worth/snapshots", response_model=list[NetWorthSnapshotResponse])
def get_net_worth_snapshots(limit: int = 120, db: Session = Depends(get_db)):
    capped_limit = min(max(limit, 1), 500)
    return list_net_worth_snapshots(db, limit=capped_limit)


@router.post("/net-worth/snapshots", response_model=NetWorthSnapshotResponse)
def post_net_worth_snapshot(body: NetWorthSnapshotCreate, db: Session = Depends(get_db)):
    return create_net_worth_snapshot(db, snapshot_date=body.snapshot_date, note=body.note)
