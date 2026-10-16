"""Amministratore nell'app e moderazione automatica dei sondaggi."""
from app.admin_cli import main as make_admin


def _poll(c, title="Un sondaggio proposto da un utente qualsiasi"):
    r = c.post("/api/proposals", json={"title": title, "description": "Una descrizione abbastanza lunga per il test.",
                                       "category": "Città"})
    assert r.status_code == 201, r.text
    return r.json()["id"]


def test_reported_poll_hides_itself(user):
    author, *_ = user()
    voters = [user()[0] for _ in range(4)]
    pid = _poll(author)
    for v in voters[:3]:
        assert v.post("/api/reports", json={"target_type": "question", "target_id": pid, "reason": "odio"}).status_code == 201
    # dopo 3 segnalazioni sparisce per tutti, senza che nessuno debba intervenire
    assert pid not in [q["id"] for q in voters[3].get("/api/questions/next?limit_n=50").json()]
    assert voters[3].post(f"/api/questions/{pid}/vote", json={"value": 1}).status_code == 404
    assert author.post("/api/reports", json={"target_type": "question", "target_id": pid, "reason": "odio"}).status_code in (404, 422)


def test_admin_moderates_from_the_app(user, new_client, capsys):
    admin, admin_nick, *_ = user()
    normal, *_ = user()
    troll, troll_nick, *_ = user()
    reporters = [user()[0] for _ in range(3)]
    # un utente normale non può moderare
    assert normal.get("/api/admin/reports").status_code == 403
    assert admin.get("/api/admin/reports").status_code == 403
    assert make_admin([admin_nick]) == 0                           # tools/make_admin.py
    assert "amministratore" in capsys.readouterr().out
    assert admin.get("/api/me").json()["is_admin"] is True

    pid = _poll(troll, "Un sondaggio che la gente segnala")
    post = troll.post("/api/posts", data={"body": "post da rimuovere"}).json()["id"]
    for r in reporters:
        r.post("/api/reports", json={"target_type": "question", "target_id": pid, "reason": "spam"})
        r.post("/api/reports", json={"target_type": "post", "target_id": post, "reason": "spam"})
    queue = admin.get("/api/admin/reports").json()
    kinds = {(i["type"], i["id"]) for i in queue}
    assert ("question", pid) in kinds and ("post", post) in kinds
    # ripristina il sondaggio, elimina il post, banna il troll: tutto dalla sessione, senza chiave
    assert admin.post(f"/api/admin/content/question/{pid}/restore").status_code == 200
    assert pid in [q["id"] for q in normal.get("/api/questions/next?limit_n=50").json()]
    assert admin.post(f"/api/admin/content/post/{post}/remove").status_code == 200
    assert normal.get(f"/api/posts/{post}").status_code == 404
    assert admin.post(f"/api/admin/content/question/{pid}/remove").status_code == 200
    assert normal.post(f"/api/questions/{pid}/vote", json={"value": 1}).status_code == 404
    assert admin.post("/api/admin/users/ban", json={"nickname": troll_nick, "purge": True}).status_code == 200
    assert troll.get("/api/me").status_code == 401
    # togliere il ruolo
    assert make_admin([admin_nick, "--rimuovi"]) == 0
    assert admin.get("/api/admin/reports").status_code == 403
    assert make_admin(["nessuno_cosi"]) == 1


def test_any_italian_comune_is_a_valid_city(user, new_client):
    c, *_ = user(city="Castelvetrano")                              # un comune piccolo, non delle 47 città
    assert c.get("/api/me").json()["city"] == "Castelvetrano"
    assert new_client().post("/api/auth/register", json={"nickname": "fantasy_city", "password": "password-lunga-1",
                                                         "city": "Atlantide", "consent": True}).status_code == 422
    pid = c.post("/api/posts", data={"body": "Ciao da Castelvetrano", "scope": "local"}).json()["id"]
    act = new_client().get("/api/places/activity").json()
    hit = next(a for a in act if a["city"] == "Castelvetrano")
    assert hit["posts"] >= 1 and 37 < hit["lat"] < 38 and 12 < hit["lon"] < 13   # Sicilia occidentale
    assert pid in [p["id"] for p in new_client().get("/api/posts?scope=city&city=Castelvetrano").json()["items"]]


def test_security_headers_allow_only_the_map_provider(new_client):
    h = new_client().get("/api/health").headers
    assert "connect-src 'self' https://tiles.openfreemap.org" in h["content-security-policy"]
    assert "geolocation=(self)" in h["permissions-policy"]


def test_responses_are_compressed(new_client):
    small = new_client().get("/api/health", headers={"Accept-Encoding": "gzip"})
    assert small.headers.get("content-encoding") is None          # sotto 1 KB non serve comprimere
    r = new_client().get("/api/public/questions", headers={"Accept-Encoding": "gzip"})
    assert r.headers.get("content-encoding") == "gzip" and len(r.json()) > 0
    assert "x-content-type-options" in r.headers   # gli header di sicurezza restano


def test_make_admin_lists_users_when_name_is_wrong(user, capsys):
    _, nick, *_ = user()
    assert make_admin(["TUONICK"]) == 1
    out = capsys.readouterr().out
    assert "Nessun utente @TUONICK" in out and f"@{nick}" in out        # il nome si legge, decifrato
    assert make_admin([]) == 0 and f"@{nick}" in capsys.readouterr().out
    assert make_admin(["@" + nick.upper()]) == 0                        # @ e maiuscole non contano
    assert "amministratore" in capsys.readouterr().out
