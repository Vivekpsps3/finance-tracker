"""Lightweight SQLite migrations for existing finance.db files."""

from sqlalchemy import inspect, text


def run_sqlite_migrations(engine) -> None:
    if engine.dialect.name != "sqlite":
        return

    inspector = inspect(engine)
    if not inspector.has_table("transactions"):
        return

    existing = {c["name"] for c in inspector.get_columns("transactions")}
    alters = []
    if "source" not in existing:
        alters.append("ALTER TABLE transactions ADD COLUMN source VARCHAR DEFAULT 'manual'")
    if "bank_account_id" not in existing:
        alters.append("ALTER TABLE transactions ADD COLUMN bank_account_id INTEGER")
    if "dedupe_key" not in existing:
        alters.append("ALTER TABLE transactions ADD COLUMN dedupe_key VARCHAR")
    if "import_batch_id" not in existing:
        alters.append("ALTER TABLE transactions ADD COLUMN import_batch_id INTEGER")

    if not alters:
        return

    with engine.begin() as conn:
        for stmt in alters:
            conn.execute(text(stmt))
        conn.execute(
            text(
                "CREATE UNIQUE INDEX IF NOT EXISTS ix_transactions_dedupe_key "
                "ON transactions (dedupe_key) WHERE dedupe_key IS NOT NULL"
            )
        )