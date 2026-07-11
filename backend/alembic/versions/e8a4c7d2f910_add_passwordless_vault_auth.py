"""Add passwordless vault authentication fields and challenges.

Revision ID: e8a4c7d2f910
Revises: d4e5f6a7b8c9, f2d8c6a4b913
"""

import sqlalchemy as sa
from alembic import op

revision = "e8a4c7d2f910"
down_revision = ("d4e5f6a7b8c9", "f2d8c6a4b913")
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("users") as batch:
        batch.add_column(sa.Column("username", sa.String(), nullable=True))
        batch.add_column(sa.Column("auth_public_key_b64", sa.Text(), nullable=True))
        batch.add_column(sa.Column("auth_algorithm", sa.String(), nullable=True))
        batch.add_column(sa.Column("auth_key_version", sa.Integer(), nullable=True))
        batch.add_column(sa.Column("auth_kdf_salt_b64", sa.String(), nullable=True))
        batch.add_column(sa.Column("auth_kdf_iterations", sa.Integer(), nullable=True))
        batch.add_column(sa.Column("auth_wrapped_private_key_b64", sa.Text(), nullable=True))
        batch.add_column(sa.Column("auth_recovery_wrapped_private_key_b64", sa.Text(), nullable=True))
        batch.add_column(sa.Column("passwordless_enrolled_at", sa.DateTime(), nullable=True))
    if sa.inspect(op.get_bind()).has_table("user_sessions"):
        with op.batch_alter_table("user_sessions") as batch:
            batch.add_column(sa.Column("migration_only", sa.Boolean(), nullable=False, server_default=sa.false()))
        batch.create_unique_constraint("uq_users_username", ["username"])
    op.execute("UPDATE users SET username = lower(email) WHERE username IS NULL")
    op.create_table(
        "auth_challenges",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("challenge_id", sa.String(), nullable=False, unique=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("challenge_hash", sa.String(), nullable=False, unique=True),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("consumed_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_auth_challenges_user_id", "auth_challenges", ["user_id"])
    op.create_table(
        "auth_enrollments",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("token_hash", sa.String(), nullable=False, unique=True),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("consumed_at", sa.DateTime(), nullable=True),
        sa.Column("created_by_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )


def downgrade():
    op.drop_table("auth_enrollments")
    op.drop_table("auth_challenges")
    with op.batch_alter_table("users") as batch:
        batch.drop_constraint("uq_users_username", type_="unique")
        batch.drop_column("passwordless_enrolled_at")
        batch.drop_column("auth_key_version")
        batch.drop_column("auth_algorithm")
        batch.drop_column("auth_recovery_wrapped_private_key_b64")
        batch.drop_column("auth_wrapped_private_key_b64")
        batch.drop_column("auth_kdf_iterations")
        batch.drop_column("auth_kdf_salt_b64")
        batch.drop_column("auth_public_key_b64")
        batch.drop_column("username")
    if sa.inspect(op.get_bind()).has_table("user_sessions"):
        with op.batch_alter_table("user_sessions") as batch:
            batch.drop_column("migration_only")
