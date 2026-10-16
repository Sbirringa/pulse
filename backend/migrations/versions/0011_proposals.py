"""Proposte e "Anch'io": tipo di post, frase della proposta, sondaggio nato dalla proposta, sostegni

Revision ID: 0011
Revises: 0010
Create Date: 2026-10-16
"""
import sqlalchemy as sa
from alembic import op

revision = "0011"
down_revision = "0010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("posts") as batch:
        batch.add_column(sa.Column("kind", sa.String(10), nullable=False, server_default="post"))
        batch.add_column(sa.Column("headline", sa.Text(), nullable=True))
        batch.add_column(sa.Column("poll_id", sa.Integer(), nullable=True))
        batch.create_foreign_key("fk_posts_poll_id", "questions", ["poll_id"], ["id"], ondelete="SET NULL")
    op.create_table(
        "post_supports",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("post_id", sa.Integer(), sa.ForeignKey("posts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.String(32), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("post_id", "user_id", name="uq_post_support"),
    )
    op.create_index("ix_post_supports_post_id", "post_supports", ["post_id"])
    op.create_index("ix_post_supports_user_id", "post_supports", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_post_supports_user_id", "post_supports")
    op.drop_index("ix_post_supports_post_id", "post_supports")
    op.drop_table("post_supports")
    with op.batch_alter_table("posts") as batch:
        batch.drop_constraint("fk_posts_poll_id", type_="foreignkey")
        batch.drop_column("poll_id")
        batch.drop_column("headline")
        batch.drop_column("kind")
