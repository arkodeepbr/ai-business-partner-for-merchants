"""Initial tenant and payments schema.

Revision ID: 0001_initial
"""
from alembic import op
import sqlalchemy as sa

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None

def upgrade():
    op.create_table("organizations",
        sa.Column("id", sa.String(36), primary_key=True), sa.Column("name", sa.String(160), nullable=False),
        sa.Column("timezone", sa.String(64), nullable=False), sa.Column("created_at", sa.DateTime(timezone=True), nullable=False))
    op.create_table("users",
        sa.Column("id", sa.String(36), primary_key=True), sa.Column("phone_e164", sa.String(20), nullable=False, unique=True),
        sa.Column("active", sa.Boolean(), nullable=False), sa.Column("created_at", sa.DateTime(timezone=True), nullable=False))
    op.create_table("merchant_memberships",
        sa.Column("id", sa.String(36), primary_key=True), sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("organization_id", sa.String(36), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("role", sa.String(32), nullable=False), sa.UniqueConstraint("user_id", "organization_id"))
    op.create_table("payment_transactions",
        sa.Column("id", sa.String(36), primary_key=True), sa.Column("organization_id", sa.String(36), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("provider", sa.String(40), nullable=False), sa.Column("provider_event_id", sa.String(128), nullable=False),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False), sa.Column("amount_minor", sa.BigInteger(), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False), sa.Column("status", sa.String(24), nullable=False),
        sa.Column("payment_method", sa.String(32)), sa.UniqueConstraint("organization_id", "provider", "provider_event_id", name="uq_payment_provider_event"))
    op.create_index("ix_payment_org_time", "payment_transactions", ["organization_id", "occurred_at"])
    op.create_table("settlements",
        sa.Column("id", sa.String(36), primary_key=True), sa.Column("organization_id", sa.String(36), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("provider_reference", sa.String(128), nullable=False), sa.Column("amount_minor", sa.BigInteger(), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False), sa.Column("status", sa.String(24), nullable=False),
        sa.Column("expected_at", sa.DateTime(timezone=True)), sa.Column("settled_at", sa.DateTime(timezone=True)))
    op.create_index("ix_settlement_org_status", "settlements", ["organization_id", "status"])
    op.create_table("audit_events", sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("organization_id", sa.String(36), sa.ForeignKey("organizations.id", ondelete="SET NULL")),
        sa.Column("actor_user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("event_type", sa.String(80), nullable=False), sa.Column("resource_id", sa.String(128)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False))

def downgrade():
    op.drop_table("audit_events")
    op.drop_index("ix_settlement_org_status", table_name="settlements")
    op.drop_table("settlements")
    op.drop_index("ix_payment_org_time", table_name="payment_transactions")
    op.drop_table("payment_transactions")
    op.drop_table("merchant_memberships")
    op.drop_table("users")
    op.drop_table("organizations")
