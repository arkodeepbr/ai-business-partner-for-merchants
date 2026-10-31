"""Initial merchant data and approval schema."""
from alembic import op
import sqlalchemy as sa

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None

def upgrade():
    op.create_table("merchants", sa.Column("id", sa.String(36), primary_key=True), sa.Column("name", sa.String(180), nullable=False), sa.Column("tier", sa.String(32), nullable=False), sa.Column("currency", sa.String(3), nullable=False), sa.Column("created_at", sa.DateTime(timezone=True), nullable=False))
    op.create_table("merchant_memberships", sa.Column("id", sa.Integer(), primary_key=True), sa.Column("merchant_id", sa.String(36), sa.ForeignKey("merchants.id", ondelete="CASCADE"), nullable=False), sa.Column("subject", sa.String(180), nullable=False), sa.Column("role", sa.String(32), nullable=False), sa.UniqueConstraint("merchant_id", "subject"))
    op.create_index("ix_merchant_memberships_merchant_id", "merchant_memberships", ["merchant_id"]); op.create_index("ix_merchant_memberships_subject", "merchant_memberships", ["subject"])
    op.create_table("transactions", sa.Column("id", sa.String(100), primary_key=True), sa.Column("merchant_id", sa.String(36), sa.ForeignKey("merchants.id", ondelete="CASCADE"), nullable=False), sa.Column("amount", sa.Numeric(14,2), nullable=False), sa.Column("status", sa.String(24), nullable=False), sa.Column("payment_method", sa.String(32), nullable=False), sa.Column("source", sa.String(32), nullable=False), sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False))
    op.create_index("ix_transactions_merchant_id", "transactions", ["merchant_id"]); op.create_index("ix_transactions_occurred_at", "transactions", ["occurred_at"]); op.create_index("ix_tx_merchant_created", "transactions", ["merchant_id", "occurred_at"])
    op.create_table("settlements", sa.Column("id", sa.String(100), primary_key=True), sa.Column("merchant_id", sa.String(36), sa.ForeignKey("merchants.id", ondelete="CASCADE"), nullable=False), sa.Column("amount", sa.Numeric(14,2), nullable=False), sa.Column("status", sa.String(24), nullable=False), sa.Column("expected_at", sa.DateTime(timezone=True)), sa.Column("settled_at", sa.DateTime(timezone=True)))
    op.create_index("ix_settlements_merchant_id", "settlements", ["merchant_id"])
    op.create_table("products", sa.Column("id", sa.String(36), primary_key=True), sa.Column("merchant_id", sa.String(36), sa.ForeignKey("merchants.id", ondelete="CASCADE"), nullable=False), sa.Column("name", sa.String(180), nullable=False), sa.Column("sku", sa.String(80)), sa.Column("quantity", sa.Integer(), nullable=False), sa.Column("reorder_level", sa.Integer(), nullable=False), sa.Column("unit", sa.String(24), nullable=False), sa.Column("active", sa.Boolean(), nullable=False))
    op.create_index("ix_products_merchant_id", "products", ["merchant_id"])
    op.create_table("action_proposals", sa.Column("id", sa.String(36), primary_key=True), sa.Column("merchant_id", sa.String(36), sa.ForeignKey("merchants.id", ondelete="CASCADE"), nullable=False), sa.Column("kind", sa.String(60), nullable=False), sa.Column("payload", sa.Text(), nullable=False), sa.Column("status", sa.String(20), nullable=False), sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False), sa.Column("created_at", sa.DateTime(timezone=True), nullable=False))
    op.create_index("ix_action_proposals_merchant_id", "action_proposals", ["merchant_id"])
    op.create_table("audit_events", sa.Column("id", sa.String(36), primary_key=True), sa.Column("merchant_id", sa.String(36), sa.ForeignKey("merchants.id", ondelete="CASCADE"), nullable=False), sa.Column("subject", sa.String(180), nullable=False), sa.Column("action", sa.String(80), nullable=False), sa.Column("resource_id", sa.String(100), nullable=False), sa.Column("created_at", sa.DateTime(timezone=True), nullable=False))
    op.create_index("ix_audit_events_merchant_id", "audit_events", ["merchant_id"])

def downgrade():
    for table in ["audit_events", "action_proposals", "products", "settlements", "transactions", "merchant_memberships", "merchants"]: op.drop_table(table)
