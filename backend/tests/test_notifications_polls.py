"""Notifiche e sondaggi creati dalle persone (foto, scadenza, percentuali, nel feed della Piazza)."""
from datetime import datetime, timedelta, timezone

from sqlalchemy import select, update

from app import notifications
from app.db import SessionLocal
from app.models import Image, Notification, Question
from tests.test_social import jpeg, media_files

ADMIN = {"X-Admin-Key": "test-admin-key"}


def _poll(c, title="Più piste ciclabili in centro?", duration=None, image=False, scope="national", **extra):
    data = {"title": title, "description": extra.get("description", ""), "category": "Trasporti", "scope": scope}
    if extra.get("city"):
        data["city"] = extra["city"]
    if duration:
        data["duration_days"] = str(duration)
    files = {"image": ("foto.jpg", jpeg(), "image/jpeg")} if image else None
    return c.post("/api/polls", data=data, files=files)


def _end(qid: int) -> None:
    with SessionLocal() as db:
        db.execute(update(Question).where(Question.id == qid)
                   .values(ends_at=datetime.now(timezone.utc) - timedelta(minutes=1)))
        db.commit()
    notifications._last_sweep = 0.0  # il controllo dei sondaggi conclusi gira al massimo ogni 30 secondi


def _notes(c) -> list[dict]:
    notifications._last_sweep = 0.0
    r = c.get("/api/notifications")
    assert r.status_code == 200, r.text
    return r.json()["items"]


# --- sondaggi --------------------------------------------------------------------------------


def test_poll_with_photo_and_deadline(user, new_client):
    c, nick, *_ = user()
    before = media_files()
    r = _poll(c, duration=3, image=True)
    assert r.status_code == 201, r.text
    p = r.json()
    assert p["type"] == "poll" and p["is_author"] and p["author"]["nickname"] == nick
    assert p["image"] and p["image"]["sm"].startswith("/api/media/")
    ends = datetime.fromisoformat(p["ends_at"])
    assert timedelta(days=2, hours=23) < ends - datetime.now(timezone.utc) <= timedelta(days=3)
    assert len(media_files()) > len(before)
    # la foto si vede anche senza account; i risultati anche l'autore li vede dopo aver votato
    assert new_client().get(p["image"]["sm"]).status_code == 200
    assert p["results"] is None
    assert c.post(f"/api/questions/{p['id']}/vote", json={"value": 1}).json()["total"] == 1
    # durata non prevista → errore chiaro
    bad = _poll(c, title="Un altro sondaggio di prova?", duration=5)
    assert bad.status_code == 422 and "Durata" in bad.json()["detail"]


def test_percentages_shown_after_voting_and_poll_closes(user, new_client):
    author, *_ = user()
    qid = _poll(author, duration=1).json()["id"]
    voters = [user()[0] for _ in range(3)]
    guest = new_client()
    # prima di votare: niente percentuali (per non influenzare)
    seen = voters[0].get(f"/api/questions/{qid}").json()
    assert seen["results"] is None and seen["can_vote"] and seen["my_vote"] is None
    for c, v in zip(voters, (1, 1, -1)):
        assert c.post(f"/api/questions/{qid}/vote", json={"value": v}).status_code == 200
    mine = voters[0].get(f"/api/questions/{qid}").json()
    assert mine["my_vote"] == 1 and mine["results"]["pct"] == {"yes": 67, "depends": 0, "no": 33}
    assert guest.get(f"/api/questions/{qid}/results").status_code == 403
    _end(qid)
    # concluso: niente più voti, risultati visibili a tutti, anche agli ospiti
    late = user()[0]
    r = late.post(f"/api/questions/{qid}/vote", json={"value": 0})
    assert r.status_code == 409 and "concluso" in r.json()["detail"]
    g = guest.get(f"/api/questions/{qid}").json()
    assert g["ended"] and not g["can_vote"] and g["results"]["total"] == 3
    assert guest.get(f"/api/questions/{qid}/results").json()["pct"]["yes"] == 67
    # sparisce da "da votare", resta tra i conclusi
    assert all(q["id"] != qid for q in late.get("/api/questions/next?limit_n=50").json())
    assert any(q["id"] == qid for q in guest.get("/api/polls?status=ended").json()["items"])
    assert all(q["id"] != qid for q in guest.get("/api/polls").json()["items"])


def test_polls_appear_in_the_piazza_feed(user, new_client):
    c, nick, *_ = user()
    c.post("/api/posts", data={"body": "Prima un post"})
    qid = _poll(c, title="Mercato rionale anche la domenica?").json()["id"]
    c.post("/api/posts", data={"body": "Poi un altro post"})
    items = new_client().get("/api/posts?scope=all").json()["items"]
    kinds = [(i["type"], i.get("body") or i.get("title")) for i in items[:3]]
    assert kinds == [("post", "Poi un altro post"), ("poll", "Mercato rionale anche la domenica?"),
                     ("post", "Prima un post")]
    assert any(i["type"] == "poll" and i["id"] == qid for i in new_client().get(f"/api/polls?author={nick}").json()["items"])


def test_city_poll_everyone_votes_and_results_split_by_residents(user, new_client):
    roman, *_ = user(city="Roma")
    roman2, *_ = user(city="Roma")
    milanese, *_ = user(city="Milano")
    nocity, *_ = user()
    qid = _poll(roman, title="Più alberi a Testaccio, siete d'accordo?", scope="local").json()["id"]
    # tutti possono votare
    p = milanese.get(f"/api/questions/{qid}").json()
    assert p["city"] == "Roma" and p["can_vote"] and not p["is_resident"]
    assert roman2.get(f"/api/questions/{qid}").json()["is_resident"]          # stessa città del profilo
    # chi non è di Roma deve dire come vota
    r = milanese.post(f"/api/questions/{qid}/vote", json={"value": -1})
    assert r.status_code == 422 and "Roma" in r.json()["detail"]
    assert milanese.post(f"/api/questions/{qid}/vote", json={"value": -1, "resident": False}).status_code == 200
    # chi ha Roma nel profilo conta come romano anche se dice altro
    roman.post(f"/api/questions/{qid}/vote", json={"value": 1, "resident": False})
    r = roman2.post(f"/api/questions/{qid}/vote", json={"value": 1}).json()
    assert r["local"]["residents"] == {"total": 2, "pct": {"yes": 100, "depends": 0, "no": 0}}
    # sotto la soglia (2 in questi test) di un gruppo si vede solo il numero, non come ha votato
    assert r["local"]["outside"] == {"total": 1, "pct": None}
    # chi non ha città dichiara "sono di Roma" (ci lavora o studia)
    nocity.post(f"/api/questions/{qid}/vote", json={"value": 0, "resident": True})
    out = nocity.get(f"/api/questions/{qid}").json()
    assert out["my_resident"] is True and out["results"]["local"]["residents"]["total"] == 3
    assert out["results"]["total"] == 4
    # "sono di Roma" resta ricordato per tutta la città: si toglie dalle Impostazioni, poi si vota da fuori
    assert nocity.get("/api/me").json()["places"] == ["Roma"]
    assert nocity.request("DELETE", "/api/me/places", json={"city": "Roma"}).json()["places"] == []
    nocity.post(f"/api/questions/{qid}/vote", json={"value": 0, "resident": False})
    split = nocity.get(f"/api/questions/{qid}").json()["results"]["local"]
    assert split["residents"]["total"] == 2 and split["outside"]["total"] == 2
    assert split["outside"]["pct"] == {"yes": 0, "depends": 50, "no": 50}
    # i sondaggi nazionali non hanno la divisione
    nat = _poll(roman, title="Una domanda per tutta Italia, va bene?").json()
    assert roman.post(f"/api/questions/{nat['id']}/vote", json={"value": 1}).json()["local"] is None


def test_city_filters_posts_and_polls(user, new_client):
    c, *_ = user(city="Bari")
    c.post("/api/posts", data={"body": "Lungomare pieno stasera", "scope": "local"})
    qid = _poll(c, title="Bus fino a tardi per il lungomare?", scope="local").json()["id"]
    g = new_client()
    assert {i["type"] for i in g.get("/api/posts?scope=city&city=Bari").json()["items"]} == {"post", "poll"}
    assert {i["type"] for i in g.get("/api/posts?scope=city&city=Bari&kind=posts").json()["items"]} == {"post"}
    polls = g.get("/api/polls?city=Bari&status=all").json()["items"]
    assert polls[0]["id"] == qid and all(p["city"] == "Bari" for p in polls)   # (nei test ci sono anche gli esempi)
    assert qid not in [p["id"] for p in g.get("/api/polls?city=Milano&status=all").json()["items"]]
    assert g.get("/api/polls?following=true").status_code == 401


def test_admin_removing_a_poll_deletes_its_photo(user, new_client):
    c, *_ = user()
    before = media_files()
    p = _poll(c, image=True).json()
    assert len(media_files()) > len(before)
    r = new_client().post(f"/api/admin/content/question/{p['id']}/remove", headers=ADMIN)
    assert r.status_code == 200
    assert media_files() == before
    with SessionLocal() as db:
        assert db.scalar(select(Image).where(Image.id == p["image"]["id"])) is None


def test_avatar_cleanup_does_not_touch_poll_photos(user):
    c, *_ = user()
    p = _poll(c, image=True).json()
    assert c.post("/api/me/delete", json={"password": "una-password-lunga-1"}).status_code == 204
    with SessionLocal() as db:   # il sondaggio pubblicato resta (senza autore) con la sua foto
        assert db.get(Question, p["id"]).author_id is None
        assert db.scalar(select(Image).where(Image.id == p["image"]["id"])) is not None


# --- notifiche -------------------------------------------------------------------------------


def test_follow_request_and_accept_notifications(user):
    alice, alice_nick, *_ = user()
    bob, bob_nick, *_ = user()
    bob.post(f"/api/users/{alice_nick}/follow")                       # Alice approva i follower
    unread = alice.get("/api/notifications/unread").json()
    assert unread == {"count": 0, "pending_requests": 1}   # la richiesta si conta una volta sola
    n = _notes(alice)
    assert [x["kind"] for x in n] == ["follow_request"] and n[0]["actor"]["nickname"] == bob_nick
    # richiesta annullata → la notifica sparisce
    bob.delete(f"/api/users/{alice_nick}/follow")
    assert _notes(alice) == []
    bob.post(f"/api/users/{alice_nick}/follow")
    alice.post(f"/api/me/requests/{bob_nick}/accept")
    assert [x["kind"] for x in _notes(alice)] == ["follow"]          # ora "ha iniziato a seguirti"
    assert [x["kind"] for x in _notes(bob)] == ["follow_accepted"]
    # segna come lette
    assert bob.get("/api/notifications/unread").json()["count"] == 1
    assert bob.post("/api/notifications/read").status_code == 204
    assert bob.get("/api/notifications/unread").json()["count"] == 0
    assert _notes(bob)[0]["read"] is True


def test_comment_and_reply_notifications(user):
    author, *_ = user()
    anna, anna_nick, *_ = user()
    marco, marco_nick, *_ = user()
    post = author.post("/api/posts", data={"body": "Il parco è chiuso da mesi"}).json()
    c1 = anna.post(f"/api/posts/{post['id']}/comments", data={"body": "Ho scritto al Comune ieri"}).json()
    marco.post(f"/api/posts/{post['id']}/comments", data={"body": "Cosa ti hanno risposto?", "reply_to": c1["id"]})
    a = _notes(author)
    assert [(x["kind"], x["actor"]["nickname"]) for x in a] == [("comment", marco_nick), ("comment", anna_nick)]
    assert a[1]["text"] == "Ho scritto al Comune ieri" and a[1]["post_id"] == post["id"]
    b = _notes(anna)
    assert [(x["kind"], x["text"]) for x in b] == [("reply", "Cosa ti hanno risposto?")]
    # nessuna notifica per i propri commenti
    author.post(f"/api/posts/{post['id']}/comments", data={"body": "Grazie a tutti"})
    assert len(_notes(author)) == 2
    # commento eliminato → la notifica sparisce
    anna.delete(f"/api/comments/{c1['id']}")
    assert all(x["comment_id"] != c1["id"] for x in _notes(author))


def test_poll_ended_notifies_author_and_voters(user):
    author, *_ = user()
    voter, *_ = user()
    bystander, *_ = user()
    qid = _poll(author, duration=7).json()["id"]
    voter.post(f"/api/questions/{qid}/vote", json={"value": -1})
    assert _notes(author) == []
    _end(qid)
    for c, mine in ((author, True), (voter, False)):
        n = _notes(c)
        assert [x["kind"] for x in n] == ["poll_ended"]
        assert n[0]["poll"] == {"total": 1, "pct": None, "mine": mine}   # 1 voto: percentuali nascoste (voto segreto)
        assert n[0]["text"] == "Più piste ciclabili in centro?"
    assert _notes(bystander) == []
    # una volta sola
    assert len(_notes(author)) == 1


def test_banned_actor_notifications_hidden_and_old_ones_pruned(user, new_client):
    alice, alice_nick, *_ = user()
    troll, troll_nick, *_ = user()
    alice.patch("/api/me/profile", json={"approve_followers": False})
    troll.post(f"/api/users/{alice_nick}/follow")
    assert alice.get("/api/notifications/unread").json()["count"] == 1
    new_client().post("/api/admin/users/ban", json={"nickname": troll_nick}, headers=ADMIN)
    assert alice.get("/api/notifications/unread").json()["count"] == 0
    assert _notes(alice) == []
    # se ne conservano al massimo 200
    with SessionLocal() as db:
        uid = db.scalar(select(Notification.user_id).where(Notification.kind == "follow")
                        .order_by(Notification.id.desc()))
        db.add_all([Notification(user_id=uid, kind="follow_accepted") for _ in range(230)])
        db.commit()
    alice.post("/api/notifications/read")
    with SessionLocal() as db:
        assert db.scalar(select(Notification).where(Notification.user_id == uid).offset(200)) is None


def test_author_can_delete_own_poll(user, new_client):
    author, *_ = user()
    other, *_ = user()
    before = media_files()
    p = _poll(author, image=True).json()
    other.post(f"/api/questions/{p['id']}/vote", json={"value": 1})
    assert other.delete(f"/api/questions/{p['id']}").status_code == 404      # solo chi l'ha creato
    assert author.delete(f"/api/questions/{p['id']}").status_code == 204
    assert new_client().get(f"/api/questions/{p['id']}").status_code == 404
    assert media_files() == before


def test_choose_any_city_for_posts_and_polls(user, new_client):
    c, *_ = user()                                     # nessuna città nel profilo
    r = c.post("/api/posts", data={"body": "Lavori in corso in piazza Duomo", "scope": "local", "city": "Castelvetrano"})
    assert r.status_code == 201 and r.json()["city"] == "Castelvetrano"
    assert c.post("/api/posts", data={"body": "x", "scope": "local"}).json()["detail"] == "Scegli la città del post."
    assert c.post("/api/posts", data={"body": "x", "scope": "local", "city": "Atlantide"}).status_code == 422
    p = _poll(c, title="Più parcheggi per le bici in centro?", scope="local", city="Castelvetrano")
    assert p.status_code == 201 and p.json()["city"] == "Castelvetrano"
    bad = _poll(c, title="Più parcheggi per le bici in centro?", scope="local", city="Atlantide")
    assert bad.status_code == 422 and "Città non valida" in bad.json()["detail"]
    # nella città scelta si vede tra i post locali
    items = new_client().get("/api/posts?scope=city&city=Castelvetrano").json()["items"]
    assert {i["type"] for i in items} == {"post", "poll"}


def test_group_breakdowns_never_go_below_the_secrecy_threshold(monkeypatch, user):
    """Anche se la soglia per città fosse più bassa, nessun gruppo mostra percentuali sotto quella generale."""
    from app import polls
    monkeypatch.setattr(polls, "GROUP_MIN", max(1, polls.MIN_RESULTS))
    a, *_ = user(city="Lecce")
    qid = _poll(a, title="Una domanda nazionale da Lecce?").json()["id"]
    r = a.post(f"/api/questions/{qid}/vote", json={"value": 1}).json()
    assert r["pct"] is None and r["city"] is None   # 1 voto: niente percentuali, nemmeno per Lecce


def test_divisive_badge(user, monkeypatch):
    from app import polls
    monkeypatch.setattr(polls, "DIVISIVE_MIN_VOTES", 4)
    a, *_ = user()
    qid = _poll(a, title="Domanda che divide la città?").json()["id"]
    voters = [user()[0] for _ in range(4)]
    for c, v in zip(voters, (1, -1, 1, 0)):
        c.post(f"/api/questions/{qid}/vote", json={"value": v})
    assert a.get(f"/api/questions/{qid}").json()["divisive"] is False   # 50/25/25: favorevoli+contrari = 75, ma 50 vs 25
    voters[2].post(f"/api/questions/{qid}/vote", json={"value": -1})    # ora 25/25/50? no: 1,-1,-1,0 → 25/25/50
    assert a.get(f"/api/questions/{qid}").json()["divisive"] is False   # troppi "dipende"
    voters[3].post(f"/api/questions/{qid}/vote", json={"value": 1})     # 1,-1,-1,1 → 50/0/50
    assert a.get(f"/api/questions/{qid}").json()["divisive"] is True
