from datetime import date, datetime
from typing import Dict, List, Optional

from pydantic import BaseModel, Field, field_validator

from constants import SYMBOL_PATTERN
from models import TransactionType


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

    class Config:
        from_attributes = True


class NetWorthResponse(BaseModel):
    cash: float
    portfolio: float
    total: float
    as_of: datetime
    portfolio_sources: Dict[str, str]


class NetWorthHistoryPoint(BaseModel):
    date: str
    cash: float
    portfolio: float
    total: float


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