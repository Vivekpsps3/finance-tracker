from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import desc, func
from sqlalchemy.orm import Session

from auth import get_current_user
from database import get_db
from models import Transaction, User
from schemas import TransactionCreate, TransactionResponse, TransactionUpdate
from services.finance import transactions_to_responses

router = APIRouter(tags=["transactions"])


@router.post("/transactions/", response_model=TransactionResponse)
def create_transaction(tx: TransactionCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    db_tx = Transaction(**tx.model_dump(), source="manual", user_id=current_user.id)
    db.add(db_tx)
    db.commit()
    db.refresh(db_tx)
    return transactions_to_responses(db, current_user.id, [db_tx])[0]


@router.get("/transactions/", response_model=List[TransactionResponse])
def get_transactions(
    db: Session = Depends(get_db),
    skip: int = Query(0, ge=0),
    limit: int = Query(500, ge=1, le=5000),
    search: Optional[str] = Query(None),
    sort_by: str = Query("date"),
    sort_dir: str = Query("desc"),
    current_user: User = Depends(get_current_user),
):
    q = db.query(Transaction).filter(Transaction.user_id == current_user.id)
    if search:
        term = f"%{search.lower()}%"
        q = q.filter(
            (func.lower(Transaction.category).like(term))
            | (func.lower(Transaction.description).like(term))
        )
    sort_col = Transaction.date
    if sort_by == "amount":
        sort_col = Transaction.amount
    elif sort_by == "category":
        sort_col = Transaction.category
    q = q.order_by(sort_col.asc() if sort_dir == "asc" else desc(sort_col))
    txs = q.offset(skip).limit(limit).all()
    return transactions_to_responses(db, current_user.id, txs)


@router.put("/transactions/{tx_id}", response_model=TransactionResponse)
def update_transaction(tx_id: int, update: TransactionUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    tx = db.query(Transaction).filter(Transaction.id == tx_id, Transaction.user_id == current_user.id).first()
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")
    for field, value in update.model_dump(exclude_unset=True).items():
        setattr(tx, field, value)
    db.commit()
    db.refresh(tx)
    return transactions_to_responses(db, current_user.id, [tx])[0]


@router.delete("/transactions/{tx_id}")
def delete_transaction(tx_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    tx = db.query(Transaction).filter(Transaction.id == tx_id, Transaction.user_id == current_user.id).first()
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")
    db.delete(tx)
    db.commit()
    return {"ok": True}