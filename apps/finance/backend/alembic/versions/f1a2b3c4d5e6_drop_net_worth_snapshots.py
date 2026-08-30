"""drop_net_worth_snapshots

Revision ID: f1a2b3c4d5e6
Revises: e8a4c7d2f910
Create Date: 2026-07-11 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "f1a2b3c4d5e6"
down_revision: Union[str, Sequence[str], None] = "e8a4c7d2f910"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    if sa.inspect(conn).has_table("net_worth_snapshots"):
        op.drop_table("net_worth_snapshots")


def downgrade() -> None:
    op.create_table(
        "net_worth_snapshots",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("snapshot_date", sa.Date(), nullable=False),
        sa.Column("other_assets", sa.Float(), nullable=False),
        sa.Column("portfolio", sa.Float(), nullable=False),
        sa.Column("liabilities", sa.Float(), nullable=False),
        sa.Column("total_assets", sa.Float(), nullable=False),
        sa.Column("total", sa.Float(), nullable=False),
        sa.Column("as_of", sa.DateTime(), nullable=False),
        sa.Column("source", sa.String(), nullable=False, server_default="manual"),
        sa.Column("note", sa.String(), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
