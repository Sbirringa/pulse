"""Amministratori nell'app e sondaggi pubblicati subito (moderazione con le segnalazioni)

Revision ID: 0005
Revises: 0004
Create Date: 2026-10-15
"""
import sqlalchemy as sa
from alembic import op

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("users") as batch:
        batch.add_column(sa.Column("is_admin", sa.Boolean(), nullable=False, server_default=sa.false()))
    # le proposte rimaste "in attesa" con il vecchio sistema vengono pubblicate
    op.execute("update questions set status = 'approved' where status = 'pending'")


def downgrade() -> None:
    with op.batch_alter_table("users") as batch:
        batch.drop_column("is_admin")
