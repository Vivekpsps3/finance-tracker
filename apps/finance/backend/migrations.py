"""Column backfills for very old finance.db files (table creation is handled by create_all + Alembic)."""

from sqlalchemy import inspect, text


def _add_missing_columns(engine, table: str, columns: list[tuple[str, str]]) -> None:
    if not inspect(engine).has_table(table):
        return
    existing = {c["name"] for c in inspect(engine).get_columns(table)}
    alters = [ddl for name, ddl in columns if name not in existing]
    if not alters:
        return
    with engine.begin() as conn:
        for stmt in alters:
            conn.execute(text(stmt))


def run_sqlite_migrations(engine) -> None:
    if engine.dialect.name != "sqlite":
        return

    _add_missing_columns(
        engine,
        "transactions",
        [
            ("source", "ALTER TABLE transactions ADD COLUMN source VARCHAR DEFAULT 'manual'"),
            ("bank_account_id", "ALTER TABLE transactions ADD COLUMN bank_account_id INTEGER"),
            ("dedupe_key", "ALTER TABLE transactions ADD COLUMN dedupe_key VARCHAR"),
            ("import_batch_id", "ALTER TABLE transactions ADD COLUMN import_batch_id INTEGER"),
        ],
    )
    _add_missing_columns(engine, "brokerage_accounts", [("nickname", "ALTER TABLE brokerage_accounts ADD COLUMN nickname VARCHAR")])
    _add_missing_columns(
        engine,
        "job_incomes",
        [
            ("annual_taxes", "ALTER TABLE job_incomes ADD COLUMN annual_taxes FLOAT NOT NULL DEFAULT 0"),
            ("annual_deductions", "ALTER TABLE job_incomes ADD COLUMN annual_deductions FLOAT NOT NULL DEFAULT 0"),
            ("taxes_per_period", "ALTER TABLE job_incomes ADD COLUMN taxes_per_period FLOAT NOT NULL DEFAULT 0"),
            ("deductions_per_period", "ALTER TABLE job_incomes ADD COLUMN deductions_per_period FLOAT NOT NULL DEFAULT 0"),
        ],
    )
    _add_missing_columns(
        engine,
        "fixed_expenses",
        [
            ("end_date", "ALTER TABLE fixed_expenses ADD COLUMN end_date DATE"),
            ("due_day", "ALTER TABLE fixed_expenses ADD COLUMN due_day INTEGER"),
            ("autopay", "ALTER TABLE fixed_expenses ADD COLUMN autopay BOOLEAN NOT NULL DEFAULT 0"),
            ("payment_account", "ALTER TABLE fixed_expenses ADD COLUMN payment_account VARCHAR"),
        ],
    )
    _add_missing_columns(engine, "planning_scenario_runs", [("input_as_of", "ALTER TABLE planning_scenario_runs ADD COLUMN input_as_of VARCHAR")])

    if inspect(engine).has_table("transactions"):
        with engine.begin() as conn:
            conn.execute(
                text(
                    "CREATE UNIQUE INDEX IF NOT EXISTS ix_transactions_dedupe_key "
                    "ON transactions (dedupe_key) WHERE dedupe_key IS NOT NULL"
                )
            )
