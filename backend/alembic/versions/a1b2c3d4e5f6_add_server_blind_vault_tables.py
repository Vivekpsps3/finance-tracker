"""Add server-blind vault and encrypted record tables.

Revision ID: a1b2c3d4e5f6
Revises: f2d8c6a4b913
Create Date: 2026-07-06
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, None] = "f2d8c6a4b913"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "user_vaults",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("kdf_algorithm", sa.String(), nullable=False),
        sa.Column("kdf_salt_b64", sa.String(), nullable=False),
        sa.Column("kdf_iterations", sa.Integer(), nullable=False),
        sa.Column("wrapped_dek_b64", sa.Text(), nullable=False),
        sa.Column("recovery_wrapped_dek_b64", sa.Text(), nullable=False),
        sa.Column("key_version", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_user_vaults_user_id", "user_vaults", ["user_id"], unique=True)

    op.create_table(
        "encrypted_records",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("collection", sa.String(), nullable=False),
        sa.Column("client_id", sa.String(), nullable=False),
        sa.Column("ciphertext_b64", sa.Text(), nullable=False),
        sa.Column("schema_version", sa.Integer(), nullable=False),
        sa.Column("key_version", sa.Integer(), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("user_id", "collection", "client_id", name="uq_user_collection_client_id"),
    )
    op.create_index("ix_encrypted_records_user_id", "encrypted_records", ["user_id"])
    op.create_index("ix_encrypted_records_collection", "encrypted_records", ["collection"])
    op.create_index("ix_encrypted_records_client_id", "encrypted_records", ["client_id"])
    op.create_index("ix_encrypted_records_updated_at", "encrypted_records", ["updated_at"])

    op.create_table(
        "encrypted_record_indexes",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("collection", sa.String(), nullable=False),
        sa.Column("client_id", sa.String(), nullable=False),
        sa.Column("index_name", sa.String(), nullable=False),
        sa.Column("index_value_b64", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint(
            "user_id",
            "collection",
            "index_name",
            "index_value_b64",
            name="uq_user_blind_index_value",
        ),
    )
    op.create_index("ix_encrypted_record_indexes_user_id", "encrypted_record_indexes", ["user_id"])
    op.create_index("ix_encrypted_record_indexes_collection", "encrypted_record_indexes", ["collection"])
    op.create_index("ix_encrypted_record_indexes_client_id", "encrypted_record_indexes", ["client_id"])
    op.create_index("ix_encrypted_record_indexes_index_name", "encrypted_record_indexes", ["index_name"])

    op.create_table(
        "user_crypto_migrations",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("legacy_counts_json", sa.Text(), nullable=True),
        sa.Column("encrypted_counts_json", sa.Text(), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("verified_at", sa.DateTime(), nullable=True),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_user_crypto_migrations_user_id", "user_crypto_migrations", ["user_id"], unique=True)
    op.create_index("ix_user_crypto_migrations_status", "user_crypto_migrations", ["status"])


def downgrade() -> None:
    op.drop_table("user_crypto_migrations")
    op.drop_table("encrypted_record_indexes")
    op.drop_table("encrypted_records")
    op.drop_table("user_vaults")
