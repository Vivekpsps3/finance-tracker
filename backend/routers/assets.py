from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from auth import get_current_user
from database import get_db
from models import Asset, User
from schemas import AssetCreate, AssetResponse, AssetUpdate
from services.finance import asset_to_response

router = APIRouter(tags=["assets"])


@router.get("/assets/", response_model=List[AssetResponse])
def list_assets(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    rows = db.query(Asset).filter(Asset.user_id == current_user.id).order_by(Asset.name.asc()).all()
    return [asset_to_response(a) for a in rows]


@router.post("/assets/", response_model=AssetResponse)
def create_asset(body: AssetCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    row = Asset(**body.model_dump(), user_id=current_user.id)
    db.add(row)
    db.commit()
    db.refresh(row)
    return asset_to_response(row)


@router.put("/assets/{asset_id}", response_model=AssetResponse)
def update_asset(asset_id: int, body: AssetUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    row = db.query(Asset).filter(Asset.id == asset_id, Asset.user_id == current_user.id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Asset not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(row, field, value)
    db.commit()
    db.refresh(row)
    return asset_to_response(row)


@router.delete("/assets/{asset_id}")
def delete_asset(asset_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    row = db.query(Asset).filter(Asset.id == asset_id, Asset.user_id == current_user.id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Asset not found")
    db.delete(row)
    db.commit()
    return {"ok": True}