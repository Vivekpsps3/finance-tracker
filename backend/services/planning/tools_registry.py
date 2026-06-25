"""Planning lab exposes a single Monte Carlo tool."""

from typing import Dict, List

from schemas_planning import ToolDescriptor

_TOOLS: List[ToolDescriptor] = [
    ToolDescriptor(
        tool_id="mc_net_worth_paths",
        name="Monte Carlo net worth",
        category="monte_carlo",
        summary=(
            "Simulate thousands of future net-worth paths using your current balance sheet, "
            "spending, savings, inflation, and return assumptions."
        ),
        parameters_schema={
            "horizon_years": "int (1–80)",
            "n_paths": "int (100–50000); fan chart draws every simulated path",
            "seed": "int (reproducible runs)",
            "start_net_worth": "float | omit to use ledger snapshot total",
            "annual_spending": "float | omit to use transaction average",
            "annual_contribution": "float | omit to use income − expenses",
            "monthly_income": "float | omit to use transaction average",
            "portfolio_allocation": "float 0–1 | omit to infer from balance sheet",
            "nominal_return_mean": "float (e.g. 0.07)",
            "nominal_return_std": "float (e.g. 0.15)",
            "stable_return_mean": "float (e.g. 0.02)",
            "inflation_cpi": "float (e.g. 0.025)",
            "tax_drag": "float annual return drag",
            "annual_fee_drag": "float annual return drag",
            "shock_probability": "float annual chance of a shock",
            "shock_mean_loss": "float average shock loss",
            "checkpoints": "array of {label, year|target_date, target_net_worth}",
            "annual_cashflow_events": "array of dated one-time or recurring net cash-flow events",
        },
    ),
]

_TOOL_MAP: Dict[str, ToolDescriptor] = {t.tool_id: t for t in _TOOLS}


def list_tools() -> List[ToolDescriptor]:
    return list(_TOOLS)


def get_tool(tool_id: str) -> ToolDescriptor:
    t = _TOOL_MAP.get(tool_id)
    if not t:
        raise KeyError(tool_id)
    return t


def all_tool_ids() -> List[str]:
    return list(_TOOL_MAP.keys())
