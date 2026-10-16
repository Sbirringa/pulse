"""Sondaggi di una città: chi vota dichiara se è "di qui" o "di fuori"

Revision ID: 0008
Revises: 0007
Create Date: 2026-10-16
"""
import sqlalchemy as sa
from alembic import op

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("votes") as batch:
        batch.add_column(sa.Column("resident", sa.Boolean(), nullable=True))
    # i voti già dati ai sondaggi locali venivano solo da chi aveva quella città nel profilo
    op.execute(
        "update votes set resident = true where question_id in (select id from questions where scope = 'local')"
    )


def downgrade() -> None:
    with op.batch_alter_table("votes") as batch:
        batch.drop_column("resident")
