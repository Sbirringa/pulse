from sqlalchemy import select

from app.db import SessionLocal
from app.models import Question


def test_register_sets_cookie_and_returns_recovery_code(user):
    c, nick, _pw, code = user()
    assert len(code.replace("-", "")) == 20
    me = c.get("/api/me").json()
    assert me["nickname"] == nick and me["answered"] == 0
    assert "httponly" in c.post("/api/auth/login", json={"nickname": nick, "password": _pw}).headers["set-cookie"].lower()


def test_nickname_unique_case_insensitive_and_validation(user, new_client):
    c, nick, pw, _ = user()
    other = new_client()
    ok = {"consent": True}
    assert other.post("/api/auth/register", json={"nickname": nick.upper(), "password": pw, **ok}).status_code == 409
    weak = other.post("/api/auth/register", json={"nickname": "nuovo_nick", "password": "corta", **ok})
    assert weak.status_code == 422 and "password" in weak.json()["detail"].lower()
    bad = other.post("/api/auth/register", json={"nickname": "a b", "password": pw, **ok})
    assert bad.status_code == 422
    reserved = other.post("/api/auth/register", json={"nickname": "admin", "password": pw, **ok})
    assert reserved.status_code == 422


def test_login_logout_and_auth_required(user, new_client):
    c, nick, pw, _ = user()
    anon = new_client()
    assert anon.get("/api/questions/next").status_code == 401
    assert anon.post("/api/auth/login", json={"nickname": nick, "password": "sbagliata-123"}).status_code == 401
    assert anon.post("/api/auth/login", json={"nickname": nick.upper(), "password": pw}).status_code == 200
    assert anon.get("/api/me").status_code == 200
    assert anon.post("/api/auth/logout").status_code == 204
    assert anon.get("/api/me").status_code == 401


def test_vote_flow_and_upsert(user):
    c, *_ = user()
    items = c.get("/api/questions/next").json()
    assert items and all(q["scope"] == "national" for q in items)  # senza città: solo nazionali
    qid = items[0]["id"]
    r = c.post(f"/api/questions/{qid}/vote", json={"value": 1})
    assert r.status_code == 200 and r.json()["mine"] == 1 and r.json()["total"] >= 1
    # rivotare aggiorna, non duplica
    r2 = c.post(f"/api/questions/{qid}/vote", json={"value": -1})
    assert r2.json()["mine"] == -1 and r2.json()["total"] == r.json()["total"]
    assert qid not in [q["id"] for q in c.get("/api/questions/next").json()]
    assert c.post(f"/api/questions/{qid}/vote", json={"value": 5}).status_code == 422
    # con un solo voto le percentuali non si mostrano: svelerebbero come ha votato quella persona
    if r2.json()["total"] < 2:
        assert r2.json()["pct"] is None and r2.json()["counts"] is None
    else:
        assert sum(r2.json()["pct"].values()) == 100


def test_secret_vote_percentages_need_enough_voters(user):
    """Il voto è segreto: sotto la soglia (2 nei test, 5 di base) si vede solo quante persone hanno votato."""
    a, *_ = user()
    b, *_ = user()
    qid = a.post("/api/polls", data={"title": "Una domanda per provare il segreto?", "category": "Lavoro"}).json()["id"]
    one = a.post(f"/api/questions/{qid}/vote", json={"value": 1}).json()
    assert one["total"] == 1 and one["pct"] is None and one["counts"] is None
    poll = a.get(f"/api/questions/{qid}").json()
    assert poll["results"]["total"] == 1 and poll["results"]["pct"] is None and poll["results"]["counts"] is None
    two = b.post(f"/api/questions/{qid}/vote", json={"value": -1}).json()
    assert two["pct"] == {"yes": 50, "depends": 0, "no": 50}


def test_custom_topics(user):
    c, *_ = user()
    r = c.post("/api/polls", data={"title": "Più fontanelle nei parchi pubblici?", "category": "  acqua   pubblica "})
    assert r.status_code == 201 and r.json()["category"] == "Acqua pubblica"
    assert c.post("/api/polls", data={"title": "Più fontanelle nei parchi pubblici?", "category": "trasporti"}).json()["category"] == "Trasporti"
    bad = c.post("/api/polls", data={"title": "Più fontanelle nei parchi pubblici?", "category": "<script>"})
    assert bad.status_code == 422 and "lettere" in bad.json()["detail"]
    p = c.post("/api/posts", data={"body": "Ciao", "category": "Mobilità dolce"})
    assert p.status_code == 201 and p.json()["category"] == "Mobilità dolce"


def test_results_hidden_until_voted(user):
    c, *_ = user()
    qid = c.get("/api/questions/next").json()[0]["id"]
    assert c.get(f"/api/questions/{qid}/results").status_code == 403
    c.post(f"/api/questions/{qid}/vote", json={"value": 0})
    assert c.get(f"/api/questions/{qid}/results").status_code == 200


def test_local_questions_visibility(user):
    c, *_ = user(city="Padova")
    items = c.get("/api/questions/next?limit_n=50").json()
    local = [q for q in items if q["scope"] == "local"]
    assert local and all(q["city"] == "Padova" for q in local)
    with SessionLocal() as db:
        roma = db.scalar(select(Question.id).where(Question.city == "Roma"))
    # un sondaggio di un'altra città si può votare, ma bisogna dire se si è di lì o di fuori
    r = c.post(f"/api/questions/{roma}/vote", json={"value": 1})
    assert r.status_code == 422 and "Roma" in r.json()["detail"]
    assert c.post(f"/api/questions/{roma}/vote", json={"value": 1, "resident": False}).status_code == 200


def test_city_breakdown_respects_threshold(user):
    a, *_ = user(city="Verona")
    b, *_ = user(city="Verona")
    qid = a.get("/api/questions/next").json()[0]["id"]
    first = a.post(f"/api/questions/{qid}/vote", json={"value": 1}).json()
    assert first["city"] is None  # 1 voto < soglia (2): nessun dato per città
    second = b.post(f"/api/questions/{qid}/vote", json={"value": -1}).json()
    assert second["city"] and second["city"]["name"] == "Verona" and second["city"]["total"] == 2


def test_recovery_flow(user, new_client):
    c, nick, pw, code = user()
    anon = new_client()
    assert anon.post("/api/auth/recover", json={"nickname": nick, "recovery_code": "AAAAA-AAAAA-AAAAA-AAAAA",
                                                "new_password": "nuova-password-99"}).status_code == 401
    r = anon.post("/api/auth/recover", json={"nickname": nick, "recovery_code": code.lower(),
                                             "new_password": "nuova-password-99"})
    assert r.status_code == 200
    new_code = r.json()["recovery_code"]
    assert new_code != code
    assert anon.get("/api/me").status_code == 200  # la sessione di recupero è attiva
    assert new_client().post("/api/auth/login", json={"nickname": nick, "password": pw}).status_code == 401
    assert new_client().post("/api/auth/login", json={"nickname": nick, "password": "nuova-password-99"}).status_code == 200
    assert c.get("/api/me").status_code == 401  # la vecchia sessione è decaduta
    # il vecchio codice non funziona più
    assert new_client().post("/api/auth/recover", json={"nickname": nick, "recovery_code": code,
                                                        "new_password": "ancora-altra-pw-1"}).status_code == 401


def test_pulse_profile(user):
    a, *_ = user()
    b, *_ = user()
    c, *_ = user()
    ids = [q["id"] for q in a.get("/api/questions/next?limit_n=3").json()]
    for qid in ids:
        for client in (a, b, c):  # A + almeno 2 altri (soglia di test = 2, il proprio voto non conta)
            client.post(f"/api/questions/{qid}/vote", json={"value": 1})
    p = a.get("/api/me/pulse").json()
    assert p["answered"] == 3 and p["streak"] == 1
    assert p["comparable"] >= 1 and p["aligned_pct"] is not None
    assert p["categories"] and len(p["recent"]) == 3


def test_proposals_are_published_immediately(user, new_client):
    c, *_ = user(city="Padova")
    other, *_ = user()
    title = "Più panchine nei parchi pubblici della città"
    r = c.post("/api/proposals", json={"title": title, "description": "Servono più posti dove sedersi, soprattutto per gli anziani.",
                                       "category": "Città", "scope": "national"})
    assert r.status_code == 201 and r.json()["status"] == "approved"      # niente attesa
    pid = r.json()["id"]
    assert pid in [q["id"] for q in other.get("/api/questions/next?limit_n=50").json()]
    assert c.get("/api/me/proposals").json()[0]["status"] == "approved"
    bad = c.post("/api/proposals", json={"title": "Il sindaco è un coglione", "description": "Mandiamolo a casa subito, che schifo.",
                                         "category": "Città"})
    assert bad.status_code == 422 and "offensive" in bad.json()["detail"]


def test_proposal_rejects_links_and_needs_city_for_local(user):
    c, *_ = user()
    base = {"title": "Un titolo abbastanza lungo", "description": "Una descrizione abbastanza lunga per passare.",
            "category": "Città"}
    assert c.post("/api/proposals", json={**base, "description": "Guarda https://spam.example per i dettagli completi"}).status_code == 422
    assert c.post("/api/proposals", json={**base, "scope": "local"}).status_code == 422


def test_public_question_security_headers_and_og(new_client):
    c = new_client()
    q = c.get("/api/public/questions/1")
    assert q.status_code == 200 and "title" in q.json()
    assert c.get("/api/public/questions/999999").status_code == 404
    h = c.get("/api/health")
    assert h.json() == {"status": "ok"}
    assert h.headers["x-content-type-options"] == "nosniff"
    assert "frame-ancestors 'none'" in h.headers["content-security-policy"]
    assert c.get("/api/does-not-exist").status_code == 404
