"""Persist each account's light or dark appearance preference."""

from alembic import op
import sqlalchemy as sa


revision = "0006_workspace_theme"
down_revision = "0005_personal_finance_records"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "user_workspace_data",
        sa.Column("preferred_theme", sa.String(length=8), nullable=False, server_default="light"),
    )


def downgrade():
    op.drop_column("user_workspace_data", "preferred_theme")
