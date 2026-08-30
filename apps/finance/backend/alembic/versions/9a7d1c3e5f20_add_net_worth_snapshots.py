"""add_net_worth_snapshots

Revision ID: 9a7d1c3e5f20
Revises: 44622d00bf4c
Create Date: 2026-06-27 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "9a7d1c3e5f20"
down_revision: Union[str, Sequence[str], None] = "44622d00bf4c"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create observed balance-sheet net worth snapshots."""
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    if inspector.has_table("net_worth_snapshots"):
        cols = {c["name"] for c in inspector.get_columns("net_worth_snapshots")}
        with op.batch_alter_table("net_worth_snapshots") as batch_op:
            if "snapshot_date" not in cols:
                batch_op.add_column(sa.Column("snapshot_date", sa.Date(), nullable=True))
            if "other_assets" not in cols:
                batch_op.add_column(sa.Column("other_assets", sa.Float(), nullable=True))
            if "portfolio" not in cols:
                batch_op.add_column(sa.Column("portfolio", sa.Float(), nullable=True))
            if "liabilities" not in cols:
                batch_op.add_column(sa.Column("liabilities", sa.Float(), nullable=True))
            if "total_assets" not in cols:
                batch_op.add_column(sa.Column("total_assets", sa.Float(), nullable=True))
            if "total" not in cols:
                batch_op.add_column(sa.Column("total", sa.Float(), nullable=True))
            if "as_of" not in cols:
                batch_op.add_column(sa.Column("as_of", sa.DateTime(), nullable=True))
            if "source" not in cols:
                batch_op.add_column(sa.Column("source", sa.String(), nullable=True))
            if "note" not in cols:
                batch_op.add_column(sa.Column("note", sa.String(), nullable=True))
        return

    op.create_table(
        "net_worth_snapshots",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("snapshot_date", sa.Date(), nullable=False),
        sa.Column("other_assets", sa.Float(), nullable=False),
        sa.Column("portfolio", sa.Float(), nullable=False),
        sa.Column("liabilities", sa.Float(), nullable=False),
        sa.Column("total_assets", sa.Float(), nullable=False),
        sa.Column("total", sa.Float(), nullable=False),
        sa.Column("as_of", sa.DateTime(), nullable=False),
        sa.Column("source", sa.String(), nullable=False, server_default="manual"),
        sa.Column("note", sa.String(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_net_worth_snapshots_id", "net_worth_snapshots", ["id"], unique=False)
    op.create_index(
        "ix_net_worth_snapshots_snapshot_date",
        "net_worth_snapshots",
        ["snapshot_date"],
        unique=False,
    )
    op.create_index("ix_net_worth_snapshots_as_of", "net_worth_snapshots", ["as_of"], unique=False)


def downgrade() -> None:
    """Drop observed net worth snapshots."""
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    if not inspector.has_table("net_worth_snapshots"):
        return

    op.drop_index("ix_net_worth_snapshots_as_of", table_name="net_worth_snapshots")
    op.drop_index("ix_net_worth_snapshots_snapshot_date", table_name="net_worth_snapshots")
    op.drop_index("ix_net_worth_snapshots_id", table_name="net_worth_snapshots")
    op.drop_table("net_worth_snapshots")
