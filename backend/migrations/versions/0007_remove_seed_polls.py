"""Via i sondaggi "di PULSE": restano solo quelli creati dalle persone

Revision ID: 0007
Revises: 0006
Create Date: 2026-10-16
"""
from alembic import op

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None

SEEDED = "select id from questions where seed_key is not null"


def upgrade() -> None:
    # prima ciò che dipende dai sondaggi, poi i sondaggi (funziona anche dove le chiavi esterne non cancellano a cascata)
    op.execute(f"delete from notifications where question_id in ({SEEDED})")
    op.execute(f"delete from reports where target_type = 'question' and target_id in ({SEEDED})")
    op.execute(f"delete from votes where question_id in ({SEEDED})")
    op.execute(f"delete from images where question_id in ({SEEDED})")
    op.execute("delete from questions where seed_key is not null")


def downgrade() -> None:
    pass  # i sondaggi di esempio non si ricreano
