"""Map API users to their verified Supabase identity."""

from alembic import op
import sqlalchemy as sa


revision = "0003_supabase_user_id"
down_revision = "0002_supabase_auth_users"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("users") as batch:
        batch.add_column(sa.Column("supabase_user_id", sa.String(length=36), nullable=True))
        batch.create_unique_constraint("uq_users_supabase_user_id", ["supabase_user_id"])


def downgrade():
    with op.batch_alter_table("users") as batch:
        batch.drop_constraint("uq_users_supabase_user_id", type_="unique")
        batch.drop_column("supabase_user_id")
