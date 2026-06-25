"""Parameterized tax simulation (educational)."""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, Dict, List, Tuple

from schemas_planning import ProfilePayload

_RULESETS_DIR = Path(__file__).resolve().parents[2] / "tax_rulesets"


def load_ruleset(ruleset_id: str) -> dict:
    path = _RULESETS_DIR / f"{ruleset_id}.json"
    if not path.is_file():
        raise ValueError(f"Tax ruleset not found: {ruleset_id}")
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def _marginal_tax(taxable: float, brackets: List[dict]) -> Tuple[float, float]:
    tax = 0.0
    prev = 0.0
    marginal = 0.0
    for b in brackets:
        cap = b["up_to"]
        rate = float(b["rate"])
        if cap is None:
            chunk = max(0.0, taxable - prev)
            tax += chunk * rate
            if taxable > prev:
                marginal = rate
            break
        cap = float(cap)
        if taxable > cap:
            tax += (cap - prev) * rate
            prev = cap
        else:
            tax += (taxable - prev) * rate
            marginal = rate
            break
    return round(tax, 2), marginal


def tax_year_projection(snapshot: dict, profile: ProfilePayload, overrides: dict) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    ruleset_id = overrides.get("tax_year_ruleset_id") or profile.tax_year_ruleset_id
    if not ruleset_id:
        raise ValueError("tax_year_ruleset_id required")
    rules = load_ruleset(str(ruleset_id))
    status = profile.filing_status if profile.filing_status in rules["standard_deduction"] else "single"
    ordinary = float(overrides.get("ordinary_income", 85000))
    cap_gains = float(overrides.get("cap_gains", 5000))
    std = float(rules["standard_deduction"][status])
    taxable_ordinary = max(0.0, ordinary - std)
    ord_tax, marginal = _marginal_tax(taxable_ordinary, rules["ordinary_brackets"][status])
    cg_tax, _ = _marginal_tax(cap_gains, rules["capital_gains_rates"][status])
    total_tax = ord_tax + cg_tax
    effective = total_tax / (ordinary + cap_gains) if (ordinary + cap_gains) else 0
    summary = {
        "ruleset_id": ruleset_id,
        "filing_status": status,
        "ordinary_income": ordinary,
        "cap_gains": cap_gains,
        "total_tax": round(total_tax, 2),
        "effective_rate_pct": round(effective * 100, 2),
        "marginal_rate_pct": round(marginal * 100, 2),
    }
    return summary, {"ruleset_tax_year": rules.get("tax_year")}


def _resolve_ruleset(profile: ProfilePayload, overrides: dict) -> str:
    ruleset_id = overrides.get("tax_year_ruleset_id") or profile.tax_year_ruleset_id
    if not ruleset_id:
        raise ValueError("tax_year_ruleset_id required")
    return str(ruleset_id)


def bracket_fill_analysis(snapshot: dict, profile: ProfilePayload, overrides: dict) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    ruleset_id = _resolve_ruleset(profile, overrides)
    rules = load_ruleset(str(ruleset_id))
    status = profile.filing_status if profile.filing_status in rules["ordinary_brackets"] else "single"
    taxable = float(overrides.get("taxable_income", 75000))
    brackets = rules["ordinary_brackets"][status]
    staircase = []
    prev = 0.0
    for b in brackets:
        cap = b["up_to"]
        rate = float(b["rate"])
        if cap is None:
            room = None
        else:
            cap = float(cap)
            room = max(0.0, cap - taxable) if taxable < cap else 0.0
        staircase.append({"up_to": cap, "rate": rate, "room_in_bracket": room})
        if cap is not None and taxable <= cap:
            break
        if cap is not None:
            prev = cap
    summary = {"taxable_income": taxable, "current_marginal_rate": staircase[-1]["rate"] if staircase else 0}
    return summary, {"brackets": staircase}


def roth_conversion_ladder(snapshot: dict, profile: ProfilePayload, overrides: dict) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    years = int(overrides.get("years", 5))
    per_year = float(overrides.get("conversion_per_year", 15000))
    rows = [{"year": y + 1, "conversion": per_year} for y in range(years)]
    summary = {"total_converted": round(per_year * years, 2), "years": years}
    return summary, {"ladder": rows, "irmaa_warning": "Educational only — verify Medicare IRMAA impacts."}


def harvesting_whatif(snapshot: dict, profile: ProfilePayload, overrides: dict) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    lots = overrides.get("lots", [{"symbol": "VTI", "shares": 10, "cost_basis": 220, "price": 200}])
    harvest_loss = 0.0
    for lot in lots:
        loss = (float(lot["price"]) - float(lot["cost_basis"])) * float(lot["shares"])
        if loss < 0:
            harvest_loss += -loss
    summary = {"realizable_loss": round(harvest_loss, 2), "lot_count": len(lots)}
    return summary, {"lots": lots}


def amt_niit_surtax_flags(snapshot: dict, profile: ProfilePayload, overrides: dict) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    ruleset_id = _resolve_ruleset(profile, overrides)
    rules = load_ruleset(str(ruleset_id))
    agi = float(overrides.get("agi", 210000))
    niit_thr = float(rules.get("niit_threshold", {}).get("single", 200000))
    flags = []
    if agi > niit_thr:
        flags.append("niit_possible")
    summary = {"agi": agi, "flags": flags}
    return summary, {}


def withholding_estimator(snapshot: dict, profile: ProfilePayload, overrides: dict) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    proj, _ = tax_year_projection(snapshot, profile, overrides)
    withholding = float(overrides.get("withholding", proj["total_tax"] * 0.9))
    gap = round(proj["total_tax"] - withholding, 2)
    summary = {
        "projected_tax": proj["total_tax"],
        "withholding": withholding,
        "estimated_balance_due": gap if gap > 0 else 0,
        "estimated_refund": abs(gap) if gap < 0 else 0,
    }
    return summary, {}


def state_federal_combo(snapshot: dict, profile: ProfilePayload, overrides: dict) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    fed, _ = tax_year_projection(snapshot, profile, overrides)
    state_rate = float(overrides.get("state_rate", 0.05))
    ordinary = float(overrides.get("ordinary_income", fed["ordinary_income"]))
    state_tax = round(ordinary * state_rate, 2)
    summary = {
        "federal_tax": fed["total_tax"],
        "state_tax": state_tax,
        "combined_tax": round(fed["total_tax"] + state_tax, 2),
        "state_rate_pct": round(state_rate * 100, 2),
    }
    return summary, {}
