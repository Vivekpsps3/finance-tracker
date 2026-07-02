"""Lightweight SQLite migrations for existing finance.db files."""

from sqlalchemy import inspect, text


def run_sqlite_migrations(engine) -> None:
    if engine.dialect.name != "sqlite":
        return

    inspector = inspect(engine)

    if inspector.has_table("transactions"):
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

        if alters:
            with engine.begin() as conn:
                for stmt in alters:
                    conn.execute(text(stmt))
                conn.execute(
                    text(
                        "CREATE UNIQUE INDEX IF NOT EXISTS ix_transactions_dedupe_key "
                        "ON transactions (dedupe_key) WHERE dedupe_key IS NOT NULL"
                    )
                )

    _migrate_brokerage_accounts(inspector, engine)
    _ensure_planning_tables(inspector, engine)
    _migrate_planning_runs(inspector, engine)


def _migrate_brokerage_accounts(inspector, engine) -> None:
    if not inspector.has_table("brokerage_accounts"):
        return
    existing = {c["name"] for c in inspector.get_columns("brokerage_accounts")}
    if "nickname" not in existing:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE brokerage_accounts ADD COLUMN nickname VARCHAR"))


def _ensure_planning_tables(inspector, engine) -> None:
    if inspector.has_table("planning_assumption_profiles"):
        return
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS planning_assumption_profiles (
                    id INTEGER PRIMARY KEY,
                    name VARCHAR NOT NULL,
                    base_currency VARCHAR NOT NULL DEFAULT 'USD',
                    payload_json VARCHAR NOT NULL DEFAULT '{}',
                    created_at DATETIME,
                    updated_at DATETIME
                )
                """
            )
        )
        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS planning_scenario_runs (
                    id INTEGER PRIMARY KEY,
                    profile_id INTEGER,
                    tool_id VARCHAR NOT NULL,
                    seed INTEGER,
                    n_paths INTEGER,
                    horizon_years INTEGER,
                    overrides_json VARCHAR,
                    input_snapshot_hash VARCHAR NOT NULL,
                    input_as_of VARCHAR,
                    status VARCHAR NOT NULL DEFAULT 'pending',
                    result_summary_json VARCHAR,
                    result_artifacts_json VARCHAR,
                    started_at DATETIME,
                    finished_at DATETIME,
                    FOREIGN KEY(profile_id) REFERENCES planning_assumption_profiles(id)
                )
                """
            )
        )
        conn.execute(
            text(
                "CREATE INDEX IF NOT EXISTS ix_planning_scenario_runs_tool_id "
                "ON planning_scenario_runs (tool_id)"
            )
        )


def _migrate_planning_runs(inspector, engine) -> None:
    if not inspector.has_table("planning_scenario_runs"):
        return
    existing = {c["name"] for c in inspector.get_columns("planning_scenario_runs")}
    if "input_as_of" not in existing:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE planning_scenario_runs ADD COLUMN input_as_of VARCHAR"))
