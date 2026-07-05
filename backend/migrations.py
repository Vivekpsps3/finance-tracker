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
    _ensure_job_income_tables(inspector, engine)
    _migrate_job_income_tables(inspector, engine)
    _ensure_fixed_expense_tables(inspector, engine)
    _migrate_fixed_expense_tables(inspector, engine)
    _ensure_subscription_tables(inspector, engine)
    _ensure_planning_tables(inspector, engine)
    _migrate_planning_runs(inspector, engine)


def _migrate_brokerage_accounts(inspector, engine) -> None:
    if not inspector.has_table("brokerage_accounts"):
        return
    existing = {c["name"] for c in inspector.get_columns("brokerage_accounts")}
    if "nickname" not in existing:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE brokerage_accounts ADD COLUMN nickname VARCHAR"))


def _ensure_job_income_tables(inspector, engine) -> None:
    if inspector.has_table("job_incomes"):
        return
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS job_incomes (
                    id INTEGER PRIMARY KEY,
                    user_id INTEGER NOT NULL,
                    employer VARCHAR NOT NULL,
                    role_title VARCHAR,
                    pay_frequency VARCHAR NOT NULL DEFAULT 'annual',
                    base_pay FLOAT NOT NULL,
                    hours_per_week FLOAT,
                    annual_bonus FLOAT NOT NULL DEFAULT 0,
                    annual_equity FLOAT NOT NULL DEFAULT 0,
                    annual_other FLOAT NOT NULL DEFAULT 0,
                    annual_taxes FLOAT NOT NULL DEFAULT 0,
                    annual_deductions FLOAT NOT NULL DEFAULT 0,
                    taxes_per_period FLOAT NOT NULL DEFAULT 0,
                    deductions_per_period FLOAT NOT NULL DEFAULT 0,
                    effective_date DATE NOT NULL,
                    is_active BOOLEAN NOT NULL DEFAULT 1,
                    notes VARCHAR,
                    created_at DATETIME,
                    updated_at DATETIME,
                    FOREIGN KEY(user_id) REFERENCES users(id)
                )
                """
            )
        )
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_job_incomes_user_id ON job_incomes (user_id)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_job_incomes_is_active ON job_incomes (is_active)"))


def _migrate_job_income_tables(inspector, engine) -> None:
    if not inspector.has_table("job_incomes"):
        return
    existing = {c["name"] for c in inspector.get_columns("job_incomes")}
    alters = []
    if "annual_taxes" not in existing:
        alters.append("ALTER TABLE job_incomes ADD COLUMN annual_taxes FLOAT NOT NULL DEFAULT 0")
    if "annual_deductions" not in existing:
        alters.append("ALTER TABLE job_incomes ADD COLUMN annual_deductions FLOAT NOT NULL DEFAULT 0")
    if "taxes_per_period" not in existing:
        alters.append("ALTER TABLE job_incomes ADD COLUMN taxes_per_period FLOAT NOT NULL DEFAULT 0")
    if "deductions_per_period" not in existing:
        alters.append("ALTER TABLE job_incomes ADD COLUMN deductions_per_period FLOAT NOT NULL DEFAULT 0")
    if alters:
        with engine.begin() as conn:
            for stmt in alters:
                conn.execute(text(stmt))


def _ensure_fixed_expense_tables(inspector, engine) -> None:
    if inspector.has_table("fixed_expenses"):
        return
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS fixed_expenses (
                    id INTEGER PRIMARY KEY,
                    user_id INTEGER NOT NULL,
                    name VARCHAR NOT NULL,
                    category VARCHAR NOT NULL,
                    amount FLOAT NOT NULL,
                    frequency VARCHAR NOT NULL DEFAULT 'monthly',
                    start_date DATE NOT NULL,
                    end_date DATE,
                    due_day INTEGER,
                    autopay BOOLEAN NOT NULL DEFAULT 0,
                    payment_account VARCHAR,
                    is_active BOOLEAN NOT NULL DEFAULT 1,
                    notes VARCHAR,
                    created_at DATETIME,
                    updated_at DATETIME,
                    FOREIGN KEY(user_id) REFERENCES users(id)
                )
                """
            )
        )
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_fixed_expenses_user_id ON fixed_expenses (user_id)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_fixed_expenses_is_active ON fixed_expenses (is_active)"))


def _migrate_fixed_expense_tables(inspector, engine) -> None:
    if not inspector.has_table("fixed_expenses"):
        return
    existing = {c["name"] for c in inspector.get_columns("fixed_expenses")}
    alters = []
    if "end_date" not in existing:
        alters.append("ALTER TABLE fixed_expenses ADD COLUMN end_date DATE")
    if "due_day" not in existing:
        alters.append("ALTER TABLE fixed_expenses ADD COLUMN due_day INTEGER")
    if "autopay" not in existing:
        alters.append("ALTER TABLE fixed_expenses ADD COLUMN autopay BOOLEAN NOT NULL DEFAULT 0")
    if "payment_account" not in existing:
        alters.append("ALTER TABLE fixed_expenses ADD COLUMN payment_account VARCHAR")
    if alters:
        with engine.begin() as conn:
            for stmt in alters:
                conn.execute(text(stmt))


def _ensure_subscription_tables(inspector, engine) -> None:
    if inspector.has_table("subscriptions"):
        return
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS subscriptions (
                    id INTEGER PRIMARY KEY,
                    user_id INTEGER NOT NULL,
                    name VARCHAR NOT NULL,
                    category VARCHAR NOT NULL DEFAULT 'Subscriptions',
                    amount FLOAT NOT NULL,
                    frequency VARCHAR NOT NULL DEFAULT 'monthly',
                    next_bill_date DATE NOT NULL,
                    end_date DATE,
                    payment_account VARCHAR,
                    is_active BOOLEAN NOT NULL DEFAULT 1,
                    notes VARCHAR,
                    created_at DATETIME,
                    updated_at DATETIME,
                    FOREIGN KEY(user_id) REFERENCES users(id)
                )
                """
            )
        )
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_subscriptions_user_id ON subscriptions (user_id)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_subscriptions_is_active ON subscriptions (is_active)"))


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
