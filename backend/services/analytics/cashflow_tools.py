"""Cash flow and budget tools."""

from __future__ import annotations

from typing import Any, Dict, Tuple

from schemas_planning import ProfilePayload


def _income(profile: ProfilePayload, snapshot: dict) -> float:
    if profile.monthly_income is not None:
        return float(profile.monthly_income)
    return float(snapshot.get("transactions", {}).get("avg_monthly_income", 0.0))


def _expense(profile: ProfilePayload, snapshot: dict) -> float:
    if profile.annual_spending is not None:
        return float(profile.annual_spending) / 12
    return float(snapshot.get("transactions", {}).get("avg_monthly_expense", 0.0))


def cashflow_projection(snapshot: dict, profile: ProfilePayload, overrides: dict) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    months = int(overrides.get("months", 12))
    inc = _income(profile, snapshot)
    exp = _expense(profile, snapshot)
    series = []
    cum = 0.0
    for m in range(months):
        inc_m = inc * ((1 + profile.annual_income_growth / 12) ** m)
        exp_m = exp * ((1 + profile.inflation_cpi / 12) ** m)
        net = inc_m - exp_m
        cum += net
        series.append({"month": m + 1, "income": round(inc_m, 2), "expense": round(exp_m, 2), "net": round(net, 2), "cumulative": round(cum, 2)})
    summary = {"months": months, "final_cumulative": round(cum, 2)}
    return summary, {"monthly": series}


def expense_runway(snapshot: dict, profile: ProfilePayload, overrides: dict) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    cash = float(snapshot.get("transactions", {}).get("cash_like_assets", 0.0))
    burn = _expense(profile, snapshot)
    months = int(cash / burn) if burn > 0 else None
    summary = {"cash_like_assets": round(cash, 2), "monthly_burn": round(burn, 2), "runway_months": months}
    return summary, {}


def budget_stress_test(snapshot: dict, profile: ProfilePayload, overrides: dict) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    shock = float(overrides.get("expense_shock_pct", 0.10))
    inc = _income(profile, snapshot) * 12
    exp = _expense(profile, snapshot) * 12
    exp2 = exp * (1 + shock)
    sr1 = (inc - exp) / inc if inc else 0
    sr2 = (inc - exp2) / inc if inc else 0
    summary = {
        "expense_shock_pct": shock,
        "savings_rate_baseline_pct": round(sr1 * 100, 2),
        "savings_rate_stressed_pct": round(sr2 * 100, 2),
    }
    return summary, {}


def income_shock(snapshot: dict, profile: ProfilePayload, overrides: dict) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    months_off = int(overrides.get("months_without_income", 6))
    cash = float(snapshot.get("transactions", {}).get("cash_like_assets", 0.0))
    burn = _expense(profile, snapshot)
    need = burn * months_off
    summary = {
        "months_without_income": months_off,
        "liquidity_needed": round(need, 2),
        "cash_like_assets": round(cash, 2),
        "covered": cash >= need,
        "shortfall": round(max(0, need - cash), 2),
    }
    return summary, {}


def savings_rate_forecast(snapshot: dict, profile: ProfilePayload, overrides: dict) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    years = int(overrides.get("years", 10))
    inc = _income(profile, snapshot) * 12
    exp = _expense(profile, snapshot) * 12
    rows = []
    for y in range(years):
        inc_y = inc * ((1 + profile.annual_income_growth) ** y)
        exp_y = exp * ((1 + profile.inflation_cpi) ** y)
        sr = (inc_y - exp_y) / inc_y if inc_y else 0
        rows.append({"year": y + 1, "savings_rate_pct": round(sr * 100, 2)})
    summary = {"years": years, "year1_savings_rate_pct": rows[0]["savings_rate_pct"] if rows else 0}
    return summary, {"forecast": rows}
