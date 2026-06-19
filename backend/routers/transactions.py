from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import desc, func
from sqlalchemy.orm import Session

from database import get_db
from models import Transaction
from schemas import TransactionCreate, TransactionResponse, TransactionUpdate
from services.finance import record_net_worth_snapshot, transactions_to_responses

router = APIRouter(tags=["transactions"])


@router.post("/transactions/", response_model=TransactionResponse)
def create_transaction(tx: TransactionCreate, db: Session = Depends(get_db)):
    db_tx = Transaction(**tx.model_dump(), source="manual")
    db.add(db_tx)
    db.commit()
    db.refresh(db_tx)
    record_net_worth_snapshot(db)
    return transactions_to_responses(db, [db_tx])[0]


@router.get("/transactions/", response_model=List[TransactionResponse])
def get_transactions(
    db: Session = Depends(get_db),
    skip: int = Query(0, ge=0),
    limit: int = Query(500, ge=1, le=5000),
    search: Optional[str] = Query(None),
    sort_by: str = Query("date"),
    sort_dir: str = Query("desc"),
):
    q = db.query(Transaction)
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
    return transactions_to_responses(db, txs)


@router.put("/transactions/{tx_id}", response_model=TransactionResponse)
def update_transaction(tx_id: int, update: TransactionUpdate, db: Session = Depends(get_db)):
    tx = db.query(Transaction).filter(Transaction.id == tx_id).first()
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")
    for field, value in update.model_dump(exclude_unset=True).items():
        setattr(tx, field, value)
    db.commit()
    db.refresh(tx)
    record_net_worth_snapshot(db)
    return transactions_to_responses(db, [tx])[0]


@router.delete("/transactions/{tx_id}")
def delete_transaction(tx_id: int, db: Session = Depends(get_db)):
    tx = db.query(Transaction).filter(Transaction.id == tx_id).first()
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")
    db.delete(tx)
    db.commit()
    record_net_worth_snapshot(db)
    return {"ok": True}