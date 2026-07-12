"""initial_schema_with_brokerage_and_no_snapshots

Revision ID: 44622d00bf4c
Revises: 
Create Date: 2026-06-23 16:54:44.154465

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '44622d00bf4c'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    conn = op.get_bind()
    inspector = sa.inspect(conn)

    # Preserve any legacy net_worth_snapshots table. A later migration normalizes
    # the table for observed balance-sheet snapshots.

    # Create brokerages table only if missing (safe for existing DBs)
    if not inspector.has_table("brokerages"):
        op.create_table(
            'brokerages',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('slug', sa.String(), nullable=False),
            sa.Column('name', sa.String(), nullable=False),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('slug'),
        )
        op.create_index(op.f('ix_brokerages_id'), 'brokerages', ['id'], unique=False)
        op.create_index(op.f('ix_brokerages_slug'), 'brokerages', ['slug'], unique=True)

    # Create brokerage_accounts only if missing
    if not inspector.has_table("brokerage_accounts"):
        op.create_table(
            'brokerage_accounts',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('brokerage_id', sa.Integer(), nullable=False),
            sa.Column('account_mask', sa.String(), nullable=False),
            sa.Column('label', sa.String(), nullable=True),
            sa.ForeignKeyConstraint(['brokerage_id'], ['brokerages.id'], ),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('brokerage_id', 'account_mask', name='uq_brokerage_account_mask'),
        )
        op.create_index(op.f('ix_brokerage_accounts_id'), 'brokerage_accounts', ['id'], unique=False)
        op.create_index(op.f('ix_brokerage_accounts_brokerage_id'), 'brokerage_accounts', ['brokerage_id'], unique=False)

    # Add brokerage_account_id to holdings only if the column is missing
    holdings_cols = [c['name'] for c in inspector.get_columns('holdings')]
    if 'brokerage_account_id' not in holdings_cols:
        with op.batch_alter_table('holdings', schema=None) as batch_op:
            batch_op.add_column(sa.Column('brokerage_account_id', sa.Integer(), nullable=True))
            batch_op.create_index('ix_holdings_brokerage_account_id', ['brokerage_account_id'])

    # Note: for existing DBs with old data, manual holdings will have NULL brokerage_account_id
    # (treated as 'Manual' in UI)


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('holdings', schema=None) as batch_op:
        batch_op.drop_index('ix_holdings_brokerage_account_id')
        batch_op.drop_column('brokerage_account_id')

    op.drop_table('brokerage_accounts')
    op.drop_table('brokerages')

    # net_worth_snapshots is recreated by 9a7d1c3e5f20 (schema-present, HTTP-unwired observed history).
