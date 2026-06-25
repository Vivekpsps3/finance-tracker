"""Scenario composition tools (compare, grid, convergence, export metadata)."""

from __future__ import annotations

import json
from typing import Any, Dict, Optional, Tuple

from sqlalchemy.orm import Session

from models import PlanningScenarioRun
from schemas_planning import PlanningRunResponse
from services.analytics.monte_carlo import retirement_success_rate
from schemas_planning import ProfilePayload


def _run_summary(row: PlanningScenarioRun) -> dict:
    return json.loads(row.result_summary_json or "{}")


def scenario_compare(db: Session, overrides: dict) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    if "run_id_a" not in overrides or "run_id_b" not in overrides:
        raise ValueError("run_id_a and run_id_b are required in overrides")
    a_id = int(overrides["run_id_a"])
    b_id = int(overrides["run_id_b"])
    a = db.query(PlanningScenarioRun).filter(PlanningScenarioRun.id == a_id).first()
    b = db.query(PlanningScenarioRun).filter(PlanningScenarioRun.id == b_id).first()
    if not a or not b:
        raise ValueError("run not found")
    sa, sb = _run_summary(a), _run_summary(b)
    summary = {
        "run_a": {"id": a_id, "tool_id": a.tool_id, "summary": sa},
        "run_b": {"id": b_id, "tool_id": b.tool_id, "summary": sb},
    }
    return summary, {}


def sensitivity_grid(snapshot: dict, profile: ProfilePayload, overrides: dict) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    return_shocks = overrides.get("return_shocks", [-0.02, 0.0, 0.02])
    spend_shocks = overrides.get("spend_shocks", [-0.1, 0.0, 0.1])
    grid = []
    for dr in return_shocks:
        for ds in spend_shocks:
            p = profile.model_copy(deep=True)
            p.nominal_return_mean += float(dr)
            if p.annual_spending:
                p.annual_spending *= 1 + float(ds)
            s, _ = retirement_success_rate(
                snapshot, p, horizon_years=int(overrides.get("horizon_years", 30)),
                n_paths=int(overrides.get("n_paths", 200)), seed=42,
            )
            grid.append({
                "return_shock": dr,
                "spend_shock": ds,
                "success_rate_pct": s["success_rate_pct"],
            })
    summary = {"cells": len(grid)}
    return summary, {"grid": grid}


def monte_carlo_convergence(snapshot: dict, profile: ProfilePayload, overrides: dict) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    epsilon = float(overrides.get("epsilon", 0.02))
    sizes = [200, 500, 1000, 2000, 5000]
    rates = []
    for n in sizes:
        s, _ = retirement_success_rate(
            snapshot, profile, horizon_years=30, n_paths=n, seed=42,
        )
        rates.append(s["success_rate_pct"])
    stable_n = sizes[-1]
    for i in range(1, len(rates)):
        if abs(rates[i] - rates[i - 1]) / 100 <= epsilon:
            stable_n = sizes[i]
            break
    summary = {"recommended_n_paths": stable_n, "rates_by_n": dict(zip(sizes, rates))}
    return summary, {}


def export_scenario_bundle(run: PlanningRunResponse, profile: Optional[dict]) -> dict:
    return {
        "run": run.model_dump(),
        "profile": profile,
        "snapshot_hash": run.input_snapshot_hash,
    }
