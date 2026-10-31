"""merchant import deduplication"""
from alembic import op
import sqlalchemy as sa


revision = '18d3ae7e94ce'
down_revision = '9b835f7a4c64'
branch_labels = None
depends_on = None

def upgrade():
    with op.batch_alter_table("transactions") as batch:
        batch.add_column(sa.Column("external_id", sa.String(length=120), nullable=True))
        batch.create_unique_constraint("uq_tx_merchant_source_external", ["merchant_id", "source", "external_id"])

def downgrade():
    with op.batch_alter_table("transactions") as batch:
        batch.drop_constraint("uq_tx_merchant_source_external", type_="unique")
        batch.drop_column("external_id")
