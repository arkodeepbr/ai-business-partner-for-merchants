"""add internal customer receivables"""
from alembic import op
import sqlalchemy as sa


revision = "20261031_01"
down_revision = "c23a38f14f90"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "receivables",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("merchant_id", sa.String(length=36), nullable=False),
        sa.Column("customer_name", sa.String(length=180), nullable=False),
        sa.Column("amount", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("status", sa.String(length=24), nullable=False),
        sa.Column("note", sa.String(length=500), nullable=True),
        sa.Column("source", sa.String(length=32), nullable=False),
        sa.Column("idempotency_key", sa.String(length=80), nullable=False),
        sa.Column("created_by", sa.String(length=180), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["merchant_id"], ["merchants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("merchant_id", "idempotency_key", name="uq_receivable_merchant_idempotency"),
    )
    op.create_index(op.f("ix_receivables_merchant_id"), "receivables", ["merchant_id"], unique=False)
    op.create_index("ix_receivable_merchant_status_created", "receivables",
                    ["merchant_id", "status", "created_at"], unique=False)


def downgrade():
    op.drop_index("ix_receivable_merchant_status_created", table_name="receivables")
    op.drop_index(op.f("ix_receivables_merchant_id"), table_name="receivables")
    op.drop_table("receivables")
