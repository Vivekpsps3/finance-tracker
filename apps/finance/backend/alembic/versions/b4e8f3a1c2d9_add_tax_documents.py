"""add_tax_documents

Revision ID: b4e8f3a1c2d9
Revises: 9a7d1c3e5f20
Create Date: 2026-06-27 00:00:01.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "b4e8f3a1c2d9"
down_revision: Union[str, Sequence[str], None] = "9a7d1c3e5f20"
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


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    if inspector.has_table("tax_documents"):
        return

    op.create_table(
        "tax_documents",
        sa.Column("id", sa.Integer(), nullable=False),
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
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_tax_documents_id", "tax_documents", ["id"], unique=False)
    op.create_index("ix_tax_documents_tax_year", "tax_documents", ["tax_year"], unique=False)
    op.create_index("ix_tax_documents_document_type", "tax_documents", ["document_type"], unique=False)
    op.create_index("ix_tax_documents_sha256", "tax_documents", ["sha256"], unique=False)
    op.create_index("ix_tax_documents_uploaded_at", "tax_documents", ["uploaded_at"], unique=False)


def downgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    if not inspector.has_table("tax_documents"):
        return

    op.drop_index("ix_tax_documents_uploaded_at", table_name="tax_documents")
    op.drop_index("ix_tax_documents_sha256", table_name="tax_documents")
    op.drop_index("ix_tax_documents_document_type", table_name="tax_documents")
    op.drop_index("ix_tax_documents_tax_year", table_name="tax_documents")
    op.drop_index("ix_tax_documents_id", table_name="tax_documents")
    op.drop_table("tax_documents")
