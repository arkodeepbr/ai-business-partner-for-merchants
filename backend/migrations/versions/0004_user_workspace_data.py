"""Persist private chat history and preferences per account."""

from alembic import op
import sqlalchemy as sa


revision = "0004_user_workspace_data"
down_revision = "0003_supabase_user_id"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "user_workspace_data",
        sa.Column("user_id", sa.String(length=36), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("assistant_messages", sa.JSON(), nullable=False, server_default=sa.text("'[]'")),
        sa.Column("preferred_locale", sa.String(length=2), nullable=False, server_default="en"),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )


def downgrade():
    op.drop_table("user_workspace_data")
