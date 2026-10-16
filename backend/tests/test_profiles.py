"""Profili (nome, bio, foto) e follow con richieste."""
import io

from PIL import Image as PILImage

from app.config import MEDIA_DIR

ADMIN = {"X-Admin-Key": "test-admin-key"}


def jpeg(w=800, h=500) -> bytes:
    buf = io.BytesIO()
    PILImage.new("RGB", (w, h), (200, 100, 50)).save(buf, "JPEG")
    return buf.getvalue()


def rel(client, nick):
    return client.get(f"/api/users/{nick}").json()["relation"]


def test_profile_edit_and_validation(user):
    c, nick, *_ = user()
    r = c.patch("/api/me/profile", json={"display_name": "  Anna   Maria D'Angelo-Rossi ", "bio": "Ciao!"})
    assert r.status_code == 200 and r.json()["name"] == "Anna Maria D'Angelo-Rossi"
    for bad in ("A", "Mario123", "x" * 61, "http://spam.it", "😀😀"):
        assert c.patch("/api/me/profile", json={"display_name": bad}).status_code == 422, bad
    assert c.patch("/api/me/profile", json={"bio": "x" * 161}).status_code == 422
    assert c.patch("/api/me/profile", json={"display_name": ""}).json()["name"] is None  # si può togliere
    me = c.get("/api/me").json()
    assert me["bio"] == "Ciao!" and me["followers"] == 0 and me["pending_requests"] == 0


def test_avatar_upload_square_encrypted_and_replaced(user, new_client):
    c, nick, *_ = user()
    url = c.post("/api/me/avatar", files={"image": ("a.jpg", jpeg(), "image/jpeg")}).json()["avatar"]
    img = PILImage.open(io.BytesIO(c.get(url).content))
    assert img.size == (400, 400) and img.format == "WEBP"          # ritaglio quadrato
    other, *_ = user()
    assert other.get(url).status_code == 200                          # visibile agli utenti registrati
    assert new_client().get(url).status_code == 200                   # e a chi visita senza account
    old_id = url.split("/")[3]
    assert (MEDIA_DIR / f"img/{old_id}/av.webp").exists()
    url2 = c.post("/api/me/avatar", files={"image": ("b.jpg", jpeg(300, 900), "image/jpeg")}).json()["avatar"]
    assert url2 != url and not (MEDIA_DIR / f"img/{old_id}/av.webp").exists()  # la vecchia è cancellata
    assert c.post("/api/me/avatar", files={"image": ("x.jpg", b"nope", "image/jpeg")}).status_code == 422
    assert c.delete("/api/me/avatar").status_code == 204
    assert c.get(f"/api/users/{nick}").json()["avatar"] is None


def test_follow_request_accept_and_counts(user):
    a, na, *_ = user()
    b, nb, *_ = user()
    assert rel(a, nb) == {"following": "none", "follows_you": False, "requested_you": False}
    p = a.post(f"/api/users/{nb}/follow").json()
    assert p["relation"]["following"] == "pending" and p["followers"] == 0  # serve l'approvazione
    assert b.get("/api/me").json()["pending_requests"] == 1
    reqs = b.get("/api/me/requests").json()
    assert [r["nickname"] for r in reqs] == [na] and reqs[0]["relation"]["requested_you"]
    assert b.post(f"/api/me/requests/{na}/accept").json()["pending_requests"] == 0
    assert rel(a, nb)["following"] == "accepted" and rel(b, na)["follows_you"] is True
    assert a.get(f"/api/users/{nb}").json()["followers"] == 1
    assert a.get(f"/api/users/{na}").json()["following"] == 1
    # B ricambia: siccome A lo segue già, non serve un'altra approvazione ("segui anche tu")
    assert b.post(f"/api/users/{na}/follow").json()["relation"]["following"] == "accepted"
    assert [x["nickname"] for x in a.get(f"/api/users/{na}/followers").json()["items"]] == [nb]
    assert [x["nickname"] for x in a.get(f"/api/users/{na}/following").json()["items"]] == [nb]


def test_decline_cancel_unfollow_remove(user):
    a, na, *_ = user()
    b, nb, *_ = user()
    a.post(f"/api/users/{nb}/follow")
    assert b.post(f"/api/me/requests/{na}/decline").status_code == 200
    assert rel(a, nb)["following"] == "none"
    a.post(f"/api/users/{nb}/follow")
    assert a.delete(f"/api/users/{nb}/follow").json()["relation"]["following"] == "none"  # annulla la richiesta
    assert b.get("/api/me").json()["pending_requests"] == 0
    a.post(f"/api/users/{nb}/follow")
    b.post(f"/api/me/requests/{na}/accept")
    assert b.delete(f"/api/users/{na}/follower").status_code == 200   # B toglie A dai follower
    assert rel(a, nb)["following"] == "none"
    assert a.post(f"/api/users/{na}/follow").status_code == 422        # non se stessi
    assert b.post(f"/api/me/requests/{na}/accept").status_code == 404  # nessuna richiesta


def test_open_profile_accepts_automatically(user):
    a, na, *_ = user()
    b, nb, *_ = user()
    c, nc, *_ = user()
    c.post(f"/api/users/{nb}/follow")                                       # richiesta in attesa
    b.patch("/api/me/profile", json={"approve_followers": False})           # profilo aperto
    assert rel(c, nb)["following"] == "accepted"                            # le richieste in attesa passano
    assert a.post(f"/api/users/{nb}/follow").json()["relation"]["following"] == "accepted"


def test_following_feed_and_author_cards(user):
    a, na, *_ = user()
    b, nb, *_ = user()
    b.patch("/api/me/profile", json={"display_name": "Bruno Bianchi"})
    b.post("/api/me/avatar", files={"image": ("a.jpg", jpeg(), "image/jpeg")})
    pid = b.post("/api/posts", data={"body": "Post di Bruno"}).json()["id"]
    assert a.get("/api/posts?scope=following").json()["items"] == []
    a.post(f"/api/users/{nb}/follow")
    assert a.get("/api/posts?scope=following").json()["items"] == []        # richiesta non ancora accettata
    b.post(f"/api/me/requests/{na}/accept")
    feed = a.get("/api/posts?scope=following").json()["items"]
    assert [p["id"] for p in feed] == [pid]
    assert feed[0]["author_name"] == "Bruno Bianchi" and feed[0]["author_avatar"].endswith("/av")
    c = a.post(f"/api/posts/{pid}/comments", data={"body": "ciao"}).json()
    assert c["author"] == na and c["author_avatar"] is None
    assert [p["id"] for p in a.get(f"/api/users/{nb}/posts").json()["items"]] == [pid]


def test_search_exact_nickname(user):
    a, *_ = user()
    b, nb, *_ = user()
    assert [u["nickname"] for u in a.get(f"/api/users/search?q=@{nb.upper()}").json()] == [nb]
    assert a.get("/api/users/nessuno_cosi").status_code == 404


def test_search_while_typing_by_nickname_and_real_name(user, new_client):
    """Si trova una persona dalle prime lettere del nome utente o del nome reale, senza nomi in chiaro nel database."""
    from sqlalchemy import select
    from app.db import SessionLocal
    from app.models import NamePrefix

    reg = new_client()
    assert reg.post("/api/auth/register", json={"nickname": "zeffira.quaglia", "password": "una-password-lunga-1",
                                                "consent": True}).status_code == 201
    reg.patch("/api/me/profile", json={"display_name": "Zeffira Quaglia Ùlivetta"})
    other = new_client()
    other.post("/api/auth/register", json={"nickname": "xanto_k", "password": "una-password-lunga-1", "consent": True})
    a, *_ = user()
    nicks = lambda q: [u["nickname"] for u in a.get(f"/api/users/search?q={q}").json()]  # noqa: E731
    assert nicks("ze") == ["zeffira.quaglia"] and nicks("ZEFF") == ["zeffira.quaglia"]
    assert nicks("quag") == ["zeffira.quaglia"]          # seconda parola del nome utente
    assert nicks("uliv") == ["zeffira.quaglia"]          # nome reale, accenti ignorati
    assert nicks("zef qua") == ["zeffira.quaglia"]       # più parole: devono esserci tutte
    assert nicks("zef xanto") == []
    assert nicks("xant") == ["xanto_k"] and nicks("@xanto_k") == ["xanto_k"]
    assert nicks("z") == []                           # almeno 2 lettere
    first = a.get("/api/users/search?q=zef").json()[0]
    assert first["name"] == "Zeffira Quaglia Ùlivetta" and first["relation"]["following"] == "none"
    # cambiando nome, il vecchio non si trova più
    reg.patch("/api/me/profile", json={"display_name": "Zeffira Vòlpini"})
    assert nicks("uliv") == [] and nicks("volp") == ["zeffira.quaglia"]
    # nel database solo impronte, nessun pezzo di nome in chiaro
    with SessionLocal() as db:
        hs = list(db.scalars(select(NamePrefix.h)))
    assert hs and all(len(h) == 32 and "zef" not in h for h in hs)


def test_profile_report_impersonation_and_admin_reset(user, new_client):
    a, *_ = user()
    fake, nfake, *_ = user()
    fake.patch("/api/me/profile", json={"display_name": "Sergio Mattarella", "bio": "Account ufficiale"})
    fake.post("/api/me/avatar", files={"image": ("a.jpg", jpeg(), "image/jpeg")})
    body = {"target_type": "user", "target_nickname": nfake, "reason": "identita"}
    assert a.post("/api/reports", json=body).status_code == 201
    assert a.post("/api/reports", json=body).status_code == 409
    assert fake.post("/api/reports", json={**body}).status_code == 422          # non il proprio
    queue = new_client().get("/api/admin/reports", headers=ADMIN).json()
    item = next(i for i in queue if i["type"] == "user" and i["author"] == nfake)
    assert "Sergio Mattarella" in item["body"] and item["reasons"] == {"identita": 1} and item["images"]
    r = new_client().post(f"/api/admin/users/{nfake}/profile/reset", headers=ADMIN)
    assert r.status_code == 200
    prof = a.get(f"/api/users/{nfake}").json()
    assert prof["name"] is None and prof["bio"] is None and prof["avatar"] is None
    assert not any(i["type"] == "user" and i["author"] == nfake
                   for i in new_client().get("/api/admin/reports", headers=ADMIN).json())


def test_account_deletion_removes_follows_and_avatar(user):
    a, na, pw, _ = user()
    b, nb, *_ = user()
    url = a.post("/api/me/avatar", files={"image": ("a.jpg", jpeg(), "image/jpeg")}).json()["avatar"]
    a.post(f"/api/users/{nb}/follow")
    b.post(f"/api/me/requests/{na}/accept")
    b.post(f"/api/users/{na}/follow")
    assert a.post("/api/me/delete", json={"password": pw}).status_code == 204
    me_b = b.get("/api/me").json()
    assert me_b["followers"] == 0 and me_b["following"] == 0
    assert not (MEDIA_DIR / f"img/{url.split('/')[3]}/av.webp").exists()
    assert b.get(f"/api/users/{na}").status_code == 404


def test_banned_user_profile_hidden(user, new_client):
    a, *_ = user()
    b, nb, *_ = user()
    new_client().post("/api/admin/users/ban", headers=ADMIN, json={"nickname": nb})
    assert a.get(f"/api/users/{nb}").status_code == 404
    assert a.post(f"/api/users/{nb}/follow").status_code == 404


def test_people_reached_counts_people_not_interactions(user, new_client):
    """Persone coinvolte: chi commenta i tuoi post o vota i tuoi sondaggi conta una volta sola."""
    author, an, *_ = user()
    fan, *_ = user()
    other, *_ = user()
    troll, tn, *_ = user()
    post = author.post("/api/posts", data={"body": "Il parco riapre?"}).json()
    qid = author.post("/api/polls", data={"title": "Riapriamo il parco la sera?", "category": "Città"}).json()["id"]
    for _ in range(3):  # tanti commenti della stessa persona = 1
        fan.post(f"/api/posts/{post['id']}/comments", data={"body": "Sì!"})
    fan.post(f"/api/questions/{qid}/vote", json={"value": 1})        # stessa persona anche nel sondaggio = 1
    other.post(f"/api/questions/{qid}/vote", json={"value": -1})
    author.post(f"/api/posts/{post['id']}/comments", data={"body": "Grazie"})  # i propri non contano
    author.post(f"/api/questions/{qid}/vote", json={"value": 1})
    troll.post(f"/api/posts/{post['id']}/comments", data={"body": "boh"})
    p = new_client().get(f"/api/users/{an}").json()
    assert p["reached"] == 3 and p["reached_recent"] == 3 and p["polls"] == 1
    # le due misure separate: chi ha votato i sondaggi (fan, other) e chi ha risposto ai post (fan, troll)
    assert p["reached_polls"] == 2 and p["reached_posts"] == 2
    # il contenuto più coinvolgente (pari merito 2 e 2: vince il sondaggio, a parità conta il primo trovato)
    assert p["top"]["people"] == 2 and p["top"]["type"] in ("poll", "post")
    # con una sola persona non c'è un "più coinvolgente"
    solo, sn, *_ = user()
    sq = solo.post("/api/polls", data={"title": "Una domanda con un solo voto?", "category": "Città"}).json()["id"]
    fan.post(f"/api/questions/{sq}/vote", json={"value": 1})
    sp = new_client().get(f"/api/users/{sn}").json()
    assert sp["reached"] == 1 and sp["top"] is None
    # chi viene bannato non conta più
    new_client().post("/api/admin/users/ban", json={"nickname": tn}, headers={"X-Admin-Key": "test-admin-key"})
    assert new_client().get(f"/api/users/{an}").json()["reached"] == 2
    # sul post: persone diverse che hanno risposto (escluso l'autore)
    got = new_client().get(f"/api/posts/{post['id']}").json()
    assert got["comment_count"] == 5 and got["people"] == 1     # 3 di fan + 1 dell'autore + 1 del bannato: conta solo fan
    assert author.get("/api/me").json()["reached"] == 2
