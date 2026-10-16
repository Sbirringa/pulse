"""Chi può partecipare (tutti / solo chi è della città) e città dichiarate

Revision ID: 0013
Revises: 0012
Create Date: 2026-10-16
"""
import sqlalchemy as sa
from alembic import op

revision = "0013"
down_revision = "0012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("posts") as batch:
        batch.add_column(sa.Column("audience", sa.String(10), nullable=False, server_default="all"))
    with op.batch_alter_table("questions") as batch:
        batch.add_column(sa.Column("audience", sa.String(10), nullable=False, server_default="all"))
    op.create_table(
        "city_places",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.String(32), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("city", sa.Text(), nullable=False),
        sa.Column("city_idx", sa.String(64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("user_id", "city_idx", name="uq_city_place"),
    )
    op.create_index("ix_city_places_user_id", "city_places", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_city_places_user_id", "city_places")
    op.drop_table("city_places")
    with op.batch_alter_table("questions") as batch:
        batch.drop_column("audience")
    with op.batch_alter_table("posts") as batch:
        batch.drop_column("audience")
