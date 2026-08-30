"""add_app_native_auth_and_user_scoping

Revision ID: c7f6a2d4e901
Revises: b4e8f3a1c2d9
Create Date: 2026-07-03 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c7f6a2d4e901"
down_revision: Union[str, Sequence[str], None] = "b4e8f3a1c2d9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

user_role = sa.Enum("admin", "user", name="userrole")

OWNER_TABLES = [
    "bank_accounts",
    "import_batches",
    "transactions",
    "holdings",
    "brokerage_accounts",
    "assets",
    "liabilities",
    "net_worth_snapshots",
    "tax_documents",
    "planning_assumption_profiles",
    "planning_scenario_runs",
]


def _has_column(inspector, table: str, column: str) -> bool:
    return column in {c["name"] for c in inspector.get_columns(table)}


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)

    if not inspector.has_table("users"):
        op.create_table(
            "users",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("email", sa.String(), nullable=False),
            sa.Column("display_name", sa.String(), nullable=False),
            sa.Column("role", user_role, nullable=False),
            sa.Column("password_hash", sa.String(), nullable=False),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("must_change_password", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.Column("last_login_at", sa.DateTime(), nullable=True),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_users_id", "users", ["id"], unique=False)
        op.create_index("ix_users_email", "users", ["email"], unique=True)
        op.create_index("ix_users_is_active", "users", ["is_active"], unique=False)

    if not inspector.has_table("user_sessions"):
        op.create_table(
            "user_sessions",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("user_id", sa.Integer(), nullable=False),
            sa.Column("token_hash", sa.String(), nullable=False),
            sa.Column("csrf_token_hash", sa.String(), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("expires_at", sa.DateTime(), nullable=False),
            sa.Column("last_seen_at", sa.DateTime(), nullable=False),
            sa.Column("revoked_at", sa.DateTime(), nullable=True),
            sa.Column("user_agent", sa.String(), nullable=True),
            sa.Column("ip_address", sa.String(), nullable=True),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_user_sessions_id", "user_sessions", ["id"], unique=False)
        op.create_index("ix_user_sessions_user_id", "user_sessions", ["user_id"], unique=False)
        op.create_index("ix_user_sessions_token_hash", "user_sessions", ["token_hash"], unique=True)
        op.create_index("ix_user_sessions_expires_at", "user_sessions", ["expires_at"], unique=False)
        op.create_index("ix_user_sessions_revoked_at", "user_sessions", ["revoked_at"], unique=False)

    if not inspector.has_table("audit_events"):
        op.create_table(
            "audit_events",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("actor_user_id", sa.Integer(), nullable=True),
            sa.Column("target_user_id", sa.Integer(), nullable=True),
            sa.Column("event_type", sa.String(), nullable=False),
            sa.Column("detail", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["actor_user_id"], ["users.id"]),
            sa.ForeignKeyConstraint(["target_user_id"], ["users.id"]),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_audit_events_id", "audit_events", ["id"], unique=False)
        op.create_index("ix_audit_events_actor_user_id", "audit_events", ["actor_user_id"], unique=False)
        op.create_index("ix_audit_events_target_user_id", "audit_events", ["target_user_id"], unique=False)
        op.create_index("ix_audit_events_event_type", "audit_events", ["event_type"], unique=False)
        op.create_index("ix_audit_events_created_at", "audit_events", ["created_at"], unique=False)

    inspector = sa.inspect(conn)
    for table in OWNER_TABLES:
        if inspector.has_table(table) and not _has_column(inspector, table, "user_id"):
            with op.batch_alter_table(table) as batch_op:
                batch_op.add_column(sa.Column("user_id", sa.Integer(), nullable=True))
                batch_op.create_index(f"ix_{table}_user_id", ["user_id"])


def downgrade() -> None:
    # Destructive downgrade intentionally only removes auth-owned tables. SQLite
    # cannot safely drop owner columns from legacy tables without rewriting them.
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    for table in ("audit_events", "user_sessions", "users"):
        if inspector.has_table(table):
            op.drop_table(table)
