import enum
from datetime import UTC, date, datetime

from sqlalchemy import (
    Boolean,
    Column,
    Date,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
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


class IncomePayFrequency(str, enum.Enum):
    annual = "annual"
    monthly = "monthly"
    semimonthly = "semimonthly"
    biweekly = "biweekly"
    weekly = "weekly"
    hourly = "hourly"


class FixedExpenseFrequency(str, enum.Enum):
    monthly = "monthly"
    annual = "annual"
    quarterly = "quarterly"
    biweekly = "biweekly"
    weekly = "weekly"


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


class UserRole(str, enum.Enum):
    admin = "admin"
    user = "user"


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    display_name = Column(String, nullable=False)
    role = Column(Enum(UserRole), default=UserRole.user, nullable=False)
    password_hash = Column(String, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False, index=True)
    must_change_password = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=utc_now, nullable=False)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now, nullable=False)
    last_login_at = Column(DateTime, nullable=True)
    username = Column(String, unique=True, index=True, nullable=True)
    auth_public_key_b64 = Column(Text, nullable=True)
    auth_algorithm = Column(String, nullable=True)
    auth_key_version = Column(Integer, nullable=True)
    auth_kdf_salt_b64 = Column(String, nullable=True)
    auth_kdf_iterations = Column(Integer, nullable=True)
    auth_wrapped_private_key_b64 = Column(Text, nullable=True)
    auth_recovery_wrapped_private_key_b64 = Column(Text, nullable=True)
    passwordless_enrolled_at = Column(DateTime, nullable=True)


class AuthChallenge(Base):
    __tablename__ = "auth_challenges"
    id = Column(Integer, primary_key=True, index=True)
    challenge_id = Column(String, unique=True, nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    challenge_hash = Column(String, unique=True, nullable=False, index=True)
    expires_at = Column(DateTime, nullable=False, index=True)
    consumed_at = Column(DateTime, nullable=True, index=True)
    created_at = Column(DateTime, default=utc_now, nullable=False)


class AuthEnrollment(Base):
    __tablename__ = "auth_enrollments"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    token_hash = Column(String, unique=True, nullable=False, index=True)
    expires_at = Column(DateTime, nullable=False, index=True)
    consumed_at = Column(DateTime, nullable=True, index=True)
    created_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    created_at = Column(DateTime, default=utc_now, nullable=False)


class UserSession(Base):
    __tablename__ = "user_sessions"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    token_hash = Column(String, unique=True, index=True, nullable=False)
    csrf_token_hash = Column(String, nullable=False)
    created_at = Column(DateTime, default=utc_now, nullable=False)
    expires_at = Column(DateTime, nullable=False, index=True)
    last_seen_at = Column(DateTime, default=utc_now, nullable=False)
    revoked_at = Column(DateTime, nullable=True, index=True)
    migration_only = Column(Boolean, default=False, nullable=False)
    user_agent = Column(String, nullable=True)
    ip_address = Column(String, nullable=True)


class AuditEvent(Base):
    __tablename__ = "audit_events"
    id = Column(Integer, primary_key=True, index=True)
    actor_user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    target_user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    event_type = Column(String, nullable=False, index=True)
    detail = Column(Text, nullable=True)
    created_at = Column(DateTime, default=utc_now, nullable=False, index=True)


class Bank(Base):
    __tablename__ = "banks"
    id = Column(Integer, primary_key=True, index=True)
    slug = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=False)


class BankAccount(Base):
    __tablename__ = "bank_accounts"
    __table_args__ = (UniqueConstraint("user_id", "bank_id", "account_mask", name="uq_user_bank_account_mask"),)
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    bank_id = Column(Integer, ForeignKey("banks.id"), nullable=False, index=True)
    account_mask = Column(String, nullable=False)
    label = Column(String, nullable=True)
    account_type = Column(String, default="credit_card", nullable=False)


class ImportBatch(Base):
    __tablename__ = "import_batches"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    bank_id = Column(Integer, ForeignKey("banks.id"), nullable=False)
    filename = Column(String, nullable=False)
    imported_at = Column(DateTime, default=utc_now, index=True)
    rows_inserted = Column(Integer, default=0)


class Transaction(Base):
    __tablename__ = "transactions"
    __table_args__ = (UniqueConstraint("user_id", "dedupe_key", name="uq_user_transaction_dedupe_key"),)
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    date = Column(Date, index=True)
    type = Column(Enum(TransactionType))
    category = Column(String)
    amount = Column(Float)
    description = Column(String, nullable=True)
    source = Column(String, default="manual", nullable=False)
    bank_account_id = Column(Integer, ForeignKey("bank_accounts.id"), nullable=True, index=True)
    dedupe_key = Column(String, nullable=True, index=True)
    import_batch_id = Column(Integer, ForeignKey("import_batches.id"), nullable=True)


class JobIncome(Base):
    __tablename__ = "job_incomes"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    employer = Column(String, nullable=False)
    role_title = Column(String, nullable=True)
    pay_frequency = Column(Enum(IncomePayFrequency), default=IncomePayFrequency.annual, nullable=False)
    base_pay = Column(Float, nullable=False)
    hours_per_week = Column(Float, nullable=True)
    annual_bonus = Column(Float, default=0, nullable=False)
    annual_equity = Column(Float, default=0, nullable=False)
    annual_other = Column(Float, default=0, nullable=False)
    annual_taxes = Column(Float, default=0, nullable=False)
    annual_deductions = Column(Float, default=0, nullable=False)
    taxes_per_period = Column(Float, default=0, nullable=False)
    deductions_per_period = Column(Float, default=0, nullable=False)
    effective_date = Column(Date, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False, index=True)
    notes = Column(String, nullable=True)
    created_at = Column(DateTime, default=utc_now)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now)


class FixedExpense(Base):
    __tablename__ = "fixed_expenses"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    name = Column(String, nullable=False)
    category = Column(String, nullable=False)
    amount = Column(Float, nullable=False)
    frequency = Column(Enum(FixedExpenseFrequency), default=FixedExpenseFrequency.monthly, nullable=False)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=True)
    due_day = Column(Integer, nullable=True)
    autopay = Column(Boolean, default=False, nullable=False)
    payment_account = Column(String, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False, index=True)
    notes = Column(String, nullable=True)
    created_at = Column(DateTime, default=utc_now)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now)


class Subscription(Base):
    __tablename__ = "subscriptions"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    name = Column(String, nullable=False)
    category = Column(String, default="Subscriptions", nullable=False)
    amount = Column(Float, nullable=False)
    frequency = Column(Enum(FixedExpenseFrequency), default=FixedExpenseFrequency.monthly, nullable=False)
    next_bill_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=True)
    payment_account = Column(String, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False, index=True)
    notes = Column(String, nullable=True)
    created_at = Column(DateTime, default=utc_now)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now)


class Holding(Base):
    __tablename__ = "holdings"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
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


class MarketResearchCache(Base):
    """Public market research payload cache keyed by symbol and period."""

    __tablename__ = "market_research_cache"
    symbol = Column(String, primary_key=True, index=True)
    period = Column(String, primary_key=True, default="10y", nullable=False)
    payload_json = Column(Text, nullable=False)
    source = Column(String, default="yfinance", nullable=False)
    fetched_at = Column(DateTime, nullable=False, index=True)
    expires_at = Column(DateTime, nullable=False, index=True)


class Brokerage(Base):
    __tablename__ = "brokerages"
    id = Column(Integer, primary_key=True, index=True)
    slug = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=False)


class BrokerageAccount(Base):
    __tablename__ = "brokerage_accounts"
    __table_args__ = (UniqueConstraint("user_id", "brokerage_id", "account_mask", name="uq_user_brokerage_account_mask"),)
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    brokerage_id = Column(Integer, ForeignKey("brokerages.id"), nullable=False, index=True)
    account_mask = Column(String, nullable=False)
    label = Column(String, nullable=True)
    nickname = Column(String, nullable=True)  # user-friendly name, e.g. "Roth IRA" or "Taxable"


class Asset(Base):
    __tablename__ = "assets"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
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
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
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
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    snapshot_date = Column(Date, default=date.today, nullable=False, index=True)
    other_assets = Column(Float, nullable=False)
    portfolio = Column(Float, nullable=False)
    liabilities = Column(Float, nullable=False)
    total_assets = Column(Float, nullable=False)
    total = Column(Float, nullable=False)
    as_of = Column(DateTime, default=utc_now, nullable=False, index=True)
    source = Column(String, default="manual", nullable=False)
    note = Column(String, nullable=True)


class PlanningAssumptionProfile(Base):
    """User assumption profile for speculative planning runs (not ledger truth)."""

    __tablename__ = "planning_assumption_profiles"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    name = Column(String, nullable=False)
    base_currency = Column(String, default="USD", nullable=False)
    payload_json = Column(String, nullable=False, default="{}")
    created_at = Column(DateTime, default=utc_now)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now)


class PlanningScenarioRun(Base):
    """Persisted speculative scenario run metadata and results."""

    __tablename__ = "planning_scenario_runs"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
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


class UserVault(Base):
    """Browser-owned DEK wraps only. Backend never sees passphrase or unwrapped key."""

    __tablename__ = "user_vaults"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, unique=True, index=True)
    kdf_algorithm = Column(String, nullable=False, default="PBKDF2")
    kdf_salt_b64 = Column(String, nullable=False)
    kdf_iterations = Column(Integer, nullable=False, default=310000)
    wrapped_dek_b64 = Column(Text, nullable=False)
    recovery_wrapped_dek_b64 = Column(Text, nullable=False)
    key_version = Column(Integer, nullable=False, default=1)
    created_at = Column(DateTime, default=utc_now, nullable=False)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now, nullable=False)


class EncryptedRecord(Base):
    """Opaque finance ciphertext. Backend validates ownership/metadata only."""

    __tablename__ = "encrypted_records"
    __table_args__ = (
        UniqueConstraint("user_id", "collection", "client_id", name="uq_user_collection_client_id"),
    )
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    collection = Column(String, nullable=False, index=True)
    client_id = Column(String, nullable=False, index=True)
    ciphertext_b64 = Column(Text, nullable=False)
    schema_version = Column(Integer, nullable=False, default=1)
    key_version = Column(Integer, nullable=False, default=1)
    revision = Column(Integer, nullable=False, default=1)
    created_at = Column(DateTime, default=utc_now, nullable=False)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now, nullable=False, index=True)


class EncryptedRecordIndex(Base):
    """Optional HMAC blind indexes for exact-match checks (e.g. import dedupe)."""

    __tablename__ = "encrypted_record_indexes"
    __table_args__ = (
        UniqueConstraint(
            "user_id", "collection", "index_name", "index_value_b64", name="uq_user_blind_index_value"
        ),
    )
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    collection = Column(String, nullable=False, index=True)
    client_id = Column(String, nullable=False, index=True)
    index_name = Column(String, nullable=False, index=True)
    index_value_b64 = Column(String, nullable=False)
    created_at = Column(DateTime, default=utc_now, nullable=False)


class UserCryptoMigration(Base):
    """Per-user migration status from legacy plaintext tables to encrypted records."""

    __tablename__ = "user_crypto_migrations"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, unique=True, index=True)
    status = Column(String, nullable=False, default="none", index=True)
    legacy_counts_json = Column(Text, nullable=True)
    encrypted_counts_json = Column(Text, nullable=True)
    error_message = Column(Text, nullable=True)
    verified_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=utc_now, nullable=False)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now, nullable=False)
