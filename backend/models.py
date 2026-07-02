import enum
from datetime import UTC, date, datetime

from sqlalchemy import (
    Column,
    Date,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    LargeBinary,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import declarative_base

Base = declarative_base()


def utc_now() -> datetime:
    return datetime.now(UTC)


class TransactionType(str, enum.Enum):
    income = "income"
    expense = "expense"


class AssetCategory(str, enum.Enum):
    cash = "cash"
    checking = "checking"
    savings = "savings"
    real_estate = "real_estate"
    vehicle = "vehicle"
    other = "other"


class LiabilityCategory(str, enum.Enum):
    mortgage = "mortgage"
    auto_loan = "auto_loan"
    student_loan = "student_loan"
    credit_card = "credit_card"
    personal_loan = "personal_loan"
    other = "other"


class TaxDocumentType(str, enum.Enum):
    w2 = "w2"
    form_1099 = "1099"
    form_1098 = "1098"
    form_5498 = "5498"
    tax_return_1040 = "1040"
    state_return = "state_return"
    property_tax = "property_tax"
    other = "other"


class Bank(Base):
    __tablename__ = "banks"
    id = Column(Integer, primary_key=True, index=True)
    slug = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=False)


class BankAccount(Base):
    __tablename__ = "bank_accounts"
    __table_args__ = (UniqueConstraint("bank_id", "account_mask", name="uq_bank_account_mask"),)
    id = Column(Integer, primary_key=True, index=True)
    bank_id = Column(Integer, ForeignKey("banks.id"), nullable=False, index=True)
    account_mask = Column(String, nullable=False)
    label = Column(String, nullable=True)
    account_type = Column(String, default="credit_card", nullable=False)


class ImportBatch(Base):
    __tablename__ = "import_batches"
    id = Column(Integer, primary_key=True, index=True)
    bank_id = Column(Integer, ForeignKey("banks.id"), nullable=False)
    filename = Column(String, nullable=False)
    imported_at = Column(DateTime, default=utc_now, index=True)
    rows_inserted = Column(Integer, default=0)


class Transaction(Base):
    __tablename__ = "transactions"
    id = Column(Integer, primary_key=True, index=True)
    date = Column(Date, index=True)
    type = Column(Enum(TransactionType))
    category = Column(String)
    amount = Column(Float)
    description = Column(String, nullable=True)
    source = Column(String, default="manual", nullable=False)
    bank_account_id = Column(Integer, ForeignKey("bank_accounts.id"), nullable=True, index=True)
    dedupe_key = Column(String, nullable=True, unique=True, index=True)
    import_batch_id = Column(Integer, ForeignKey("import_batches.id"), nullable=True)


class Holding(Base):
    __tablename__ = "holdings"
    id = Column(Integer, primary_key=True, index=True)
    symbol = Column(String, index=True)
    shares = Column(Float)
    purchase_price = Column(Float)
    purchase_date = Column(Date)
    brokerage_account_id = Column(Integer, ForeignKey("brokerage_accounts.id"), nullable=True, index=True)


class TickerQuote(Base):
    """Cached EOD close per symbol (SQLite); mirrored to Redis when configured."""

    __tablename__ = "ticker_quotes"
    symbol = Column(String, primary_key=True, index=True)
    close_price = Column(Float, nullable=False)
    quote_date = Column(Date, nullable=False)
    fetched_at = Column(DateTime, nullable=False, index=True)
    source = Column(String, default="sqlite_eod", nullable=False)


class Brokerage(Base):
    __tablename__ = "brokerages"
    id = Column(Integer, primary_key=True, index=True)
    slug = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=False)


class BrokerageAccount(Base):
    __tablename__ = "brokerage_accounts"
    __table_args__ = (UniqueConstraint("brokerage_id", "account_mask", name="uq_brokerage_account_mask"),)
    id = Column(Integer, primary_key=True, index=True)
    brokerage_id = Column(Integer, ForeignKey("brokerages.id"), nullable=False, index=True)
    account_mask = Column(String, nullable=False)
    label = Column(String, nullable=True)
    nickname = Column(String, nullable=True)  # user-friendly name, e.g. "Roth IRA" or "Taxable"


class Asset(Base):
    __tablename__ = "assets"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    category = Column(Enum(AssetCategory), nullable=False)
    current_value = Column(Float, nullable=False)
    as_of_date = Column(Date, nullable=False)
    notes = Column(String, nullable=True)
    created_at = Column(DateTime, default=utc_now)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now)


class Liability(Base):
    __tablename__ = "liabilities"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    category = Column(Enum(LiabilityCategory), nullable=False)
    balance_owed = Column(Float, nullable=False)
    as_of_date = Column(Date, nullable=False)
    notes = Column(String, nullable=True)
    created_at = Column(DateTime, default=utc_now)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now)


class NetWorthSnapshot(Base):
    """Observed net worth at a point in time.

    This is deliberately derived from balance-sheet data only:
    manual assets + holdings market value - liabilities.
    """

    __tablename__ = "net_worth_snapshots"
    id = Column(Integer, primary_key=True, index=True)
    snapshot_date = Column(Date, default=date.today, nullable=False, index=True)
    other_assets = Column(Float, nullable=False)
    portfolio = Column(Float, nullable=False)
    liabilities = Column(Float, nullable=False)
    total_assets = Column(Float, nullable=False)
    total = Column(Float, nullable=False)
    as_of = Column(DateTime, default=utc_now, nullable=False, index=True)
    source = Column(String, default="manual", nullable=False)
    note = Column(String, nullable=True)


class TaxDocument(Base):
    """Official tax document stored in SQLite for repo-local portability."""

    __tablename__ = "tax_documents"
    id = Column(Integer, primary_key=True, index=True)
    tax_year = Column(Integer, nullable=False, index=True)
    document_type = Column(Enum(TaxDocumentType), nullable=False, index=True)
    issuer = Column(String, nullable=True)
    taxpayer = Column(String, nullable=True)
    filename = Column(String, nullable=False)
    content_type = Column(String, nullable=False)
    size_bytes = Column(Integer, nullable=False)
    sha256 = Column(String, nullable=False, index=True)
    file_bytes = Column(LargeBinary, nullable=False)
    summary_json = Column(Text, nullable=False, default="{}")
    notes = Column(String, nullable=True)
    uploaded_at = Column(DateTime, default=utc_now, nullable=False, index=True)


class PlanningAssumptionProfile(Base):
    """User assumption profile for speculative planning runs (not ledger truth)."""

    __tablename__ = "planning_assumption_profiles"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    base_currency = Column(String, default="USD", nullable=False)
    payload_json = Column(String, nullable=False, default="{}")
    created_at = Column(DateTime, default=utc_now)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now)


class PlanningScenarioRun(Base):
    """Persisted speculative scenario run metadata and results."""

    __tablename__ = "planning_scenario_runs"
    id = Column(Integer, primary_key=True, index=True)
    profile_id = Column(Integer, ForeignKey("planning_assumption_profiles.id"), nullable=True, index=True)
    tool_id = Column(String, nullable=False, index=True)
    seed = Column(Integer, nullable=True)
    n_paths = Column(Integer, nullable=True)
    horizon_years = Column(Integer, nullable=True)
    overrides_json = Column(String, nullable=True)
    input_snapshot_hash = Column(String, nullable=False)
    input_as_of = Column(String, nullable=True)
    status = Column(String, default="pending", nullable=False)
    result_summary_json = Column(String, nullable=True)
    result_artifacts_json = Column(String, nullable=True)
    started_at = Column(DateTime, default=utc_now)
    finished_at = Column(DateTime, nullable=True)
