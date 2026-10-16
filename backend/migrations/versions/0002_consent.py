"""Consenso esplicito GDPR: data e versione dell'informativa accettata

Revision ID: 0002
Revises: 0001
Create Date: 2026-10-15
"""
import sqlalchemy as sa
from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Nullable: gli account creati prima di questa versione non hanno un consenso registrato.
    with op.batch_alter_table("users") as batch:
        batch.add_column(sa.Column("consent_at", sa.DateTime(timezone=True), nullable=True))
        batch.add_column(sa.Column("privacy_version", sa.String(20), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("users") as batch:
        batch.drop_column("privacy_version")
        batch.drop_column("consent_at")
