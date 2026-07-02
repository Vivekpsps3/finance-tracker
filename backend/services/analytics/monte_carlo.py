"""Monte Carlo net worth simulation (speculative).

The planning engine intentionally reads ledger-derived snapshots but never writes
to balance sheet, holdings, liabilities, or transactions tables.
"""

from __future__ import annotations

import math
from datetime import date, datetime
from typing import Any, Dict, Iterable, Tuple

import numpy as np

from schemas_planning import (
    FAN_PATHS_PERSIST_MAX,
    PlanningCashflowEvent,
    PlanningCheckpoint,
    ProfilePayload,
)

from services.analytics.distributions import annual_returns, percentiles_by_year


def _money(n: float) -> str:
    return f"${n:,.0f}"


def _snapshot_date(snapshot: dict) -> date:
    raw = snapshot.get("as_of")
    if isinstance(raw, str) and raw:
        try:
            return datetime.fromisoformat(raw.replace("Z", "+00:00")).date()
        except ValueError:
            return date.today()
    return date.today()


DEFAULT_ANNUAL_SPENDING_FALLBACK = 40_000.0


def _fan_paths_for_persistence(paths: np.ndarray) -> tuple[list[list[float]], int]:
    """Store at most FAN_PATHS_PERSIST_MAX paths; percentiles use full simulation."""
    n = int(paths.shape[0])
    if n <= FAN_PATHS_PERSIST_MAX:
        return paths.round(2).tolist(), n
    idx = np.linspace(0, n - 1, FAN_PATHS_PERSIST_MAX, dtype=int)
    return paths[idx].round(2).tolist(), FAN_PATHS_PERSIST_MAX


def annual_spending_from_transactions(tx: dict) -> tuple[float, str]:
    """Spending used when profile.annual_spending is unset (shared with /inputs preview)."""
    exp = float(tx.get("avg_monthly_expense", 0.0) or 0.0) * 12
    if exp > 0:
        return exp, "transactions.avg_monthly_expense"
    return DEFAULT_ANNUAL_SPENDING_FALLBACK, "default_fallback_40000"


def _annual_spending(profile: ProfilePayload, snapshot: dict) -> tuple[float, str]:
    if profile.annual_spending is not None:
        return max(0.0, float(profile.annual_spending)), "profile.annual_spending"
    return annual_spending_from_transactions(snapshot.get("transactions", {}))


def _annual_income(profile: ProfilePayload, snapshot: dict) -> tuple[float, str]:
    if profile.monthly_income is not None:
        return max(0.0, float(profile.monthly_income) * 12), "profile.monthly_income"
    tx = snapshot.get("transactions", {})
    inc = float(tx.get("avg_monthly_income", 0.0) or 0.0) * 12
    if inc > 0:
        return inc, "transactions.avg_monthly_income"
    return 0.0, "none"


def _manual_net_cashflow(profile: ProfilePayload) -> tuple[float | None, str]:
    extra = profile.extra_contributions or {}
    if extra.get("annual_contribution") is not None:
        return float(extra["annual_contribution"]), "profile.extra_contributions.annual_contribution"
    return None, "income_minus_spending"


def _growth_allocation(profile: ProfilePayload, snapshot: dict) -> tuple[float, str]:
    if profile.portfolio_allocation is not None:
        return float(profile.portfolio_allocation), "profile.portfolio_allocation"

    nw = snapshot.get("net_worth", {})
    total_assets = max(0.0, float(nw.get("total_assets", 0.0) or 0.0))
    portfolio = max(0.0, float(nw.get("portfolio", 0.0) or 0.0))
    if total_assets <= 0:
        return 0.0, "no_positive_assets"
    if portfolio <= 0:
        return 0.35, "default_no_portfolio_35pct"
    return min(0.95, max(0.05, portfolio / total_assets)), "snapshot.portfolio_weight"


def _occurrence_times_in_year(
    start: float,
    end: float,
    interval: float,
    year: int,
) -> int:
    """Count event times t in (year-1, year] with t = start + k*interval, start <= t <= end."""
    if interval <= 0:
        interval = 1.0
    count = 0
    k = 0
    max_k = int((end - start) / interval) + 4 + year * 8
    while k <= max_k:
        t = start + k * interval
        if t > end + 1e-9:
            break
        if year - 1 < t <= year + 1e-9:
            count += 1
        if t > year + interval + 1:
            break
        k += 1
    return count


def _event_cashflow_for_year(
    event: PlanningCashflowEvent,
    year: int,
    *,
    horizon_years: int,
    inflation: float,
) -> float:
    if not event.recurring:
        target = event.year if event.year is not None else event.start_year
        if target is None:
            target = 1
        if year != int(target):
            return 0.0
        amount = float(event.amount)
        if event.inflation_adjusted:
            amount *= (1 + inflation) ** max(0, year - 1)
        return amount

    start_raw = event.start_year if event.start_year is not None else event.year
    start = 1.0 if start_raw is None else float(start_raw)
    end = float(event.end_year if event.end_year is not None else horizon_years)
    interval = float(event.interval_years or 1.0)
    if interval < 0.25:
        interval = 1.0

    if year < start or year > end:
        n = 0
    elif interval < 1.0:
        # Sub-annual spacing within each simulation year (e.g. 0.5 → 2× per year).
        n = max(1, int(round(1.0 / interval)))
    else:
        n = _occurrence_times_in_year(start, end, interval, year)
    if n == 0:
        return 0.0
    amount = float(event.amount) * n
    if event.inflation_adjusted:
        amount *= (1 + inflation) ** max(0, year - 1)
    return amount


def _event_amounts_by_year(
    events: Iterable[PlanningCashflowEvent],
    *,
    horizon_years: int,
    inflation: float,
) -> list[float]:
    amounts: list[float] = []
    for year in range(1, horizon_years + 1):
        total = 0.0
        for event in events:
            total += _event_cashflow_for_year(
                event, year, horizon_years=horizon_years, inflation=inflation
            )
        amounts.append(round(total, 2))
    return amounts


def _checkpoint_year(checkpoint: PlanningCheckpoint, start_date: date, horizon_years: int) -> int:
    if checkpoint.year is not None:
        return min(horizon_years, max(0, int(checkpoint.year)))
    if checkpoint.target_date is not None:
        days = (checkpoint.target_date - start_date).days
        return min(horizon_years, max(0, math.ceil(days / 365.25)))
    return horizon_years


def _checkpoint_results(
    paths: np.ndarray,
    checkpoints: list[PlanningCheckpoint],
    *,
    start_date: date,
    horizon_years: int,
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for checkpoint in checkpoints:
        year = _checkpoint_year(checkpoint, start_date, horizon_years)
        values = paths[:, year]
        target = checkpoint.target_net_worth
        p10 = float(np.percentile(values, 10))
        p50 = float(np.percentile(values, 50))
        p90 = float(np.percentile(values, 90))
        success_pct = None
        gap = None
        on_track = None
        if target is not None:
            success_pct = round(float(np.mean(values >= target) * 100), 2)
            gap = round(p50 - float(target), 2)
            threshold = (
                float(checkpoint.min_success_probability) * 100
                if checkpoint.min_success_probability is not None
                else 70.0
            )
            on_track = success_pct >= threshold
        rows.append(
            {
                "label": checkpoint.label,
                "year": year,
                "target_date": checkpoint.target_date.isoformat()
                if checkpoint.target_date is not None
                else None,
                "target_net_worth": round(float(target), 2) if target is not None else None,
                "p10": round(p10, 2),
                "p50": round(p50, 2),
                "p90": round(p90, 2),
                "success_probability_pct": success_pct,
                "gap_to_goal_p50": gap,
                "on_track": on_track,
            }
        )
    return rows


def _projection_table(
    paths: np.ndarray,
    checkpoint_rows: list[dict[str, Any]],
    *,
    horizon_years: int,
) -> list[dict[str, Any]]:
    years = {0, horizon_years}
    years.update(range(5, horizon_years + 1, 5))
    years.update(int(r["year"]) for r in checkpoint_rows)
    goal_by_year: dict[int, dict[str, Any]] = {int(r["year"]): r for r in checkpoint_rows}
    table: list[dict[str, Any]] = []
    for year in sorted(y for y in years if 0 <= y <= horizon_years):
        values = paths[:, year]
        goal = goal_by_year.get(year)
        table.append(
            {
                "year": year,
                "label": "Now" if year == 0 else (goal["label"] if goal else f"Year {year}"),
                "p10": round(float(np.percentile(values, 10)), 2),
                "p50": round(float(np.percentile(values, 50)), 2),
                "p90": round(float(np.percentile(values, 90)), 2),
                "target_net_worth": goal.get("target_net_worth") if goal else None,
                "success_probability_pct": goal.get("success_probability_pct") if goal else None,
                "gap_to_goal_p50": goal.get("gap_to_goal_p50") if goal else None,
            }
        )
    return table


def _narrative(
    *,
    success_pct: float,
    above_start_pct: float,
    horizon_years: int,
    start: float,
    terminal_p10: float,
    terminal_p50: float,
    terminal_p90: float,
    spending: float,
    income: float,
    net_cashflow: float,
    allocation: float,
    checkpoint_rows: list[dict[str, Any]],
) -> list[str]:
    lines = [
        (
            f"Starting from {_money(start)} net worth, the model projects {horizon_years} "
            "annual periods with market returns, stable-asset growth, inflation, cash flow, "
            "one-time events, and shock risk."
        ),
        (
            f"Base cash flow starts at {_money(income)} income less {_money(spending)} spending, "
            f"for {_money(net_cashflow)} net annual flow before custom events."
        ),
        (
            f"{allocation * 100:.0f}% of net worth is exposed to the growth return model; "
            f"the ending median range is {_money(terminal_p10)} / {_money(terminal_p50)} / {_money(terminal_p90)} "
            "at P10/P50/P90."
        ),
        (
            f"{success_pct:.1f}% of paths stay above zero at the horizon, and "
            f"{above_start_pct:.1f}% end above the starting net worth."
        ),
    ]
    goals = [r for r in checkpoint_rows if r.get("target_net_worth") is not None]
    if goals:
        weakest = min(goals, key=lambda r: r.get("success_probability_pct") or 0)
        lines.append(
            f"The tightest checkpoint is {weakest['label']}: "
            f"{weakest.get('success_probability_pct', 0):.1f}% of paths reach "
            f"{_money(float(weakest['target_net_worth']))} by year {weakest['year']}."
        )
    if success_pct < 50:
        lines.append("More than half of paths finish below zero; lower withdrawals or higher net cash flow materially matter here.")
    elif success_pct >= 85:
        lines.append("Most paths stay funded; the useful stress tests are lower returns, higher inflation, and earlier spending events.")
    return lines


def mc_net_worth_paths(
    snapshot: dict,
    profile: ProfilePayload,
    *,
    horizon_years: int,
    n_paths: int,
    seed: int,
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    rng = np.random.default_rng(seed)
    nw = snapshot["net_worth"]
    ledger_start = float(nw["total"])
    if profile.start_net_worth is not None:
        start = float(profile.start_net_worth)
        start_source = "profile.start_net_worth"
    else:
        start = ledger_start
        start_source = "snapshot.net_worth.total"
    allocation, allocation_source = _growth_allocation(profile, snapshot)

    rets = annual_returns(
        rng,
        n_paths,
        horizon_years,
        float(profile.nominal_return_mean),
        float(profile.nominal_return_std),
    )
    if profile.shock_probability > 0 and profile.shock_mean_loss > 0:
        shock_mask = rng.random((n_paths, horizon_years)) < float(profile.shock_probability)
        shock_losses = rng.normal(
            loc=float(profile.shock_mean_loss),
            scale=float(profile.shock_loss_std),
            size=(n_paths, horizon_years),
        )
        rets -= shock_mask * np.maximum(0.0, shock_losses)
    rets -= float(profile.tax_drag) + float(profile.annual_fee_drag)
    rets = np.clip(rets, -0.85, 1.2)

    spending, spend_source = _annual_spending(profile, snapshot)
    income, income_source = _annual_income(profile, snapshot)
    manual_net, net_source = _manual_net_cashflow(profile)
    infl = float(profile.inflation_cpi)
    income_growth = float(profile.annual_income_growth)
    stable_return = float(profile.stable_return_mean)
    event_amounts = _event_amounts_by_year(
        profile.annual_cashflow_events,
        horizon_years=horizon_years,
        inflation=infl,
    )

    paths = np.zeros((n_paths, horizon_years + 1))
    paths[:, 0] = start
    invested = np.full(n_paths, max(0.0, start) * allocation)
    stable = np.full(n_paths, start - max(0.0, start) * allocation)
    first_depletion_year = np.full(n_paths, horizon_years + 1)
    if start <= 0:
        first_depletion_year[:] = 0
    base_net_cashflow = 0.0

    for y in range(horizon_years):
        year = y + 1
        spending_y = spending * ((1 + infl) ** y)
        income_y = income * ((1 + income_growth) ** y)
        if manual_net is None:
            net_cashflow_y = income_y - spending_y
            if y == 0:
                base_net_cashflow = net_cashflow_y
        else:
            growth = income_growth if manual_net >= 0 else infl
            net_cashflow_y = manual_net * ((1 + growth) ** y)
            if y == 0:
                base_net_cashflow = net_cashflow_y
        net_cashflow_y += event_amounts[y]

        invested *= 1 + rets[:, y]
        stable *= 1 + stable_return

        if net_cashflow_y >= 0:
            invested += net_cashflow_y * allocation
            stable += net_cashflow_y * (1 - allocation)
        else:
            draw = -net_cashflow_y
            stable_avail = np.maximum(stable, 0.0)
            invested_avail = np.maximum(invested, 0.0)
            from_stable = np.minimum(stable_avail, draw)
            stable -= from_stable
            remainder = draw - from_stable
            from_invested = np.minimum(invested_avail, remainder)
            invested -= from_invested
            invested = np.maximum(invested, 0.0)

        total = invested + stable
        paths[:, year] = total
        depleted_now = (first_depletion_year == horizon_years + 1) & (total <= 0)
        first_depletion_year[depleted_now] = year

    terminal = paths[:, -1]
    terminal_p10 = float(np.percentile(terminal, 10))
    terminal_p50 = float(np.percentile(terminal, 50))
    terminal_p90 = float(np.percentile(terminal, 90))
    success_pct = round(float(np.mean(terminal > 0) * 100), 2)
    above_start_pct = round(float(np.mean(terminal >= start) * 100), 2)
    pct_depleted = round(float(np.mean(first_depletion_year <= horizon_years) * 100), 2)
    med_dep = first_depletion_year[first_depletion_year <= horizon_years]
    median_depletion_year = int(np.median(med_dep)) if med_dep.size else None

    start_date = _snapshot_date(snapshot)
    checkpoint_rows = _checkpoint_results(
        paths,
        profile.checkpoints,
        start_date=start_date,
        horizon_years=horizon_years,
    )
    table_rows = _projection_table(paths, checkpoint_rows, horizon_years=horizon_years)

    summary = {
        "start_net_worth": round(start, 2),
        "ledger_net_worth": round(ledger_start, 2),
        "start_net_worth_source": start_source,
        "starting_growth_allocation": round(allocation, 4),
        "growth_allocation_source": allocation_source,
        "annual_spending_start": round(spending, 2),
        "spend_assumption_source": spend_source,
        "annual_income_start": round(income, 2),
        "income_assumption_source": income_source,
        "annual_contribution_start": round(base_net_cashflow, 2),
        "net_cashflow_source": net_source,
        "spending_model": "fixed_annual",
        "withdrawal_strategy_configured": profile.withdrawal_strategy,
        "withdrawal_strategy_applied": False,
        "nominal_return_mean": profile.nominal_return_mean,
        "nominal_return_std": profile.nominal_return_std,
        "stable_return_mean": stable_return,
        "tax_drag": profile.tax_drag,
        "annual_fee_drag": profile.annual_fee_drag,
        "shock_probability": profile.shock_probability,
        "shock_mean_loss": profile.shock_mean_loss,
        "inflation_cpi": infl,
        "horizon_years": horizon_years,
        "n_paths": n_paths,
        "seed": seed,
        "success_rate_pct": success_pct,
        "pct_depleted_before_horizon": pct_depleted,
        "median_depletion_year": median_depletion_year,
        "chance_ending_above_start_pct": above_start_pct,
        "terminal_p5": round(float(np.percentile(terminal, 5)), 2),
        "terminal_p10": round(terminal_p10, 2),
        "terminal_p25": round(float(np.percentile(terminal, 25)), 2),
        "terminal_p50": round(terminal_p50, 2),
        "terminal_p75": round(float(np.percentile(terminal, 75)), 2),
        "terminal_p90": round(terminal_p90, 2),
        "terminal_p95": round(float(np.percentile(terminal, 95)), 2),
        "checkpoint_count": len(checkpoint_rows),
        "event_count": len(profile.annual_cashflow_events),
        "narrative": _narrative(
            success_pct=success_pct,
            above_start_pct=above_start_pct,
            horizon_years=horizon_years,
            start=start,
            terminal_p10=terminal_p10,
            terminal_p50=terminal_p50,
            terminal_p90=terminal_p90,
            spending=spending,
            income=income,
            net_cashflow=base_net_cashflow,
            allocation=allocation,
            checkpoint_rows=checkpoint_rows,
        ),
    }

    percentiles = percentiles_by_year(paths, ps=(5, 10, 25, 50, 75, 90, 95))
    years = list(range(horizon_years + 1))
    fan_paths, fan_paths_displayed = _fan_paths_for_persistence(paths)
    artifacts = {
        "years": years,
        "percentiles_by_year": percentiles,
        "fan_paths": fan_paths,
        "fan_paths_displayed": fan_paths_displayed,
        "n_paths_simulated": n_paths,
        "checkpoint_results": checkpoint_rows,
        "projection_table": table_rows,
        "annual_event_cashflow": event_amounts,
    }
    return summary, artifacts
