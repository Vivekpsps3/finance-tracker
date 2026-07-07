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
        assert not inspector.has_table("tax_documents")
        holdings_cols = {c["name"] for c in inspector.get_columns("holdings")}
        assert "brokerage_account_id" in holdings_cols
        assert inspector.has_table("net_worth_snapshots")
        assert inspector.has_table("user_vaults")
        assert inspector.has_table("encrypted_records")
        assert inspector.has_table("encrypted_record_indexes")
        assert inspector.has_table("user_crypto_migrations")
        engine2.dispose()


def test_vault_migration_is_idempotent_after_create_all():
    """Startup runs create_all then alembic; vault migration must not crash on existing tables."""
    with tempfile.TemporaryDirectory() as tmp:
        db_path = Path(tmp) / "create_all_then_alembic.db"
        url = f"sqlite:///{db_path}"
        engine = create_engine(url, connect_args={"check_same_thread": False})

        # Minimal users table so FK targets exist, then create vault tables as create_all would.
        with engine.begin() as conn:
            conn.execute(
                text(
                    """
                    CREATE TABLE users (
                        id INTEGER PRIMARY KEY,
                        email VARCHAR NOT NULL,
                        display_name VARCHAR NOT NULL,
                        role VARCHAR NOT NULL,
                        password_hash VARCHAR NOT NULL,
                        is_active BOOLEAN NOT NULL,
                        must_change_password BOOLEAN NOT NULL,
                        created_at DATETIME NOT NULL,
                        updated_at DATETIME NOT NULL,
                        last_login_at DATETIME
                    )
                    """
                )
            )
            conn.execute(text("CREATE TABLE alembic_version (version_num VARCHAR(32) NOT NULL)"))
            conn.execute(text("INSERT INTO alembic_version (version_num) VALUES ('f2d8c6a4b913')"))
            for ddl in (
                """
                CREATE TABLE user_vaults (
                    id INTEGER PRIMARY KEY,
                    user_id INTEGER NOT NULL,
                    kdf_algorithm VARCHAR NOT NULL,
                    kdf_salt_b64 VARCHAR NOT NULL,
                    kdf_iterations INTEGER NOT NULL,
                    wrapped_dek_b64 TEXT NOT NULL,
                    recovery_wrapped_dek_b64 TEXT NOT NULL,
                    key_version INTEGER NOT NULL,
                    created_at DATETIME NOT NULL,
                    updated_at DATETIME NOT NULL,
                    FOREIGN KEY(user_id) REFERENCES users (id)
                )
                """,
                """
                CREATE TABLE encrypted_records (
                    id INTEGER PRIMARY KEY,
                    user_id INTEGER NOT NULL,
                    collection VARCHAR NOT NULL,
                    client_id VARCHAR NOT NULL,
                    ciphertext_b64 TEXT NOT NULL,
                    schema_version INTEGER NOT NULL,
                    key_version INTEGER NOT NULL,
                    revision INTEGER NOT NULL,
                    created_at DATETIME NOT NULL,
                    updated_at DATETIME NOT NULL,
                    FOREIGN KEY(user_id) REFERENCES users (id)
                )
                """,
                """
                CREATE TABLE encrypted_record_indexes (
                    id INTEGER PRIMARY KEY,
                    user_id INTEGER NOT NULL,
                    collection VARCHAR NOT NULL,
                    client_id VARCHAR NOT NULL,
                    index_name VARCHAR NOT NULL,
                    index_value_b64 VARCHAR NOT NULL,
                    created_at DATETIME NOT NULL,
                    FOREIGN KEY(user_id) REFERENCES users (id)
                )
                """,
                """
                CREATE TABLE user_crypto_migrations (
                    id INTEGER PRIMARY KEY,
                    user_id INTEGER NOT NULL,
                    status VARCHAR NOT NULL,
                    legacy_counts_json TEXT,
                    encrypted_counts_json TEXT,
                    error_message TEXT,
                    verified_at DATETIME,
                    completed_at DATETIME,
                    created_at DATETIME NOT NULL,
                    updated_at DATETIME NOT NULL,
                    FOREIGN KEY(user_id) REFERENCES users (id)
                )
                """,
            ):
                conn.execute(text(ddl))
        engine.dispose()

        here = _backend_dir()
        cfg = Config(str(here / "alembic.ini"))
        cfg.set_main_option("script_location", str(here / "alembic"))
        cfg.set_main_option("sqlalchemy.url", url)
        prev_db_url = os.environ.get("DATABASE_URL")
        os.environ["DATABASE_URL"] = url
        try:
            command.upgrade(cfg, "head")
            command.upgrade(cfg, "head")  # second pass must be a no-op
        finally:
            if prev_db_url is None:
                os.environ.pop("DATABASE_URL", None)
            else:
                os.environ["DATABASE_URL"] = prev_db_url

        engine2 = create_engine(url, connect_args={"check_same_thread": False})
        with engine2.connect() as conn:
            version = conn.execute(text("SELECT version_num FROM alembic_version")).scalar_one()
        assert version == "a1b2c3d4e5f6"
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
