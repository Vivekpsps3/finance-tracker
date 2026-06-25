"""Debt and balance-sheet sensitivity tools."""

from __future__ import annotations

from typing import Any, Dict, List, Tuple

from schemas_planning import ProfilePayload


def debt_payoff_vs_invest(snapshot: dict, profile: ProfilePayload, overrides: dict) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    extra = float(overrides.get("extra_payment", 200))
    loan_rate = float(overrides.get("loan_rate", 0.06))
    invest_after_tax = float(overrides.get("after_tax_return", profile.nominal_return_mean * 0.85))
    years = int(overrides.get("years", 10))
    payoff_benefit = extra * loan_rate * years
    invest_benefit = extra * invest_after_tax * years
    summary = {
        "extra_payment_monthly": extra,
        "payoff_interest_saved_approx": round(payoff_benefit, 2),
        "invest_growth_approx": round(invest_benefit, 2),
        "prefer": "invest" if invest_benefit > payoff_benefit else "payoff",
    }
    return summary, {}


def refinance_break_even(snapshot: dict, profile: ProfilePayload, overrides: dict) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    costs = float(overrides.get("closing_costs", 4000))
    savings = float(overrides.get("payment_savings", 150))
    months = int(costs / savings) if savings > 0 else None
    summary = {"closing_costs": costs, "monthly_savings": savings, "break_even_months": months}
    return summary, {}


def amortization_explorer(snapshot: dict, profile: ProfilePayload, overrides: dict) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    principal = float(overrides.get("principal", 250000))
    annual_rate = float(overrides.get("annual_rate", 0.065))
    years = int(overrides.get("years", 30))
    extra = float(overrides.get("extra_monthly", 0))
    r = annual_rate / 12
    n = years * 12
    pmt = principal * r / (1 - (1 + r) ** -n) if r else principal / n
    bal = principal
    schedule: List[dict] = []
    total_interest = 0.0
    for m in range(1, min(n, 360) + 1):
        interest = bal * r
        princ = pmt - interest + extra
        bal = max(0, bal - princ)
        total_interest += interest
        if m <= 12 or m % 12 == 0:
            schedule.append({"month": m, "balance": round(bal, 2), "interest": round(interest, 2)})
        if bal <= 0:
            break
    summary = {
        "principal": principal,
        "payment_monthly": round(pmt + extra, 2),
        "total_interest_approx": round(total_interest, 2),
        "months_to_payoff": len(schedule) if bal <= 0 else n,
    }
    return summary, {"schedule_sample": schedule}


def net_worth_sensitivity(snapshot: dict, profile: ProfilePayload, overrides: dict) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    shocks = overrides.get("shocks_pct", [-0.1, 0.1])
    base = float(snapshot["net_worth"]["total"])
    nw = snapshot["net_worth"]
    drivers = {
        "portfolio": float(nw["portfolio"]),
        "other_assets": float(nw["other_assets"]),
        "liabilities": float(nw["liabilities"]),
    }
    tornado = []
    for name, val in drivers.items():
        for s in shocks:
            s = float(s)
            if name == "liabilities":
                delta = -val * s
            else:
                delta = val * s
            tornado.append({"driver": name, "shock_pct": s, "net_worth_delta": round(delta, 2), "resulting_net_worth": round(base + delta, 2)})
    summary = {"base_net_worth": round(base, 2), "scenarios": len(tornado)}
    return summary, {"tornado": tornado}
