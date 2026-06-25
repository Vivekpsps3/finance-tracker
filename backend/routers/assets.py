from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models import Asset
from schemas import AssetCreate, AssetResponse, AssetUpdate
from services.finance import asset_to_response

router = APIRouter(tags=["assets"])


@router.get("/assets/", response_model=List[AssetResponse])
def list_assets(db: Session = Depends(get_db)):
    rows = db.query(Asset).order_by(Asset.name.asc()).all()
    return [asset_to_response(a) for a in rows]


@router.post("/assets/", response_model=AssetResponse)
def create_asset(body: AssetCreate, db: Session = Depends(get_db)):
    row = Asset(**body.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return asset_to_response(row)


@router.put("/assets/{asset_id}", response_model=AssetResponse)
def update_asset(asset_id: int, body: AssetUpdate, db: Session = Depends(get_db)):
    row = db.query(Asset).filter(Asset.id == asset_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Asset not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(row, field, value)
    db.commit()
    db.refresh(row)
    return asset_to_response(row)


@router.delete("/assets/{asset_id}")
def delete_asset(asset_id: int, db: Session = Depends(get_db)):
    row = db.query(Asset).filter(Asset.id == asset_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Asset not found")
    db.delete(row)
    db.commit()
    return {"ok": True}