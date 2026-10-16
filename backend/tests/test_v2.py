"""Test delle correzioni v2: consenso GDPR, eliminazione account, sintonia, hash, migrazioni."""
import os
import tempfile
import threading
import time

from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from sqlalchemy import create_engine, inspect, select, text
from sqlalchemy.pool import NullPool

from app import security
from app.config import DATABASE_URL, engine_kwargs
from app.crypto import decrypt_text, nick_index
from app.db import Base, SessionLocal
from app.migrate import alembic_config, run_migrations
from app.crypto import vote_owner
from app.models import Question, User, Vote

ADMIN = {"X-Admin-Key": "test-admin-key"}


def _approved_question(client, new_client, title="Questione di prova per il test"):
    r = client.post("/api/proposals", json={"title": title, "description": "Descrizione abbastanza lunga per il test.",
                                            "category": "Città", "scope": "national"})
    assert r.status_code == 201, r.text
    qid = r.json()["id"]
    assert new_client().post(f"/api/admin/questions/{qid}/approve", headers=ADMIN).status_code == 200
    return qid


# --- Consenso -------------------------------------------------------------------------------


def test_register_requires_explicit_consent(new_client):
    c = new_client()
    base = {"nickname": "senza_consenso", "password": "password-lunga-1"}
    for body in (base, {**base, "consent": False}):
        r = c.post("/api/auth/register", json=body)
        assert r.status_code == 422 and "informativa" in r.json()["detail"]
    assert c.post("/api/auth/register", json={**base, "consent": True}).status_code == 201
    with SessionLocal() as db:
        u = db.scalar(select(User).where(User.nickname_key == nick_index("senza_consenso")))
        assert u.consent_at is not None and u.privacy_version


def test_meta_exposes_privacy_info(new_client):
    p = new_client().get("/api/meta").json()["privacy"]
    assert p["version"] and p["min_age"] >= 14 and "contact" in p


# --- Eliminazione account -------------------------------------------------------------------


def test_delete_account_erases_user_and_votes(user, new_client):
    c, nick, pw, _ = user(city="Padova")
    other, *_ = user()
    qid = c.get("/api/questions/next").json()[0]["id"]
    c.post(f"/api/questions/{qid}/vote", json={"value": 1})
    published = _approved_question(c, new_client, "Proposta che verrà pubblicata prima")
    pending = c.post("/api/proposals", json={"title": "Proposta ancora in moderazione", "description":
                     "Descrizione abbastanza lunga per il test.", "category": "Città"}).json()["id"]
    with SessionLocal() as db:
        uid = db.scalar(select(User.id).where(User.nickname_key == nick_index(nick)))
        assert uid is not None

    assert c.post("/api/me/delete", json={"password": "sbagliata-123"}).status_code == 401
    assert c.post("/api/me/delete", json={"password": pw}).status_code == 204

    assert c.get("/api/me").status_code == 401  # cookie cancellato / utente inesistente
    with SessionLocal() as db:
        assert db.get(User, uid) is None
        assert db.scalar(select(Vote.id).where(Vote.owner == vote_owner(uid))) is None
        assert db.get(Question, pending).author_id is None       # sondaggio proposto: resta, anonimo
        assert db.get(Question, published).author_id is None     # pubblicata: resta, anonima
    assert new_client().post("/api/auth/login", json={"nickname": nick, "password": pw}).status_code == 401
    # il nickname torna disponibile
    again = new_client().post("/api/auth/register", json={"nickname": nick, "password": pw, "consent": True})
    assert again.status_code == 201
    assert other.get("/api/me").status_code == 200  # gli altri utenti non sono toccati


# --- Sintonia senza il proprio voto -----------------------------------------------------------


def test_alignment_excludes_own_vote(user, new_client):
    a, *_ = user()
    b, *_ = user()
    c, *_ = user()
    qid = _approved_question(a, new_client, "Questione isolata per la sintonia")
    a.post(f"/api/questions/{qid}/vote", json={"value": 1})
    b.post(f"/api/questions/{qid}/vote", json={"value": 1})
    c.post(f"/api/questions/{qid}/vote", json={"value": -1})
    # Contando anche A la maggioranza sarebbe "favorevole" (2 contro 1) e A risulterebbe 100% in sintonia.
    # Tra gli ALTRI è 1 a 1: pareggio, quindi la questione non è confrontabile.
    assert a.get("/api/me/pulse").json()["comparable"] == 0
    d, *_ = user()
    d.post(f"/api/questions/{qid}/vote", json={"value": -1})
    # Ora gli altri sono 1 favorevole e 2 contrari: A non è in sintonia.
    p = a.get("/api/me/pulse").json()
    assert p["comparable"] == 1 and p["aligned_pct"] == 0


# --- Limite di hash simultanei ----------------------------------------------------------------


def test_hash_concurrency_is_bounded(monkeypatch):
    state = {"now": 0, "peak": 0}
    lock = threading.Lock()

    class SlowHasher:
        def hash(self, value):
            with lock:
                state["now"] += 1
                state["peak"] = max(state["peak"], state["now"])
            time.sleep(0.05)
            with lock:
                state["now"] -= 1
            return "x"

    monkeypatch.setattr(security, "_ph", SlowHasher())
    threads = [threading.Thread(target=security.hash_secret, args=("p",)) for _ in range(20)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert state["peak"] == security.HASH_CONCURRENCY


# --- Migrazioni -------------------------------------------------------------------------------


def test_schema_matches_models():
    """Lo schema prodotto dalle migrazioni coincide con i modelli (nessuna migrazione dimenticata)."""
    eng = create_engine(DATABASE_URL, poolclass=NullPool, **engine_kwargs(DATABASE_URL))
    with eng.connect() as conn:
        diff = compare_metadata(MigrationContext.configure(conn, opts={"compare_type": True}), Base.metadata)
    eng.dispose()
    assert diff == [], diff


def test_legacy_v1_database_is_adopted_and_upgraded():
    """Un database creato dalla v1 (create_all, senza alembic_version) viene aggiornato senza perdere dati."""
    path = os.path.join(tempfile.mkdtemp(), "legacy.db")
    url = f"sqlite:///{path}"
    command.upgrade(alembic_config(url), "0001")  # schema identico alla v1
    eng = create_engine(url, poolclass=NullPool)
    with eng.begin() as conn:
        conn.execute(text("drop table alembic_version"))  # la v1 non aveva Alembic
        conn.execute(text(
            "insert into users (id, nickname, nickname_key, password_hash, recovery_hash, is_banned, created_at) "
            "values ('u1', 'Vecchio', 'vecchio', 'h', 'r', 0, '2026-10-01 10:00:00')"))
    run_migrations(url)
    cols = {c["name"] for c in inspect(eng).get_columns("users")}
    with eng.connect() as conn:
        version = conn.execute(text("select version_num from alembic_version")).scalar()
        raw_nick = conn.execute(text("select nickname from users where id='u1'")).scalar()
        key = conn.execute(text("select nickname_key from users where id='u1'")).scalar()
    eng.dispose()
    assert {"consent_at", "privacy_version", "display_name", "avatar_id", "city_idx"} <= cols
    assert version == "0014"
    # il nickname del vecchio utente ora è cifrato nel database, ma si decifra correttamente
    assert raw_nick.startswith("e1:") and "Vecchio" not in raw_nick
    assert decrypt_text(raw_nick, b"users.nickname") == "Vecchio" and key == nick_index("vecchio")
    run_migrations(url)  # rieseguire è innocuo


def test_upgrade_removes_pulse_polls_but_keeps_people_polls():
    """Aggiornando da 0006: spariscono i sondaggi "di Pulse" (con i loro voti), restano quelli delle persone."""
    path = os.path.join(tempfile.mkdtemp(), "v6.db")
    url = f"sqlite:///{path}"
    command.upgrade(alembic_config(url), "0006")
    eng = create_engine(url, poolclass=NullPool)
    with eng.begin() as conn:
        conn.execute(text(
            "insert into users (id, nickname, nickname_key, password_hash, recovery_hash, is_banned, is_admin, "
            "approve_followers, created_at) values ('u1', 'x', 'k1', 'h', 'r', 0, 0, 1, '2026-10-01 10:00:00')"))
        conn.execute(text(
            "insert into questions (id, seed_key, title, description, category, scope, status, created_at, ended_notified) "
            "values (1, 'n01', 'Di Pulse', '', 'Lavoro', 'national', 'approved', '2026-10-01', 0), "
            "(2, null, 'Di una persona', '', 'Lavoro', 'national', 'approved', '2026-10-01', 0)"))
        conn.execute(text("update questions set author_id = 'u1' where id = 2"))
        conn.execute(text("insert into votes (user_id, question_id, value, created_at, updated_at) values "
                          "('u1', 1, 1, '2026-10-01', '2026-10-01'), ('u1', 2, -1, '2026-10-01', '2026-10-01')"))
    run_migrations(url)
    with eng.connect() as conn:
        titles = [r[0] for r in conn.execute(text("select title from questions"))]
        votes = [r[0] for r in conn.execute(text("select question_id from votes"))]
        version = conn.execute(text("select version_num from alembic_version")).scalar()
    eng.dispose()
    assert titles == ["Di una persona"] and votes == [2] and version == "0014"
