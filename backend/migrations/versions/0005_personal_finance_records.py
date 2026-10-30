"""Store per-account personal ledger and loan records."""

from alembic import op
import sqlalchemy as sa


revision = "0005_personal_finance_records"
down_revision = "0004_user_workspace_data"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "user_workspace_data",
        sa.Column("finance_records", sa.JSON(), nullable=False, server_default=sa.text("'[]'")),
    )


def downgrade():
    op.drop_column("user_workspace_data", "finance_records")
