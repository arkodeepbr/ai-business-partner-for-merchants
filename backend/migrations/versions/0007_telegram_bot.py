"""Add account links and update deduplication for Saathi's Telegram bot."""

from alembic import op
import sqlalchemy as sa


revision = "0007_telegram_bot"
down_revision = "0006_workspace_theme"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "telegram_links",
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("telegram_user_id", sa.BigInteger(), unique=True, nullable=True),
        sa.Column("telegram_chat_id", sa.BigInteger(), unique=True, nullable=True),
        sa.Column("link_code_hash", sa.String(64), unique=True, nullable=True),
        sa.Column("link_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("pending_action", sa.JSON(), nullable=True),
        sa.Column("pending_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "telegram_processed_updates",
        sa.Column("update_id", sa.BigInteger(), primary_key=True),
        sa.Column("processed_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "telegram_polling_state",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("next_update_id", sa.BigInteger(), nullable=False),
    )


def downgrade():
    op.drop_table("telegram_polling_state")
    op.drop_table("telegram_processed_updates")
    op.drop_table("telegram_links")
