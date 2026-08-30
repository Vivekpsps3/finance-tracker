"""Add server-blind vault and encrypted record tables.

Revision ID: a1b2c3d4e5f6
Revises: f2d8c6a4b913
Create Date: 2026-07-06

Safe with Base.metadata.create_all(): tables/indexes are created only when missing.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, None] = "f2d8c6a4b913"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _index_names(inspector: sa.Inspector, table: str) -> set[str]:
    if not inspector.has_table(table):
        return set()
    return {idx["name"] for idx in inspector.get_indexes(table) if idx.get("name")}


def _create_index_if_missing(
    inspector: sa.Inspector,
    *,
    table: str,
    name: str,
    columns: list[str],
    unique: bool = False,
) -> None:
    if name not in _index_names(inspector, table):
        op.create_index(name, table, columns, unique=unique)


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)

    if not inspector.has_table("user_vaults"):
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
        inspector = sa.inspect(conn)
    _create_index_if_missing(
        inspector, table="user_vaults", name="ix_user_vaults_user_id", columns=["user_id"], unique=True
    )

    if not inspector.has_table("encrypted_records"):
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
        inspector = sa.inspect(conn)
    for name, cols in (
        ("ix_encrypted_records_user_id", ["user_id"]),
        ("ix_encrypted_records_collection", ["collection"]),
        ("ix_encrypted_records_client_id", ["client_id"]),
        ("ix_encrypted_records_updated_at", ["updated_at"]),
    ):
        _create_index_if_missing(inspector, table="encrypted_records", name=name, columns=cols)

    if not inspector.has_table("encrypted_record_indexes"):
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
        inspector = sa.inspect(conn)
    for name, cols in (
        ("ix_encrypted_record_indexes_user_id", ["user_id"]),
        ("ix_encrypted_record_indexes_collection", ["collection"]),
        ("ix_encrypted_record_indexes_client_id", ["client_id"]),
        ("ix_encrypted_record_indexes_index_name", ["index_name"]),
    ):
        _create_index_if_missing(inspector, table="encrypted_record_indexes", name=name, columns=cols)

    if not inspector.has_table("user_crypto_migrations"):
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
        inspector = sa.inspect(conn)
    _create_index_if_missing(
        inspector,
        table="user_crypto_migrations",
        name="ix_user_crypto_migrations_user_id",
        columns=["user_id"],
        unique=True,
    )
    _create_index_if_missing(
        inspector,
        table="user_crypto_migrations",
        name="ix_user_crypto_migrations_status",
        columns=["status"],
    )


def downgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    for table in (
        "user_crypto_migrations",
        "encrypted_record_indexes",
        "encrypted_records",
        "user_vaults",
    ):
        if inspector.has_table(table):
            op.drop_table(table)
        inspector = sa.inspect(conn)
