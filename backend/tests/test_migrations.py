"""P2-BE-3 / QA-007: SQLite migration and Alembic smoke tests."""

import os
import tempfile
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect, text

from migrations import run_sqlite_migrations


def _backend_dir() -> Path:
    return Path(__file__).resolve().parent.parent


def test_alembic_upgrade_head_on_legacy_holdings_sqlite():
    """Revision 44622d00bf4c expects an existing holdings table (legacy DB upgrade path)."""
    with tempfile.TemporaryDirectory() as tmp:
        db_path = Path(tmp) / "legacy_alembic.db"
        url = f"sqlite:///{db_path}"
        engine = create_engine(url, connect_args={"check_same_thread": False})
        with engine.begin() as conn:
            conn.execute(
                text(
                    """
                    CREATE TABLE holdings (
                        id INTEGER PRIMARY KEY,
                        symbol VARCHAR NOT NULL,
                        shares FLOAT,
                        purchase_price FLOAT,
                        purchase_date DATE
                    )
                    """
                )
            )
        engine.dispose()

        here = _backend_dir()
        cfg = Config(str(here / "alembic.ini"))
        cfg.set_main_option("script_location", str(here / "alembic"))
        cfg.set_main_option("sqlalchemy.url", url)
        prev_db_url = os.environ.get("DATABASE_URL")
        os.environ["DATABASE_URL"] = url
        try:
            command.upgrade(cfg, "head")
        finally:
            if prev_db_url is None:
                os.environ.pop("DATABASE_URL", None)
            else:
                os.environ["DATABASE_URL"] = prev_db_url

        engine2 = create_engine(url, connect_args={"check_same_thread": False})
        inspector = inspect(engine2)
        assert inspector.has_table("brokerages")
        assert inspector.has_table("brokerage_accounts")
        assert inspector.has_table("tax_documents")
        holdings_cols = {c["name"] for c in inspector.get_columns("holdings")}
        assert "brokerage_account_id" in holdings_cols
        assert inspector.has_table("net_worth_snapshots")
        engine2.dispose()


def test_run_sqlite_migrations_adds_transaction_columns_on_legacy_table():
    with tempfile.TemporaryDirectory() as tmp:
        url = f"sqlite:///{Path(tmp) / 'legacy.db'}"
        engine = create_engine(url, connect_args={"check_same_thread": False})
        with engine.begin() as conn:
            conn.execute(
                text(
                    """
                    CREATE TABLE transactions (
                        id INTEGER PRIMARY KEY,
                        date DATE,
                        type VARCHAR,
                        category VARCHAR,
                        amount FLOAT,
                        description VARCHAR
                    )
                    """
                )
            )
        run_sqlite_migrations(engine)
        cols = {c["name"] for c in inspect(engine).get_columns("transactions")}
        assert "source" in cols
        assert "bank_account_id" in cols
        assert "dedupe_key" in cols
        assert "import_batch_id" in cols
        engine.dispose()
