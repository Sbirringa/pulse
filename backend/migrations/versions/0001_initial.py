"""Schema iniziale (identico alla prima versione di PULSE)

Revision ID: 0001
Revises:
Create Date: 2026-10-15
"""
import sqlalchemy as sa
from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.String(32), primary_key=True),
        sa.Column("nickname", sa.String(24), nullable=False),
        sa.Column("nickname_key", sa.String(24), nullable=False),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("recovery_hash", sa.String(255), nullable=False),
        sa.Column("city", sa.String(60), nullable=True),
        sa.Column("is_banned", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_users_nickname_key", "users", ["nickname_key"], unique=True)
    op.create_index("ix_users_city", "users", ["city"])

    op.create_table(
        "questions",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("seed_key", sa.String(60), nullable=True, unique=True),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("category", sa.String(40), nullable=False),
        sa.Column("scope", sa.String(10), nullable=False),
        sa.Column("city", sa.String(60), nullable=True),
        sa.Column("status", sa.String(10), nullable=False),
        sa.Column("author_id", sa.String(32), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_questions_category", "questions", ["category"])
    op.create_index("ix_questions_city", "questions", ["city"])
    op.create_index("ix_questions_status", "questions", ["status"])

    op.create_table(
        "votes",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.String(32), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("question_id", sa.Integer(), sa.ForeignKey("questions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("value", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("user_id", "question_id", name="uq_vote_user_question"),
        sa.CheckConstraint("value in (-1, 0, 1)", name="ck_vote_value"),
    )
    op.create_index("ix_votes_question_id", "votes", ["question_id"])
    op.create_index("ix_votes_user", "votes", ["user_id"])


def downgrade() -> None:
    op.drop_table("votes")
    op.drop_table("questions")
    op.drop_table("users")
