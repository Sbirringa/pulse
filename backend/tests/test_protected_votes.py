"""Voti protetti: nel database non c'è chi ha votato né cosa; i risultati restano giusti."""
import os
import tempfile

from alembic import command
from sqlalchemy import create_engine, select, text
from sqlalchemy.pool import NullPool

from app.crypto import decrypt_text, nick_index, vote_owner
from app.db import SessionLocal
from app.migrate import alembic_config, run_migrations
from app.models import User, VoteTally


def _uid(nick: str) -> str:
    with SessionLocal() as db:
        return db.scalar(select(User.id).where(User.nickname_key == nick_index(nick)))


def test_raw_database_reveals_neither_who_nor_what(user):
    author, *_ = user()
    voter, nv, *_ = user(city="Torino")
    qid = author.post("/api/polls", data={"title": "Più alberi in centro, anche togliendo parcheggi?",
                                          "category": "Ambiente"}).json()["id"]
    assert voter.post(f"/api/questions/{qid}/vote", json={"value": -1}).status_code == 200
    uid = _uid(nv)
    with SessionLocal() as db:
        rows = db.execute(text("select * from votes where question_id = :q"), {"q": qid}).mappings().all()
    assert len(rows) == 1
    raw = rows[0]
    flat = " ".join(str(v) for v in raw.values())
    assert uid not in flat                                     # il codice dell'utente non c'è
    assert "user_id" not in raw                                # nemmeno la colonna
    for col in ("value", "user_ref", "city_ref"):
        assert str(raw[col]).startswith("e1:"), col            # tutto cifrato
    assert raw["owner"] == vote_owner(uid) and raw["owner"] != uid
    # con la chiave (solo il server) si decifra: è proprio quel voto
    assert decrypt_text(raw["value"], b"votes.value") == "-1"
    assert decrypt_text(raw["user_ref"], b"votes.user_ref") == uid


def test_counts_follow_changes_and_deletions(user):
    author, *_ = user()
    a, *_ = user()
    b, nb, pb, _ = user()
    qid = author.post("/api/polls", data={"title": "Bus gratis per gli studenti fino a 26 anni?",
                                          "category": "Trasporti"}).json()["id"]
    a.post(f"/api/questions/{qid}/vote", json={"value": 1})
    r = b.post(f"/api/questions/{qid}/vote", json={"value": 1}).json()
    assert r["total"] == 2 and r["counts"] == {"yes": 2, "depends": 0, "no": 0}
    r = b.post(f"/api/questions/{qid}/vote", json={"value": 0}).json()          # cambia voto
    assert r["total"] == 2 and r["counts"] == {"yes": 1, "depends": 1, "no": 0} and r["mine"] == 0
    with SessionLocal() as db:
        tallies = {(t.value, t.resident): t.n for t in db.scalars(select(VoteTally).where(VoteTally.question_id == qid))}
    assert tallies == {(1, -1): 1, (0, -1): 1}
    # account eliminato: il suo voto sparisce anche dai conteggi
    assert b.post("/api/me/delete", json={"password": pb}).status_code == 204
    r = a.get(f"/api/questions/{qid}/results").json()
    assert r["total"] == 1 and r["mine"] == 1
    # le mie risposte e il conteggio nel profilo
    me = a.get("/api/me").json()
    assert me["answered"] >= 1
    assert any(x["question_id"] == qid and x["mine"] == 1 for x in a.get("/api/me/pulse").json()["recent"])


def test_city_breakdown_without_storing_city_groups(user):
    author, *_ = user()
    voters = [user(city="Lecce")[0] for _ in range(2)]
    me, *_ = user(city="Lecce")
    qid = author.post("/api/polls", data={"title": "Spiagge libere più grandi in tutta Italia?",
                                          "category": "Ambiente"}).json()["id"]
    for c in voters:
        c.post(f"/api/questions/{qid}/vote", json={"value": 1})
    r = me.post(f"/api/questions/{qid}/vote", json={"value": -1}).json()
    assert r["city"]["name"] == "Lecce" and r["city"]["total"] == 3
    assert r["city"]["pct"] == {"yes": 67, "depends": 0, "no": 33}
    cols = [c.name for c in VoteTally.__table__.columns]   # nei contatori non c'è la città
    assert cols == ["question_id", "value", "resident", "n"]


def test_upgrade_converts_existing_plain_votes():
    """Aggiornando da 0011: i voti in chiaro diventano protetti e i conteggi restano uguali."""
    path = os.path.join(tempfile.mkdtemp(), "v11.db")
    url = f"sqlite:///{path}"
    command.upgrade(alembic_config(url), "0011")
    eng = create_engine(url, poolclass=NullPool)
    with eng.begin() as conn:
        for i in (1, 2, 3):
            conn.execute(text(
                "insert into users (id, nickname, nickname_key, password_hash, recovery_hash, is_banned, is_admin, "
                "approve_followers, is_private, created_at, city_idx) values "
                f"('u{i}', 'x', 'k{i}', 'h', 'r', 0, 0, 1, 0, '2026-10-01 10:00:00', 'cidx')"))
        conn.execute(text(
            "insert into questions (id, title, description, category, scope, city, status, created_at, ended_notified) "
            "values (7, 'Sondaggio di prova?', '', 'Lavoro', 'local', 'Bari', 'approved', '2026-10-01', 0)"))
        conn.execute(text(
            "insert into votes (user_id, question_id, value, resident, created_at, updated_at) values "
            "('u1', 7, 1, 1, '2026-10-01', '2026-10-01'), ('u2', 7, 1, 0, '2026-10-01', '2026-10-01'), "
            "('u3', 7, -1, 1, '2026-10-02', '2026-10-02')"))
    run_migrations(url)
    with eng.connect() as conn:
        rows = conn.execute(text("select owner, user_ref, value, resident, city_ref from votes order by id")).fetchall()
        tallies = sorted(conn.execute(text("select value, resident, n from vote_tallies where question_id = 7")).fetchall())
        cols = [r[1] for r in conn.execute(text("pragma table_info(votes)"))]
        version = conn.execute(text("select version_num from alembic_version")).scalar()
    eng.dispose()
    assert version == "0014" and "user_id" not in cols
    assert [r[0] for r in rows] == [vote_owner(f"u{i}") for i in (1, 2, 3)]
    assert [decrypt_text(r[2], b"votes.value") for r in rows] == ["1", "1", "-1"]
    assert [decrypt_text(r[3], b"votes.resident") for r in rows] == ["1", "0", "1"]
    assert decrypt_text(rows[0][4], b"votes.city_ref") == "cidx"
    assert all(str(r[1]).startswith("e1:") for r in rows)
    assert tallies == [(-1, 1, 1), (1, 0, 1), (1, 1, 1)]
    run_migrations(url)  # rieseguire è innocuo
