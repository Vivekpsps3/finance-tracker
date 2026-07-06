from datetime import date, datetime
from typing import Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

from constants import SYMBOL_PATTERN
from models import (
    AssetCategory,
    FixedExpenseFrequency,
    IncomePayFrequency,
    LiabilityCategory,
    TaxDocumentType,
    TransactionType,
)


class TransactionCreate(BaseModel):
    date: date
    type: TransactionType
    category: str = Field(..., min_length=1, max_length=100)
    amount: float = Field(..., gt=0)
    description: Optional[str] = Field(None, max_length=500)

    @field_validator("amount")
    @classmethod
    def amount_must_be_positive(cls, v: float) -> float:
        if v <= 0:
            raise ValueError("Amount must be positive")
        return round(v, 2)


class HoldingCreate(BaseModel):
    symbol: str = Field(..., min_length=1, max_length=10)
    shares: float = Field(..., gt=0)
    purchase_price: float = Field(..., gt=0)
    purchase_date: date

    @field_validator("symbol")
    @classmethod
    def symbol_valid(cls, v: str) -> str:
        upper = v.upper().strip()
        if not SYMBOL_PATTERN.match(upper):
            raise ValueError("Invalid symbol format")
        return upper


class TransactionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    date: date
    type: str
    category: str
    amount: float
    description: Optional[str] = None
    source: str = "manual"
    account_display: Optional[str] = None


class TransactionCategoryRenameRequest(BaseModel):
    from_category: str = Field(..., min_length=1, max_length=100)
    to_category: str = Field(..., min_length=1, max_length=100)

    @field_validator("from_category", "to_category")
    @classmethod
    def category_not_blank(cls, value: str) -> str:
        clean = value.strip()
        if not clean:
            raise ValueError("Category is required")
        return clean


class TransactionCategoryRenameResponse(BaseModel):
    from_category: str
    to_category: str
    updated: int


class TransactionCategoryBulkRenameItem(BaseModel):
    from_category: str = Field(..., min_length=1, max_length=100)
    to_category: str = Field(..., min_length=1, max_length=100)

    @field_validator("from_category", "to_category")
    @classmethod
    def category_not_blank(cls, value: str) -> str:
        clean = value.strip()
        if not clean:
            raise ValueError("Category is required")
        return clean


class TransactionCategoryBulkRenameRequest(BaseModel):
    renames: List[TransactionCategoryBulkRenameItem] = Field(..., min_length=1, max_length=100)


class TransactionCategoryBulkRenameDetail(BaseModel):
    from_category: str
    to_category: str
    updated: int


class TransactionCategoryBulkRenameResponse(BaseModel):
    updated: int
    renames: List[TransactionCategoryBulkRenameDetail]


class JobIncomeBase(BaseModel):
    employer: str = Field(..., min_length=1, max_length=120)
    role_title: Optional[str] = Field(None, max_length=120)
    pay_frequency: IncomePayFrequency = IncomePayFrequency.annual
    base_pay: float = Field(..., ge=0)
    hours_per_week: Optional[float] = Field(None, ge=0, le=168)
    annual_bonus: float = Field(0, ge=0)
    annual_equity: float = Field(0, ge=0)
    annual_other: float = Field(0, ge=0)
    annual_taxes: float = Field(0, ge=0)
    annual_deductions: float = Field(0, ge=0)
    taxes_per_period: float = Field(0, ge=0)
    deductions_per_period: float = Field(0, ge=0)
    effective_date: date
    is_active: bool = True
    notes: Optional[str] = Field(None, max_length=500)

    @field_validator("employer")
    @classmethod
    def employer_not_blank(cls, value: str) -> str:
        clean = value.strip()
        if not clean:
            raise ValueError("Employer is required")
        return clean

    @field_validator("role_title", "notes")
    @classmethod
    def trim_optional_text(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return value
        clean = value.strip()
        return clean or None

    @field_validator(
        "base_pay",
        "hours_per_week",
        "annual_bonus",
        "annual_equity",
        "annual_other",
        "annual_taxes",
        "annual_deductions",
        "taxes_per_period",
        "deductions_per_period",
    )
    @classmethod
    def round_moneyish_values(cls, value: Optional[float]) -> Optional[float]:
        if value is None:
            return value
        return round(value, 2)


class JobIncomeCreate(JobIncomeBase):
    pass


class JobIncomeUpdate(BaseModel):
    employer: Optional[str] = Field(None, min_length=1, max_length=120)
    role_title: Optional[str] = Field(None, max_length=120)
    pay_frequency: Optional[IncomePayFrequency] = None
    base_pay: Optional[float] = Field(None, ge=0)
    hours_per_week: Optional[float] = Field(None, ge=0, le=168)
    annual_bonus: Optional[float] = Field(None, ge=0)
    annual_equity: Optional[float] = Field(None, ge=0)
    annual_other: Optional[float] = Field(None, ge=0)
    annual_taxes: Optional[float] = Field(None, ge=0)
    annual_deductions: Optional[float] = Field(None, ge=0)
    taxes_per_period: Optional[float] = Field(None, ge=0)
    deductions_per_period: Optional[float] = Field(None, ge=0)
    effective_date: Optional[date] = None
    is_active: Optional[bool] = None
    notes: Optional[str] = Field(None, max_length=500)

    @field_validator("employer")
    @classmethod
    def employer_not_blank(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return value
        clean = value.strip()
        if not clean:
            raise ValueError("Employer is required")
        return clean

    @field_validator("role_title", "notes")
    @classmethod
    def trim_optional_text(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return value
        clean = value.strip()
        return clean or None


class JobIncomeResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    employer: str
    role_title: Optional[str] = None
    pay_frequency: str
    base_pay: float
    hours_per_week: Optional[float] = None
    annual_bonus: float
    annual_equity: float
    annual_other: float
    annual_taxes: float
    annual_deductions: float
    taxes_per_period: float
    deductions_per_period: float
    effective_date: date
    is_active: bool
    notes: Optional[str] = None
    pay_periods_per_year: int
    annual_base_pay: float
    annual_gross: float
    monthly_gross: float
    period_gross: float
    period_net: float
    annual_net: float
    monthly_net: float
    created_at: datetime
    updated_at: datetime


class FixedExpenseBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    category: str = Field("Rent", min_length=1, max_length=100)
    amount: float = Field(..., ge=0)
    frequency: FixedExpenseFrequency = FixedExpenseFrequency.monthly
    start_date: date
    end_date: Optional[date] = None
    due_day: Optional[int] = Field(None, ge=1, le=31)
    autopay: bool = False
    payment_account: Optional[str] = Field(None, max_length=120)
    is_active: bool = True
    notes: Optional[str] = Field(None, max_length=500)

    @field_validator("name", "category")
    @classmethod
    def required_text_not_blank(cls, value: str) -> str:
        clean = value.strip()
        if not clean:
            raise ValueError("Value is required")
        return clean

    @field_validator("notes", "payment_account")
    @classmethod
    def trim_optional_text(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return value
        clean = value.strip()
        return clean or None

    @field_validator("amount")
    @classmethod
    def round_amount(cls, value: float) -> float:
        return round(value, 2)


class FixedExpenseCreate(FixedExpenseBase):
    pass


class FixedExpenseUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=120)
    category: Optional[str] = Field(None, min_length=1, max_length=100)
    amount: Optional[float] = Field(None, ge=0)
    frequency: Optional[FixedExpenseFrequency] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    due_day: Optional[int] = Field(None, ge=1, le=31)
    autopay: Optional[bool] = None
    payment_account: Optional[str] = Field(None, max_length=120)
    is_active: Optional[bool] = None
    notes: Optional[str] = Field(None, max_length=500)

    @field_validator("name", "category")
    @classmethod
    def optional_text_not_blank(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return value
        clean = value.strip()
        if not clean:
            raise ValueError("Value is required")
        return clean

    @field_validator("notes", "payment_account")
    @classmethod
    def trim_optional_text(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return value
        clean = value.strip()
        return clean or None


class FixedExpenseResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    category: str
    amount: float
    frequency: str
    start_date: date
    end_date: Optional[date] = None
    due_day: Optional[int] = None
    autopay: bool
    payment_account: Optional[str] = None
    is_active: bool
    notes: Optional[str] = None
    next_due_date: date
    monthly_amount: float
    annual_amount: float
    created_at: datetime
    updated_at: datetime


class SubscriptionBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    category: str = Field("Subscriptions", min_length=1, max_length=100)
    amount: float = Field(..., ge=0)
    frequency: FixedExpenseFrequency = FixedExpenseFrequency.monthly
    next_bill_date: date
    end_date: Optional[date] = None
    payment_account: Optional[str] = Field(None, max_length=120)
    is_active: bool = True
    notes: Optional[str] = Field(None, max_length=500)

    @field_validator("name", "category")
    @classmethod
    def subscription_required_text(cls, value: str) -> str:
        clean = value.strip()
        if not clean:
            raise ValueError("Value is required")
        return clean

    @field_validator("notes", "payment_account")
    @classmethod
    def subscription_optional_text(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return value
        clean = value.strip()
        return clean or None

    @field_validator("amount")
    @classmethod
    def subscription_round_amount(cls, value: float) -> float:
        return round(value, 2)


class SubscriptionCreate(SubscriptionBase):
    pass


class SubscriptionUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=120)
    category: Optional[str] = Field(None, min_length=1, max_length=100)
    amount: Optional[float] = Field(None, ge=0)
    frequency: Optional[FixedExpenseFrequency] = None
    next_bill_date: Optional[date] = None
    end_date: Optional[date] = None
    payment_account: Optional[str] = Field(None, max_length=120)
    is_active: Optional[bool] = None
    notes: Optional[str] = Field(None, max_length=500)

    @field_validator("name", "category")
    @classmethod
    def subscription_optional_required(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return value
        clean = value.strip()
        if not clean:
            raise ValueError("Value is required")
        return clean

    @field_validator("notes", "payment_account")
    @classmethod
    def subscription_update_optional_text(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return value
        clean = value.strip()
        return clean or None


class SubscriptionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    category: str
    amount: float
    frequency: str
    next_bill_date: date
    end_date: Optional[date] = None
    payment_account: Optional[str] = None
    is_active: bool
    notes: Optional[str] = None
    next_due_date: date
    monthly_amount: float
    annual_amount: float
    created_at: datetime
    updated_at: datetime


class CashflowOccurrence(BaseModel):
    date: date
    name: str
    category: str
    amount: float


class CashflowSummaryResponse(BaseModel):
    start_date: date
    end_date: date
    transaction_income: float
    transaction_expenses: float
    planned_income: float
    fixed_expenses: float
    subscriptions: float
    total_income: float
    total_expenses: float
    net_cashflow: float
    savings_rate: Optional[float] = None
    average_daily_spend: float
    fixed_occurrences: List[CashflowOccurrence]
    subscription_occurrences: List[CashflowOccurrence]


class HoldingResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    symbol: str
    shares: float
    purchase_price: float
    purchase_date: date
    current_price: float
    value: float
    price_source: str
    price_as_of: Optional[datetime] = None
    account_display: Optional[str] = None
    company_name: Optional[str] = None
    brokerage_account_id: Optional[int] = None


class AssetCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    category: AssetCategory
    current_value: float = Field(..., ge=0)
    as_of_date: date
    notes: Optional[str] = Field(None, max_length=500)

    @field_validator("current_value")
    @classmethod
    def round_value(cls, v: float) -> float:
        return round(v, 2)


class AssetUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=120)
    category: Optional[AssetCategory] = None
    current_value: Optional[float] = Field(None, ge=0)
    as_of_date: Optional[date] = None
    notes: Optional[str] = Field(None, max_length=500)


class AssetResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    category: str
    current_value: float
    as_of_date: date
    notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class LiabilityCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    category: LiabilityCategory
    balance_owed: float = Field(..., ge=0)
    as_of_date: date
    notes: Optional[str] = Field(None, max_length=500)

    @field_validator("balance_owed")
    @classmethod
    def round_balance(cls, v: float) -> float:
        return round(v, 2)


class LiabilityUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=120)
    category: Optional[LiabilityCategory] = None
    balance_owed: Optional[float] = Field(None, ge=0)
    as_of_date: Optional[date] = None
    notes: Optional[str] = Field(None, max_length=500)


class LiabilityResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    category: str
    balance_owed: float
    as_of_date: date
    notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class NetWorthResponse(BaseModel):
    other_assets: float
    portfolio: float
    liabilities: float
    total_assets: float
    total: float
    as_of: datetime
    portfolio_sources: Dict[str, str]
    portfolio_breakdown: Dict[str, float] = {}  # e.g. {"Fidelity ···Z21741448 (Individual)": 1234.56, "Manual": 500.0, ...}


class TaxDocumentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    tax_year: int
    document_type: str
    issuer: Optional[str] = None
    taxpayer: Optional[str] = None
    filename: str
    content_type: str
    size_bytes: int
    sha256: str
    summary: Dict[str, float] = {}
    notes: Optional[str] = None
    uploaded_at: datetime


class TaxYearSummary(BaseModel):
    tax_year: int
    document_count: int
    total_size_bytes: int
    document_counts: Dict[str, int]
    totals: Dict[str, float]
    missing_recommended: List[str]
    documents: List[TaxDocumentResponse]


class TransactionUpdate(BaseModel):
    date: Optional[date] = None
    type: Optional[TransactionType] = None
    category: Optional[str] = Field(None, min_length=1, max_length=100)
    amount: Optional[float] = Field(None, gt=0)
    description: Optional[str] = Field(None, max_length=500)


class HoldingUpdate(BaseModel):
    symbol: Optional[str] = Field(None, min_length=1, max_length=10)
    shares: Optional[float] = Field(None, gt=0)
    purchase_price: Optional[float] = Field(None, gt=0)
    purchase_date: Optional[date] = None

    @field_validator("symbol")
    @classmethod
    def symbol_valid(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        upper = v.upper().strip()
        if not SYMBOL_PATTERN.match(upper):
            raise ValueError("Invalid symbol format")
        return upper


class MarketPriceResponse(BaseModel):
    symbol: str
    price: float
    price_source: str
    price_as_of: Optional[datetime] = None
    valid: bool


class ImportPreviewRow(BaseModel):
    dedupe_key: str
    date: date
    account_mask: str
    account_display: str
    description: str
    category: str
    amount: float
    status: str


class ImportPreviewResponse(BaseModel):
    bank: str
    filename: str
    rows: List[ImportPreviewRow]
    summary: Dict[str, int]


class ImportCommitRow(BaseModel):
    dedupe_key: str
    date: date
    account_mask: str = Field(..., min_length=1, max_length=32)
    description: str = Field(..., max_length=500)
    category: str = Field(..., min_length=1, max_length=100)
    amount: float = Field(..., gt=0)


class ImportCommitRequest(BaseModel):
    filename: str = Field(..., min_length=1, max_length=255)
    rows: List[ImportCommitRow] = Field(..., min_length=1)


class ImportCommitResponse(BaseModel):
    inserted: int
    skipped: int
    batch_id: int


class BankImportOption(BaseModel):
    slug: str
    name: str
    hint: str
    file_extensions: List[str]


class SetAccountNickname(BaseModel):
    nickname: Optional[str] = None


class BrokerageAccountResponse(BaseModel):
    id: int
    nickname: Optional[str] = None
    label: Optional[str] = None
    account_mask: str


# Fidelity portfolio (holdings) import types — separate from bank tx imports
# (replace semantics per account, not dedupe/append)

class FidelityImportOption(BaseModel):
    slug: str
    name: str
    hint: str
    file_extensions: List[str]


class FidelityPreviewRow(BaseModel):
    account_mask: str
    account_display: str
    symbol: str
    shares: float
    avg_cost_basis: float
    cost_basis_total: float
    # status for UI: 'replace' (all will be reset for the account)
    status: str = "replace"


class FidelityPreviewResponse(BaseModel):
    broker: str
    filename: str
    accounts: List[str]
    rows: List[FidelityPreviewRow]
    summary: Dict[str, int | float]  # e.g. accounts, positions, total_cost


class FidelityCommitRow(BaseModel):
    account_mask: str = Field(..., min_length=1, max_length=32)
    symbol: str = Field(..., min_length=1, max_length=10)
    shares: float = Field(..., gt=0)
    avg_cost_basis: float = Field(..., ge=0)


class FidelityCommitRequest(BaseModel):
    filename: str = Field(..., min_length=1, max_length=255)
    rows: List[FidelityCommitRow] = Field(..., min_length=1)


class FidelityCommitResponse(BaseModel):
    accounts_replaced: int
    holdings_replaced: int
    inserted: int
    accounts: List[str]
