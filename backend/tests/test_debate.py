"""Le ragioni sotto i sondaggi (perché sì / perché no) e la domanda del giorno."""
from sqlalchemy import text

from app.admin_cli import main as make_admin
from app.db import engine


def _poll(c, title="Più alberi nei parcheggi della città?", **data):
    base = {"title": title, "category": "Ambiente"}
    r = c.post("/api/polls", data={**base, **data})
    assert r.status_code == 201, r.text
    return r.json()["id"]


def test_reasons_one_per_side_sorted_by_useful_anonymous(user):
    author, *_ = user()
    a, *_ = user()
    b, *_ = user()
    c, *_ = user()
    qid = _poll(author)
    r1 = a.post(f"/api/questions/{qid}/arguments", json={"side": "yes", "body": "Fanno ombra e d'estate le auto restano fresche."})
    assert r1.status_code == 201 and r1.json()["mine"] is True
    # una sola ragione per lato
    assert a.post(f"/api/questions/{qid}/arguments", json={"side": "yes", "body": "Un'altra ragione per il sì."}).status_code == 409
    assert a.post(f"/api/questions/{qid}/arguments", json={"side": "no", "body": "Le radici rovinano l'asfalto."}).status_code == 201
    r2 = b.post(f"/api/questions/{qid}/arguments", json={"side": "yes", "body": "L'aria è più pulita per chi abita vicino."}).json()
    # testi troppo corti, link e parole non ammesse vengono rifiutati
    assert c.post(f"/api/questions/{qid}/arguments", json={"side": "no", "body": "no"}).status_code == 422
    assert c.post(f"/api/questions/{qid}/arguments", json={"side": "no", "body": "guarda qui https://esempio.it"}).status_code == 422
    # "Utile": non sulle proprie, conta una volta, ordina la lista
    assert b.post(f"/api/arguments/{r2['id']}/useful").status_code == 422
    assert c.post(f"/api/arguments/{r2['id']}/useful").json()["useful"] == 1
    assert c.post(f"/api/arguments/{r2['id']}/useful").json()["useful"] == 1
    lists = c.get(f"/api/questions/{qid}/arguments").json()
    assert [x["id"] for x in lists["yes"]][0] == r2["id"] and lists["yes"][0]["voted"] is True
    assert len(lists["yes"]) == 2 and len(lists["no"]) == 1
    assert all("author" not in x for x in lists["yes"] + lists["no"])        # nessun nome
    # la card del sondaggio porta il riepilogo
    s = c.get(f"/api/questions/{qid}").json()["arguments"]
    assert s["yes"] == 2 and s["no"] == 1 and s["top_yes"]["id"] == r2["id"] and s["can_add"] is True
    assert c.delete(f"/api/arguments/{r2['id']}/useful").json()["useful"] == 0
    # solo l'autore elimina la propria
    assert c.delete(f"/api/arguments/{r1.json()['id']}").status_code == 404
    assert a.delete(f"/api/arguments/{r1.json()['id']}").status_code == 204
    # visibili anche a chi non è registrato, che però non può scrivere
    from fastapi.testclient import TestClient
    from app.main import app
    guest = TestClient(app)
    assert guest.get(f"/api/questions/{qid}/arguments").status_code == 200
    assert guest.post(f"/api/questions/{qid}/arguments", json={"side": "yes", "body": "Da ospite non si può."}).status_code == 401


def test_reasons_are_encrypted_at_rest(user):
    author, *_ = user()
    qid = _poll(author, "Una piazza senza auto la domenica?")
    secret = "Testo-segreto-della-ragione-123"
    assert author.post(f"/api/questions/{qid}/arguments", json={"side": "no", "body": secret}).status_code == 201
    with engine.connect() as conn:
        raw = conn.execute(text("SELECT body FROM arguments")).fetchall()
    assert raw and all(secret not in str(r[0]) for r in raw)


def test_restricted_poll_reasons_only_locals(user):
    author, *_ = user(city="Bari")
    outsider, *_ = user(city="Milano")
    local, *_ = user(city="Bari")
    qid = _poll(author, "Più bus la sera a Bari?", category="Trasporti", scope="local", city="Bari", audience="local")
    body = {"side": "yes", "body": "Chi lavora fino a tardi torna a casa sicuro."}
    assert outsider.get(f"/api/questions/{qid}").json()["arguments"]["can_add"] is False
    assert outsider.post(f"/api/questions/{qid}/arguments", json=body).status_code == 403
    assert local.post(f"/api/questions/{qid}/arguments", json=body).status_code == 201


def test_reported_reason_hides_and_admin_moderates(user):
    admin, admin_nick, *_ = user()
    author, *_ = user()
    writer, *_ = user()
    reporters = [user()[0] for _ in range(3)]
    qid = _poll(author, "Un parco giochi nuovo in periferia?")
    aid = writer.post(f"/api/questions/{qid}/arguments", json={"side": "no", "body": "Una ragione che verrà segnalata."}).json()["id"]
    assert writer.post("/api/reports", json={"target_type": "argument", "target_id": aid, "reason": "spam"}).status_code == 422
    for r in reporters:
        assert r.post("/api/reports", json={"target_type": "argument", "target_id": aid, "reason": "spam"}).status_code == 201
    assert reporters[0].get(f"/api/questions/{qid}/arguments").json()["no"] == []            # nascosta
    assert writer.get(f"/api/questions/{qid}/arguments").json()["no"][0]["hidden"] is True   # l'autore la vede
    assert make_admin([admin_nick]) == 0
    queue = admin.get("/api/admin/reports").json()
    item = next(i for i in queue if i["type"] == "argument" and i["id"] == aid)
    assert item["body"].startswith("Perché no:")
    assert admin.post(f"/api/admin/content/argument/{aid}/restore").status_code == 200
    assert len(reporters[0].get(f"/api/questions/{qid}/arguments").json()["no"]) == 1
    assert admin.post(f"/api/admin/content/argument/{aid}/remove").status_code == 200
    assert reporters[0].get(f"/api/questions/{qid}/arguments").json()["no"] == []


def test_deleting_poll_or_account_removes_reasons(user):
    author, *_ = user()
    writer, *_ = user()
    qid = _poll(author, "Un mercato contadino il sabato?")
    writer.post(f"/api/questions/{qid}/arguments", json={"side": "yes", "body": "Prodotti freschi e a chilometro zero."})
    q2 = _poll(author, "Le luci di Natale in tutti i quartieri?")
    writer.post(f"/api/questions/{q2}/arguments", json={"side": "yes", "body": "Anche le periferie meritano la festa."})
    assert author.delete(f"/api/questions/{qid}").status_code == 204
    assert writer.post("/api/me/delete", json={"password": "una-password-lunga-1"}).status_code == 204
    with engine.connect() as conn:
        assert conn.execute(text(f"SELECT count(*) FROM arguments WHERE question_id IN ({qid}, {q2})")).scalar() == 0


def test_poll_of_the_day_prefers_my_city_and_skips_answered(user):
    author, *_ = user(city="Torino")
    me, *_ = user(city="Torino")
    other, *_ = user(city="Napoli")
    national = _poll(author, "Una domanda per tutta Italia, molto votata?")
    for _ in range(2):
        user()[0].post(f"/api/questions/{national}/vote", json={"value": 1})
    local = _poll(author, "Una domanda solo per Torino?", scope="local", city="Torino")
    t = me.get("/api/polls/today").json()
    assert t["id"] == local and t["today"]["local"] is True                   # prima la tua città
    o = other.get("/api/polls/today").json()
    assert o["id"] != local                                                  # le altre città no
    assert me.post(f"/api/questions/{local}/vote", json={"value": 1}).status_code == 200
    assert me.get("/api/polls/today").json()["id"] != local                  # già risposto: si passa oltre
