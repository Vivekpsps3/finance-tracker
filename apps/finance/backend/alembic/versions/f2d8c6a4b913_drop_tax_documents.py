"""drop_tax_documents

Revision ID: f2d8c6a4b913
Revises: c7f6a2d4e901
Create Date: 2026-07-06 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "f2d8c6a4b913"
down_revision: Union[str, Sequence[str], None] = "c7f6a2d4e901"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


tax_document_type = sa.Enum(
    "w2",
    "1099",
    "1098",
    "5498",
    "1040",
    "state_return",
    "property_tax",
    "other",
    name="taxdocumenttype",
)


def _drop_index_if_exists(inspector: sa.Inspector, index_name: str) -> None:
    indexes = {idx["name"] for idx in inspector.get_indexes("tax_documents")}
    if index_name in indexes:
        op.drop_index(index_name, table_name="tax_documents")


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    if not inspector.has_table("tax_documents"):
        return

    for index_name in (
        "ix_tax_documents_uploaded_at",
        "ix_tax_documents_sha256",
        "ix_tax_documents_document_type",
        "ix_tax_documents_tax_year",
        "ix_tax_documents_user_id",
        "ix_tax_documents_id",
    ):
        _drop_index_if_exists(inspector, index_name)
    op.drop_table("tax_documents")


def downgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    if inspector.has_table("tax_documents"):
        return

    op.create_table(
        "tax_documents",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("tax_year", sa.Integer(), nullable=False),
        sa.Column("document_type", tax_document_type, nullable=False),
        sa.Column("issuer", sa.String(), nullable=True),
        sa.Column("taxpayer", sa.String(), nullable=True),
        sa.Column("filename", sa.String(), nullable=False),
        sa.Column("content_type", sa.String(), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("sha256", sa.String(), nullable=False),
        sa.Column("file_bytes", sa.LargeBinary(), nullable=False),
        sa.Column("summary_json", sa.Text(), nullable=False, server_default="{}"),
        sa.Column("notes", sa.String(), nullable=True),
        sa.Column("uploaded_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_tax_documents_id", "tax_documents", ["id"], unique=False)
    op.create_index("ix_tax_documents_user_id", "tax_documents", ["user_id"], unique=False)
    op.create_index("ix_tax_documents_tax_year", "tax_documents", ["tax_year"], unique=False)
    op.create_index("ix_tax_documents_document_type", "tax_documents", ["document_type"], unique=False)
    op.create_index("ix_tax_documents_sha256", "tax_documents", ["sha256"], unique=False)
    op.create_index("ix_tax_documents_uploaded_at", "tax_documents", ["uploaded_at"], unique=False)
