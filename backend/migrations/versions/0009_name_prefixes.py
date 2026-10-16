"""Ricerca delle persone mentre si scrive: impronte cifrate dei pezzi iniziali dei nomi

Revision ID: 0009
Revises: 0008
Create Date: 2026-10-16
"""
import sqlalchemy as sa
from alembic import op

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "name_prefixes",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.String(32), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("h", sa.String(32), nullable=False),
        sa.UniqueConstraint("user_id", "h", name="uq_name_prefix"),
    )
    op.create_index("ix_name_prefixes_user_id", "name_prefixes", ["user_id"])
    op.create_index("ix_name_prefixes_h", "name_prefixes", ["h"])

    # persone già registrate: si calcolano le impronte decifrando i nomi (solo qui, in memoria)
    from app.crypto import decrypt_text
    from app.search import prefix_hashes

    conn = op.get_bind()
    table = sa.table("name_prefixes", sa.column("user_id", sa.String), sa.column("h", sa.String))
    for uid, nick, name in conn.execute(sa.text("select id, nickname, display_name from users")).all():
        try:
            nickname = decrypt_text(nick, b"users.nickname")
            display = decrypt_text(name, b"users.display_name") if name else None
        except Exception:  # dato illeggibile: la persona si troverà dopo la prossima modifica del profilo
            continue
        rows = [{"user_id": uid, "h": h} for h in prefix_hashes(nickname, display)]
        if rows:
            op.bulk_insert(table, rows)


def downgrade() -> None:
    op.drop_index("ix_name_prefixes_h", table_name="name_prefixes")
    op.drop_index("ix_name_prefixes_user_id", table_name="name_prefixes")
    op.drop_table("name_prefixes")
