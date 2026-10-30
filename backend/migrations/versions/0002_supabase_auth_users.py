"""Allow verified Supabase accounts to use the web API."""

from alembic import op
import sqlalchemy as sa


revision = "0002_supabase_auth_users"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("users") as batch:
        batch.alter_column("phone_e164", existing_type=sa.String(length=20), nullable=True)
        batch.add_column(sa.Column("email", sa.String(length=320), nullable=True))
        batch.add_column(sa.Column("full_name", sa.String(length=160), nullable=True))
        batch.create_unique_constraint("uq_users_email", ["email"])


def downgrade():
    with op.batch_alter_table("users") as batch:
        batch.drop_constraint("uq_users_email", type_="unique")
        batch.drop_column("full_name")
        batch.drop_column("email")
        batch.alter_column("phone_e164", existing_type=sa.String(length=20), nullable=False)
