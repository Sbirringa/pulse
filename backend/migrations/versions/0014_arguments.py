"""Le ragioni sotto i sondaggi (perché sì / perché no) e il loro "Utile"

Revision ID: 0014
Revises: 0013
Create Date: 2026-10-16
"""
import sqlalchemy as sa
from alembic import op

revision = "0014"
down_revision = "0013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "arguments",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("question_id", sa.Integer(), sa.ForeignKey("questions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("author_id", sa.String(32), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("side", sa.Integer(), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("status", sa.String(10), nullable=False, server_default="visible"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("question_id", "author_id", "side", name="uq_argument_side"),
    )
    op.create_index("ix_arguments_question_id", "arguments", ["question_id"])
    op.create_index("ix_arguments_author_id", "arguments", ["author_id"])
    op.create_table(
        "argument_votes",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("argument_id", sa.Integer(), sa.ForeignKey("arguments.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.String(32), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("argument_id", "user_id", name="uq_argument_vote"),
    )
    op.create_index("ix_argument_votes_argument_id", "argument_votes", ["argument_id"])
    op.create_index("ix_argument_votes_user_id", "argument_votes", ["user_id"])


def downgrade() -> None:
    op.drop_table("argument_votes")
    op.drop_table("arguments")
