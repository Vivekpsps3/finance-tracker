"""add market research cache

Revision ID: d4e5f6a7b8c9
Revises: a1b2c3d4e5f6
Create Date: 2026-07-09
"""

from alembic import op
import sqlalchemy as sa


revision = "d4e5f6a7b8c9"
down_revision = "a1b2c3d4e5f6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table("market_research_cache"):
        op.create_table(
            "market_research_cache",
            sa.Column("symbol", sa.String(), nullable=False),
            sa.Column("period", sa.String(), nullable=False, server_default="10y"),
            sa.Column("payload_json", sa.Text(), nullable=False),
            sa.Column("source", sa.String(), nullable=False, server_default="yfinance"),
            sa.Column("fetched_at", sa.DateTime(), nullable=False),
            sa.Column("expires_at", sa.DateTime(), nullable=False),
            sa.PrimaryKeyConstraint("symbol", "period"),
        )
    existing = {ix["name"] for ix in inspector.get_indexes("market_research_cache")}
    if "ix_market_research_cache_symbol" not in existing:
        op.create_index("ix_market_research_cache_symbol", "market_research_cache", ["symbol"])
    if "ix_market_research_cache_fetched_at" not in existing:
        op.create_index("ix_market_research_cache_fetched_at", "market_research_cache", ["fetched_at"])
    if "ix_market_research_cache_expires_at" not in existing:
        op.create_index("ix_market_research_cache_expires_at", "market_research_cache", ["expires_at"])


def downgrade() -> None:
    op.drop_index("ix_market_research_cache_expires_at", table_name="market_research_cache")
    op.drop_index("ix_market_research_cache_fetched_at", table_name="market_research_cache")
    op.drop_index("ix_market_research_cache_symbol", table_name="market_research_cache")
    op.drop_table("market_research_cache")
