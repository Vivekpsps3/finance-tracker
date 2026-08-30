"""Allow users without legacy password hashes.

Revision ID: b7c9d2e4f601
Revises: f1a2b3c4d5e6
"""

import sqlalchemy as sa
from alembic import op

revision = "b7c9d2e4f601"
down_revision = "f1a2b3c4d5e6"
branch_labels = None
depends_on = None


def upgrade():
    columns = {column["name"]: column for column in sa.inspect(op.get_bind()).get_columns("users")}
    password_hash = columns.get("password_hash")
    if password_hash and not password_hash["nullable"]:
        with op.batch_alter_table("users") as batch:
            batch.alter_column("password_hash", existing_type=sa.String(), nullable=True)


def downgrade():
    columns = {column["name"]: column for column in sa.inspect(op.get_bind()).get_columns("users")}
    password_hash = columns.get("password_hash")
    if password_hash and password_hash["nullable"]:
        op.execute("UPDATE users SET password_hash = '' WHERE password_hash IS NULL")
        with op.batch_alter_table("users") as batch:
            batch.alter_column("password_hash", existing_type=sa.String(), nullable=False)
