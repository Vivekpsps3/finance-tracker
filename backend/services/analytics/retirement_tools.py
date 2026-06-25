"""Deterministic retirement-style tools."""

from __future__ import annotations

from typing import Any, Dict, Tuple

from schemas_planning import ProfilePayload


def _spend(profile: ProfilePayload, snapshot: dict) -> float:
    if profile.annual_spending is not None:
        return float(profile.annual_spending)
    return float(snapshot.get("transactions", {}).get("avg_monthly_expense", 0.0) * 12 or 40000.0)


def fire_number(snapshot: dict, profile: ProfilePayload, overrides: dict) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    mult = float(overrides.get("multiplier", 25))
    spend = float(overrides.get("annual_spending", _spend(profile, snapshot)))
    target = round(spend * mult, 2)
    nw = float(snapshot["net_worth"]["total"])
    summary = {
        "annual_spending": round(spend, 2),
        "multiplier": mult,
        "fire_target": target,
        "current_net_worth": round(nw, 2),
        "gap": round(target - nw, 2),
        "progress_pct": round(min(100.0, nw / target * 100) if target else 0, 2),
    }
    return summary, {}


def withdrawal_guardrails(snapshot: dict, profile: ProfilePayload, overrides: dict) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    pct = float(overrides.get("fixed_withdrawal_pct", profile.fixed_withdrawal_pct))
    portfolio = float(snapshot["net_worth"]["portfolio"] or snapshot["net_worth"]["total"])
    fixed = round(portfolio * pct, 2)
    guardrail = round(fixed * 0.9, 2)
    ceiling = round(fixed * 1.1, 2)
    summary = {
        "portfolio_base": round(portfolio, 2),
        "fixed_withdrawal_pct": pct,
        "fixed_withdrawal_amount": fixed,
        "guardrail_floor": guardrail,
        "guardrail_ceiling": ceiling,
    }
    return summary, {}


def sequence_of_returns_stress(snapshot: dict, profile: ProfilePayload, overrides: dict) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    years = int(overrides.get("horizon_years", 30))
    start = float(snapshot["net_worth"]["total"])
    spend = _spend(profile, snapshot)
    cagr = profile.nominal_return_mean
    bad = [cagr - 0.15, cagr - 0.10, cagr - 0.05] + [cagr] * max(0, years - 3)
    good = [cagr + 0.10, cagr + 0.08, cagr + 0.05] + [cagr] * max(0, years - 3)
    bad = bad[:years]
    good = good[:years]

    def _simulate(seq):
        bal = start
        for y, r in enumerate(seq):
            bal = bal * (1 + r) - spend * ((1 + profile.inflation_cpi) ** y)
        return round(bal, 2)

    summary = {
        "terminal_bad_sequence": _simulate(bad),
        "terminal_good_sequence": _simulate(good),
        "cagr_assumption": cagr,
        "horizon_years": years,
    }
    return summary, {"bad_sequence": bad, "good_sequence": good}


def glide_path_whatif(snapshot: dict, profile: ProfilePayload, overrides: dict) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    start_s = float(overrides.get("start_stock_pct", 0.8))
    end_s = float(overrides.get("end_stock_pct", 0.5))
    years = int(overrides.get("horizon_years", 20))
    stock_ret = profile.nominal_return_mean
    bond_ret = stock_ret - 0.03
    path = []
    for y in range(years + 1):
        w = start_s + (end_s - start_s) * (y / years if years else 0)
        blended = w * stock_ret + (1 - w) * bond_ret
        path.append({"year": y, "stock_weight": round(w, 3), "expected_return": round(blended, 4)})
    summary = {"start_stock_pct": start_s, "end_stock_pct": end_s, "years": years}
    return summary, {"glide_path": path}


def social_security_claiming(snapshot: dict, profile: ProfilePayload, overrides: dict) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    ages = overrides.get("claiming_ages", [62, 67, 70])
    pia = float(profile.social_security.get("estimated_pia", 24000))
    cola = float(profile.social_security.get("cola", 0.02))
    life = profile.life_expectancy
    rows = []
    for age in ages:
        years = max(0, life - int(age))
        total = 0.0
        benefit = pia * (0.7 if age <= 62 else (1.0 if age >= 67 else 0.85))
        for y in range(years):
            total += benefit * ((1 + cola) ** y)
        rows.append({"claiming_age": age, "lifetime_benefit_nominal": round(total, 2)})
    best = max(rows, key=lambda r: r["lifetime_benefit_nominal"])
    summary = {"best_claiming_age_by_nominal": best["claiming_age"], "pia_baseline": pia}
    return summary, {"scenarios": rows}


def pension_lump_sum_vs_annuity(snapshot: dict, profile: ProfilePayload, overrides: dict) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    lump = float(overrides.get("lump_sum", 500000))
    annuity = float(overrides.get("annual_annuity", 32000))
    rate = float(overrides.get("discount_rate", 0.04))
    years = int(overrides.get("payout_years", profile.life_expectancy - profile.retirement_target_age))
    npv_annuity = sum(annuity / ((1 + rate) ** (t + 1)) for t in range(max(years, 1)))
    summary = {
        "lump_sum": lump,
        "annuity_annual": annuity,
        "npv_annuity": round(npv_annuity, 2),
        "prefer": "lump_sum" if lump > npv_annuity else "annuity",
    }
    return summary, {}
