"""Read-only planning input snapshot and stable hash."""

from __future__ import annotations

import hashlib
import json
from datetime import date, datetime, timedelta
from typing import Any, Dict

from sqlalchemy import func
from sqlalchemy.orm import Session

from models import Asset, AssetCategory, FixedExpense, Liability, Subscription, Transaction, TransactionType
from services.cashflow import annual_recurring_amount
from services.finance import compute_net_worth


def _month_key(d: date) -> str:
    return f"{d.year:04d}-{d.month:02d}"


def summarize_transactions(db: Session, user_id: int, months: int = 24) -> Dict[str, Any]:
    cutoff = date.today() - timedelta(days=months * 31)
    rows = (
        db.query(Transaction)
        .filter(Transaction.user_id == user_id, Transaction.date >= cutoff)
        .all()
    )
    monthly_income: Dict[str, float] = {}
    monthly_expense: Dict[str, float] = {}
    by_category: Dict[str, float] = {}
    for tx in rows:
        mk = _month_key(tx.date)
        amt = round(float(tx.amount), 2)
        if tx.type == TransactionType.income:
            monthly_income[mk] = monthly_income.get(mk, 0.0) + amt
        else:
            monthly_expense[mk] = monthly_expense.get(mk, 0.0) + amt
            cat = tx.category or "uncategorized"
            by_category[cat] = by_category.get(cat, 0.0) + amt

    def _avg(d: Dict[str, float]) -> float:
        if not d:
            return 0.0
        return round(sum(d.values()) / len(d), 2)

    cash_assets = (
        db.query(func.coalesce(func.sum(Asset.current_value), 0.0))
        .filter(
            Asset.user_id == user_id,
            Asset.category.in_(
                [AssetCategory.cash, AssetCategory.checking, AssetCategory.savings]
            )
        )
        .scalar()
    )
    return {
        "months_window": months,
        "avg_monthly_income": _avg(monthly_income),
        "avg_monthly_expense": _avg(monthly_expense),
        "expense_by_category": {k: round(v, 2) for k, v in sorted(by_category.items())},
        "transaction_count": len(rows),
        "cash_like_assets": round(float(cash_assets or 0.0), 2),
    }


def _liability_rows(db: Session, user_id: int) -> list:
    rows = db.query(Liability).filter(Liability.user_id == user_id).all()
    return [
        {
            "name": r.name,
            "category": r.category.value if hasattr(r.category, "value") else str(r.category),
            "balance_owed": round(float(r.balance_owed), 2),
        }
        for r in rows
    ]


def summarize_recurring_spending(db: Session, user_id: int) -> Dict[str, Any]:
    fixed_rows = (
        db.query(FixedExpense)
        .filter(FixedExpense.user_id == user_id, FixedExpense.is_active.is_(True))
        .all()
    )
    subscription_rows = (
        db.query(Subscription)
        .filter(Subscription.user_id == user_id, Subscription.is_active.is_(True))
        .all()
    )
    fixed_total = sum(annual_recurring_amount(row.amount, row.frequency) for row in fixed_rows)
    subscription_total = sum(
        annual_recurring_amount(row.amount, row.frequency) for row in subscription_rows
    )
    return {
        "fixed_expense_count": len(fixed_rows),
        "subscription_count": len(subscription_rows),
        "annual_fixed_expenses": round(float(fixed_total), 2),
        "annual_subscriptions": round(float(subscription_total), 2),
        "annual_total": round(float(fixed_total + subscription_total), 2),
    }


def build_planning_snapshot(db: Session, user_id: int) -> Dict[str, Any]:
    nw = compute_net_worth(db, user_id)
    tx_summary = summarize_transactions(db, user_id)
    recurring_summary = summarize_recurring_spending(db, user_id)
    return {
        "as_of": nw.as_of.isoformat() if isinstance(nw.as_of, datetime) else str(nw.as_of),
        "net_worth": {
            "other_assets": nw.other_assets,
            "portfolio": nw.portfolio,
            "liabilities": nw.liabilities,
            "total_assets": nw.total_assets,
            "total": nw.total,
        },
        "transactions": tx_summary,
        "recurring_spending": recurring_summary,
        "liabilities": _liability_rows(db, user_id),
    }


def snapshot_hash(snapshot: Dict[str, Any]) -> str:
    canonical = json.dumps(snapshot, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()
