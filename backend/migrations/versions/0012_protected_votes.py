"""Voti protetti: niente codice utente nei voti (impronta HMAC), contenuto cifrato, contatori a parte

Prima: votes(user_id, question_id, value, resident) in chiaro → chi apriva il database sapeva chi aveva votato cosa.
Dopo:  votes(question_id, owner=HMAC, user_ref/value/resident/city_ref CIFRATI) + vote_tallies (solo numeri).
I voti esistenti vengono convertiti, nessuno si perde.

Revision ID: 0012
Revises: 0011
Create Date: 2026-10-16
"""
import sqlalchemy as sa
from alembic import op

from app.crypto import encrypt_text, vote_owner

revision = "0012"
down_revision = "0011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    op.create_table(
        "votes_new",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("question_id", sa.Integer(), sa.ForeignKey("questions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("owner", sa.String(64), nullable=False),
        sa.Column("user_ref", sa.Text(), nullable=False),
        sa.Column("value", sa.Text(), nullable=False),
        sa.Column("resident", sa.Text(), nullable=True),
        sa.Column("city_ref", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("question_id", "owner", name="uq_vote_owner"),
    )
    op.create_table(
        "vote_tallies",
        sa.Column("question_id", sa.Integer(), sa.ForeignKey("questions.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("value", sa.Integer(), primary_key=True),
        sa.Column("resident", sa.Integer(), primary_key=True),
        sa.Column("n", sa.Integer(), nullable=False, server_default="0"),
    )

    city_of = dict(conn.execute(sa.text("select id, city_idx from users")).fetchall())
    rows = conn.execute(sa.text(
        "select user_id, question_id, value, resident, created_at, updated_at from votes")).fetchall()
    tallies: dict[tuple[int, int, int], int] = {}
    batch = []
    for user_id, qid, value, resident, created, updated in rows:
        res = None if resident is None else (1 if resident else 0)
        city = city_of.get(user_id)
        batch.append({
            "q": qid, "o": vote_owner(user_id),
            "u": encrypt_text(user_id, b"votes.user_ref"),
            "v": encrypt_text(str(int(value)), b"votes.value"),
            "r": encrypt_text(str(res), b"votes.resident") if res is not None else None,
            "c": encrypt_text(city, b"votes.city_ref") if city else None,
            "ca": created, "ua": updated or created,
        })
        key = (qid, int(value), -1 if res is None else res)
        tallies[key] = tallies.get(key, 0) + 1
    if batch:
        conn.execute(sa.text(
            "insert into votes_new (question_id, owner, user_ref, value, resident, city_ref, created_at, updated_at) "
            "values (:q, :o, :u, :v, :r, :c, :ca, :ua)"), batch)
    if tallies:
        conn.execute(sa.text("insert into vote_tallies (question_id, value, resident, n) values (:q, :v, :r, :n)"),
                     [{"q": q, "v": v, "r": r, "n": n} for (q, v, r), n in tallies.items()])

    op.drop_table("votes")
    op.rename_table("votes_new", "votes")
    op.create_index("ix_votes_question_id", "votes", ["question_id"])
    op.create_index("ix_votes_owner", "votes", ["owner"])


def downgrade() -> None:
    raise RuntimeError("I voti protetti non si possono riportare in chiaro: ripristina un backup se serve.")
