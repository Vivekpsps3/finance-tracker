from datetime import date, datetime
from typing import Dict, List, Optional

from pydantic import BaseModel, Field, field_validator

from constants import SYMBOL_PATTERN
from models import AssetCategory, LiabilityCategory, TransactionType


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
    id: int
    date: date
    type: str
    category: str
    amount: float
    description: Optional[str] = None
    source: str = "manual"
    account_display: Optional[str] = None

    class Config:
        from_attributes = True


class HoldingResponse(BaseModel):
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

    class Config:
        from_attributes = True


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
    id: int
    name: str
    category: str
    current_value: float
    as_of_date: date
    notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


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
    id: int
    name: str
    category: str
    balance_owed: float
    as_of_date: date
    notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class NetWorthResponse(BaseModel):
    other_assets: float
    portfolio: float
    liabilities: float
    total_assets: float
    total: float
    as_of: datetime
    portfolio_sources: Dict[str, str]
    portfolio_breakdown: Dict[str, float] = {}  # e.g. {"Fidelity ···Z21741448 (Individual)": 1234.56, "Manual": 500.0, ...}


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