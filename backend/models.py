import enum
from datetime import datetime

from sqlalchemy import (
    Column,
    Date,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import declarative_base

Base = declarative_base()


class TransactionType(str, enum.Enum):
    income = "income"
    expense = "expense"


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
    imported_at = Column(DateTime, default=datetime.utcnow, index=True)
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


class TickerQuote(Base):
    """Cached EOD close per symbol (SQLite); mirrored to Redis when configured."""

    __tablename__ = "ticker_quotes"
    symbol = Column(String, primary_key=True, index=True)
    close_price = Column(Float, nullable=False)
    quote_date = Column(Date, nullable=False)
    fetched_at = Column(DateTime, nullable=False, index=True)
    source = Column(String, default="sqlite_eod", nullable=False)


class NetWorthSnapshot(Base):
    __tablename__ = "net_worth_snapshots"
    id = Column(Integer, primary_key=True, index=True)
    recorded_at = Column(DateTime, index=True, default=datetime.utcnow)
    cash = Column(Float)
    portfolio = Column(Float)
    total = Column(Float)