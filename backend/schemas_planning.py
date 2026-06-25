"""Pydantic models for /planning/v1 API (speculative outputs only)."""

from datetime import date, datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field

SPECULATIVE_DISCLAIMER = (
    "Educational / speculative only. Not tax, legal, or investment advice. "
    "Does not modify your ledger or net worth."
)


class PlanningCheckpoint(BaseModel):
    label: str = Field(default="Goal", min_length=1, max_length=80)
    year: Optional[int] = Field(default=None, ge=0, le=80)
    target_date: Optional[date] = None
    target_net_worth: Optional[float] = Field(default=None, ge=0)
    min_success_probability: Optional[float] = Field(default=None, ge=0.0, le=1.0)


class PlanningCashflowEvent(BaseModel):
    """Cash flow adjustment in simulation year index (1 = first year after as_of, not calendar)."""

    label: str = Field(default="Event", min_length=1, max_length=80)
    amount: float = Field(
        description="Dollars per application year; added to net cash flow (negative = outflow).",
    )
    year: Optional[int] = Field(
        default=None, ge=1, le=80, description="One-time only: simulation year when recurring=false."
    )
    start_year: Optional[int] = Field(
        default=None, ge=1, le=80, description="Recurring: first year (falls back to year if unset)."
    )
    end_year: Optional[int] = Field(
        default=None,
        ge=1,
        le=80,
        description="Recurring: last year; omit = through horizon.",
    )
    recurring: bool = False
    interval_years: float = Field(
        default=1.0,
        ge=0.25,
        le=80.0,
        description="Recurring only: spacing between occurrences in years (0.5 = twice per year, 2 = every two years).",
    )
    inflation_adjusted: bool = True


class ProfilePayload(BaseModel):
    birth_year: Optional[int] = None
    retirement_target_age: int = 65
    life_expectancy: int = 90
    annual_income_growth: float = 0.03
    inflation_cpi: float = 0.025
    healthcare_inflation: float = 0.05
    nominal_return_mean: float = 0.07
    nominal_return_std: float = 0.15
    stable_return_mean: float = 0.02
    portfolio_allocation: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    tax_drag: float = Field(default=0.0, ge=0.0, le=0.08)
    annual_fee_drag: float = Field(default=0.0, ge=0.0, le=0.05)
    shock_probability: float = Field(default=0.08, ge=0.0, le=1.0)
    shock_mean_loss: float = Field(default=0.22, ge=0.0, le=0.9)
    shock_loss_std: float = Field(default=0.08, ge=0.0, le=0.5)
    start_net_worth: Optional[float] = Field(
        default=None,
        description="Override ledger net worth for simulation start (does not change ledger).",
    )
    annual_spending: Optional[float] = None
    monthly_income: Optional[float] = None
    withdrawal_strategy: str = "fixed_pct"
    fixed_withdrawal_pct: float = 0.04
    tax_jurisdiction: str = "US"
    filing_status: str = "single"
    state_code: Optional[str] = None
    tax_year_ruleset_id: Optional[str] = None
    social_security: Dict[str, Any] = Field(default_factory=dict)
    extra_contributions: Dict[str, Any] = Field(default_factory=dict)
    major_events: List[Dict[str, Any]] = Field(default_factory=list)
    checkpoints: List[PlanningCheckpoint] = Field(default_factory=list)
    annual_cashflow_events: List[PlanningCashflowEvent] = Field(default_factory=list)


class PlanningProfileCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    base_currency: str = Field(default="USD", min_length=3, max_length=3)
    payload: ProfilePayload = Field(default_factory=ProfilePayload)


class PlanningProfileUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=120)
    base_currency: Optional[str] = Field(None, min_length=3, max_length=3)
    payload: Optional[ProfilePayload] = None


class PlanningProfileResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    base_currency: str
    payload: ProfilePayload
    created_at: datetime
    updated_at: datetime
    disclaimer: str = SPECULATIVE_DISCLAIMER
    speculative: bool = True


class ToolDescriptor(BaseModel):
    tool_id: str
    name: str
    category: str
    summary: str
    parameters_schema: Dict[str, Any] = Field(default_factory=dict)


class PlanningToolsResponse(BaseModel):
    disclaimer: str = SPECULATIVE_DISCLAIMER
    tools: List[ToolDescriptor]


class PlanningInputsPreview(BaseModel):
    """Read-only snapshot fields for the Monte Carlo UI."""

    disclaimer: str = SPECULATIVE_DISCLAIMER
    as_of: datetime
    snapshot_hash: str
    net_worth_total: float
    net_worth_portfolio: float
    net_worth_liabilities: float
    avg_monthly_income: float
    avg_monthly_expense: float
    implied_annual_spending: float
    implied_annual_savings: float
    transaction_count: int
    annual_spending_source: str = Field(
        default="transactions.avg_monthly_expense",
        description="How implied_annual_spending was derived (matches MC when profile spending unset).",
    )


class PlanningRunCreate(BaseModel):
    tool_id: str
    profile_id: Optional[int] = None
    overrides: Dict[str, Any] = Field(default_factory=dict)
    seed: Optional[int] = 42
    n_paths: Optional[int] = Field(default=100, ge=100, le=50000)
    horizon_years: Optional[int] = Field(default=30, ge=1, le=80)


class PlanningRunResponse(BaseModel):
    id: int
    tool_id: str
    profile_id: Optional[int]
    status: str
    disclaimer: str = SPECULATIVE_DISCLAIMER
    speculative: bool = True
    input_snapshot_hash: str
    as_of: datetime
    seed: Optional[int] = None
    n_paths: Optional[int] = None
    horizon_years: Optional[int] = None
    result_summary: Dict[str, Any] = Field(default_factory=dict)
    result_artifacts: Dict[str, Any] = Field(default_factory=dict)
    started_at: datetime
    finished_at: Optional[datetime] = None


class TxStatsRequest(BaseModel):
    tool_id: str
    category: Optional[str] = None
    months: int = Field(default=24, ge=3, le=120)
    overrides: Dict[str, Any] = Field(default_factory=dict)


class TxStatsResponse(BaseModel):
    disclaimer: str = SPECULATIVE_DISCLAIMER
    tool_id: str
    as_of: datetime
    result_summary: Dict[str, Any] = Field(default_factory=dict)
    result_artifacts: Dict[str, Any] = Field(default_factory=dict)


class PlanningExportBundle(BaseModel):
    disclaimer: str = SPECULATIVE_DISCLAIMER
    run: PlanningRunResponse
    profile: Optional[PlanningProfileResponse] = None
    snapshot_hash: str
