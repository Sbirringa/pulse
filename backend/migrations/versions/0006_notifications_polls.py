"""Notifiche; sondaggi con foto e scadenza

Revision ID: 0006
Revises: 0005
Create Date: 2026-10-16
"""
import sqlalchemy as sa
from alembic import op

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("questions") as batch:
        batch.add_column(sa.Column("ends_at", sa.DateTime(timezone=True), nullable=True))
        batch.add_column(sa.Column("ended_notified", sa.Boolean(), nullable=False, server_default=sa.false()))
        batch.create_index("ix_questions_ends_at", ["ends_at"])
    with op.batch_alter_table("images") as batch:
        batch.add_column(sa.Column("question_id", sa.Integer(), nullable=True))
        batch.create_foreign_key("fk_images_question", "questions", ["question_id"], ["id"], ondelete="CASCADE")
        batch.create_index("ix_images_question_id", ["question_id"])
    op.create_table(
        "notifications",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.String(32), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("actor_id", sa.String(32), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=True),
        sa.Column("kind", sa.String(20), nullable=False),
        sa.Column("post_id", sa.Integer(), sa.ForeignKey("posts.id", ondelete="CASCADE"), nullable=True),
        sa.Column("comment_id", sa.Integer(), sa.ForeignKey("comments.id", ondelete="CASCADE"), nullable=True),
        sa.Column("question_id", sa.Integer(), sa.ForeignKey("questions.id", ondelete="CASCADE"), nullable=True),
        sa.Column("read", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_notifications_user", "notifications", ["user_id", "read", "id"])


def downgrade() -> None:
    op.drop_index("ix_notifications_user", table_name="notifications")
    op.drop_table("notifications")
    with op.batch_alter_table("images") as batch:
        batch.drop_index("ix_images_question_id")
        batch.drop_constraint("fk_images_question", type_="foreignkey")
        batch.drop_column("question_id")
    with op.batch_alter_table("questions") as batch:
        batch.drop_index("ix_questions_ends_at")
        batch.drop_column("ended_notified")
        batch.drop_column("ends_at")
