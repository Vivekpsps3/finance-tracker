"""Transaction and portfolio statistical tools."""

from __future__ import annotations

from collections import defaultdict
from datetime import date, timedelta
from typing import Any, Dict, List, Tuple

import numpy as np
from sqlalchemy.orm import Session

from models import Holding, Transaction, TransactionType
from schemas_planning import ProfilePayload
from services.finance import holding_to_response
from services.planning.snapshot import _month_key


def _expense_rows(db: Session, months: int, category: str | None = None) -> List[Transaction]:
    cutoff = date.today() - timedelta(days=months * 31)
    q = db.query(Transaction).filter(
        Transaction.date >= cutoff,
        Transaction.type == TransactionType.expense,
    )
    if category:
        q = q.filter(Transaction.category == category)
    return q.all()


def tx_category_regression(db: Session, snapshot: dict, profile: ProfilePayload, overrides: dict) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    months = int(overrides.get("months", 24))
    category = overrides.get("category")
    rows = _expense_rows(db, months, category)
    monthly: Dict[str, float] = defaultdict(float)
    for tx in rows:
        monthly[_month_key(tx.date)] += float(tx.amount)
    keys = sorted(monthly.keys())
    if len(keys) < 3:
        return {"slope_per_month": 0.0, "points": len(keys)}, {"series": []}
    y = np.array([monthly[k] for k in keys], dtype=float)
    x = np.arange(len(y), dtype=float)
    slope = float(np.polyfit(x, y, 1)[0])
    series = [{"month": k, "amount": round(monthly[k], 2)} for k in keys]
    summary = {"slope_per_month": round(slope, 2), "category": category or "all_expenses", "points": len(keys)}
    return summary, {"series": series}


def tx_seasonality(db: Session, snapshot: dict, profile: ProfilePayload, overrides: dict) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    months = int(overrides.get("months", 24))
    rows = _expense_rows(db, months, None)
    by_m = defaultdict(list)
    for tx in rows:
        by_m[tx.date.month].append(float(tx.amount))
    season = []
    for m in range(1, 13):
        vals = by_m.get(m, [0.0])
        season.append({"month": m, "avg_expense": round(float(np.mean(vals)), 2)})
    peak = max(season, key=lambda r: r["avg_expense"])
    summary = {"peak_month": peak["month"], "peak_avg": peak["avg_expense"]}
    return summary, {"seasonality": season}


def tx_anomaly_detect(db: Session, snapshot: dict, profile: ProfilePayload, overrides: dict) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    months = int(overrides.get("months", 12))
    rows = _expense_rows(db, months, None)
    weekly: Dict[str, float] = defaultdict(float)
    for tx in rows:
        wk = tx.date.isocalendar()
        key = f"{wk.year}-W{wk.week:02d}"
        weekly[key] += float(tx.amount)
    vals = np.array(list(weekly.values()), dtype=float)
    if len(vals) < 4:
        return {"anomaly_count": 0}, {"outliers": []}
    mu, sd = float(vals.mean()), float(vals.std(ddof=1) or 1.0)
    outliers = []
    for k, v in weekly.items():
        z = (v - mu) / sd
        if abs(z) >= 2.5:
            outliers.append({"week": k, "total": round(v, 2), "z_score": round(z, 2)})
    summary = {"anomaly_count": len(outliers), "weeks_analyzed": len(weekly)}
    return summary, {"outliers": outliers}


def portfolio_return_stats(db: Session, snapshot: dict, profile: ProfilePayload, overrides: dict) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    holdings = db.query(Holding).all()
    rows = []
    for h in holdings:
        resp = holding_to_response(h, db=db)
        ret = (resp.current_price - h.purchase_price) / h.purchase_price if h.purchase_price else 0
        rows.append({"symbol": h.symbol, "approx_return_pct": round(ret * 100, 2), "weight_value": resp.value})
    total = sum(r["weight_value"] for r in rows) or 1.0
    wavg = sum(r["approx_return_pct"] * r["weight_value"] for r in rows) / total
    summary = {"holdings_count": len(rows), "value_weighted_return_pct": round(wavg, 2)}
    return summary, {"holdings": rows}


def bootstrap_spending(db: Session, snapshot: dict, profile: ProfilePayload, overrides: dict) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    months = int(overrides.get("months", 24))
    n_samples = int(overrides.get("n_samples", 500))
    rows = _expense_rows(db, months, None)
    monthly: Dict[str, float] = defaultdict(float)
    for tx in rows:
        monthly[_month_key(tx.date)] += float(tx.amount)
    pool = list(monthly.values()) or [0.0]
    rng = np.random.default_rng(int(overrides.get("seed", 42)))
    samples = rng.choice(pool, size=n_samples, replace=True)
    summary = {
        "mean_monthly": round(float(samples.mean()), 2),
        "p90_monthly": round(float(np.percentile(samples, 90)), 2),
        "n_samples": n_samples,
    }
    return summary, {"histogram_bins": np.histogram(samples, bins=10)[0].tolist()}


def correlation_matrix(db: Session, snapshot: dict, profile: ProfilePayload, overrides: dict) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    symbols = [h.symbol for h in db.query(Holding).all()]
    if len(symbols) < 2:
        return {"warning": "need_at_least_two_holdings"}, {"matrix": {}}
    # Placeholder: identity-ish correlation without historical price matrix in v1
    matrix = {a: {b: (1.0 if a == b else 0.35) for b in symbols} for a in symbols}
    summary = {"symbols": symbols, "data_quality": "approximate_placeholder"}
    return summary, {"matrix": matrix}


def var_cvar(snapshot: dict, profile: ProfilePayload, overrides: dict) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    portfolio = float(snapshot["net_worth"]["portfolio"] or snapshot["net_worth"]["total"])
    conf = float(overrides.get("confidence", 0.95))
    horizon = int(overrides.get("horizon_days", 30))
    mu = profile.nominal_return_mean * horizon / 252
    sigma = profile.nominal_return_std * (horizon / 252) ** 0.5
    var_pct = mu - sigma * 1.645
    loss = portfolio * max(0.0, -var_pct)
    summary = {
        "portfolio_value": round(portfolio, 2),
        "var_loss_amount": round(loss, 2),
        "confidence": conf,
        "horizon_days": horizon,
    }
    return summary, {}


def custom_series_import(snapshot: dict, profile: ProfilePayload, overrides: dict) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    values = overrides.get("values", [1.0, 2.0, 3.0, 2.5])
    arr = np.array([float(v) for v in values], dtype=float)
    summary = {
        "count": len(arr),
        "mean": round(float(arr.mean()), 4),
        "std": round(float(arr.std(ddof=1)) if len(arr) > 1 else 0.0, 4),
        "min": round(float(arr.min()), 4),
        "max": round(float(arr.max()), 4),
    }
    return summary, {}
