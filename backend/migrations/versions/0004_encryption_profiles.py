"""Cifratura dei dati personali, profili (nome, bio, foto) e follow

- users.nickname / users.city diventano testo cifrato; nickname_key e city_idx diventano indici ciechi HMAC
- testi di post e commenti cifrati
- nuove colonne profilo: display_name, bio (cifrate), avatar_id, approve_followers
- tabella follows; segnalazioni dei profili (reports.target_ref)
I dati esistenti vengono cifrati qui, riga per riga.

Revision ID: 0004
Revises: 0003
Create Date: 2026-10-15
"""
import sqlalchemy as sa
from alembic import op

from app.crypto import city_index, encrypt_text, nick_index

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("users") as batch:
        batch.drop_index("ix_users_city")
        batch.drop_index("ix_users_nickname_key")
        batch.alter_column("nickname", type_=sa.Text(), existing_type=sa.String(24), existing_nullable=False)
        batch.alter_column("city", type_=sa.Text(), existing_type=sa.String(60), existing_nullable=True)
        batch.alter_column("nickname_key", type_=sa.String(64), existing_type=sa.String(24), existing_nullable=False)
        batch.add_column(sa.Column("display_name", sa.Text(), nullable=True))
        batch.add_column(sa.Column("bio", sa.Text(), nullable=True))
        batch.add_column(sa.Column("avatar_id", sa.String(32), nullable=True))
        batch.add_column(sa.Column("approve_followers", sa.Boolean(), nullable=False, server_default=sa.true()))
        batch.add_column(sa.Column("city_idx", sa.String(64), nullable=True))

    conn = op.get_bind()
    users = conn.execute(sa.text("select id, nickname, city from users")).fetchall()
    for uid, nickname, city in users:
        if nickname.startswith("e1:"):
            continue  # già cifrato
        conn.execute(
            sa.text("update users set nickname=:n, nickname_key=:k, city=:c, city_idx=:ci where id=:id"),
            {"n": encrypt_text(nickname, b"users.nickname"), "k": nick_index(nickname),
             "c": encrypt_text(city, b"users.city") if city else None,
             "ci": city_index(city) if city else None, "id": uid},
        )
    for table in ("posts", "comments"):
        rows = conn.execute(sa.text(f"select id, body from {table}")).fetchall()
        for rid, body in rows:
            if body is None or body.startswith("e1:"):
                continue
            conn.execute(sa.text(f"update {table} set body=:b where id=:id"),
                         {"b": encrypt_text(body, f"{table}.body".encode()), "id": rid})

    op.create_index("ix_users_nickname_key", "users", ["nickname_key"], unique=True)
    op.create_index("ix_users_city_idx", "users", ["city_idx"])

    op.create_table(
        "follows",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("follower_id", sa.String(32), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("followee_id", sa.String(32), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("status", sa.String(10), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("follower_id", "followee_id", name="uq_follow_pair"),
        sa.CheckConstraint("follower_id <> followee_id", name="ck_follow_not_self"),
    )
    op.create_index("ix_follows_follower_id", "follows", ["follower_id"])
    op.create_index("ix_follows_followee_id", "follows", ["followee_id"])

    with op.batch_alter_table("reports") as batch:
        batch.add_column(sa.Column("target_ref", sa.String(32), nullable=False, server_default=""))
        batch.drop_constraint("uq_report_once", type_="unique")
        batch.create_unique_constraint("uq_report_once", ["reporter_id", "target_type", "target_id", "target_ref"])


def downgrade() -> None:
    raise NotImplementedError("La cifratura non si annulla automaticamente: ripristina un backup del database.")
