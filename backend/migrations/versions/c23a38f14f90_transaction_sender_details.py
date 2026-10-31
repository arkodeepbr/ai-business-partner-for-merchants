"""store sender fields on merchant imported transactions"""
from alembic import op
import sqlalchemy as sa


revision = "c23a38f14f90"
down_revision = "18d3ae7e94ce"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("transactions") as batch:
        batch.add_column(sa.Column("sender_name", sa.String(length=180), nullable=True))
        batch.add_column(sa.Column("sender_reference", sa.String(length=180), nullable=True))
        batch.add_column(sa.Column("sender_contact", sa.String(length=180), nullable=True))


def downgrade():
    with op.batch_alter_table("transactions") as batch:
        batch.drop_column("sender_contact")
        batch.drop_column("sender_reference")
        batch.drop_column("sender_name")
