"""In evidenza: i contenuti che hanno coinvolto più persone negli ultimi 7 giorni."""
from datetime import datetime, timedelta, timezone

from sqlalchemy import update

from app.db import SessionLocal
from app.models import Vote


def _poll(c, title, **data):
    r = c.post("/api/polls", data={"title": title, "category": "Città", **data})
    assert r.status_code == 201, r.text
    return r.json()["id"]


def test_trending_counts_people_and_respects_scope(user, new_client):
    author, *_ = user(city="Lucca")
    people = [user(city="Lucca")[0] for _ in range(5)]
    # sondaggio di Lucca votato da 5 persone
    q = _poll(author, "Più verde sulle mura di Lucca?", scope="local", city="Lucca")
    for p in people:
        assert p.post(f"/api/questions/{q}/vote", json={"value": 1}).status_code == 200
    # post di Lucca: 3 persone (uno commenta due volte: conta 1), l'autore non conta
    post = author.post("/api/posts", data={"body": "Mercatino sabato in piazza Anfiteatro", "scope": "local", "city": "Lucca"}).json()
    for p in people[:3]:
        p.post(f"/api/posts/{post['id']}/comments", data={"body": "ci sono"})
    people[0].post(f"/api/posts/{post['id']}/comments", data={"body": "porto i dolci"})
    author.post(f"/api/posts/{post['id']}/comments", data={"body": "grazie"})
    # contenuto con solo 1 persona: sotto soglia
    small = author.post("/api/posts", data={"body": "Qualcuno ha visto il gatto?", "scope": "local", "city": "Lucca"}).json()
    people[4].post(f"/api/posts/{small['id']}/comments", data={"body": "no"})

    r = new_client().get("/api/trending?where=city&city=Lucca").json()   # anche da ospite
    ids = [(x["type"], x["id"], x["week_people"]) for x in r["items"]]
    assert ids[0] == ("poll", q, 5) and ids[1] == ("post", post["id"], 3)
    assert all(i != small["id"] for _, i, _ in ids)
    assert r["items"][0]["results"] is None                                # chi non ha votato non vede il risultato
    # la domanda del giorno non si ripete
    r2 = people[0].get(f"/api/trending?where=city&city=Lucca&exclude={q}").json()
    assert [x["id"] for x in r2["items"]] == [post["id"]]
    # un'altra città non li vede
    assert people[0].get("/api/trending?where=city&city=Matera").json()["items"] == []
    assert people[0].get("/api/trending?where=city&city=NonEsiste").status_code == 422


def test_trending_only_last_week(user):
    author, *_ = user(city="Siena")
    people = [user()[0] for _ in range(3)]
    q = _poll(author, "Palio anche in autunno?", scope="local", city="Siena")
    for p in people:
        p.post(f"/api/questions/{q}/vote", json={"value": -1, "resident": False})
    assert [x["id"] for x in people[0].get("/api/trending?where=city&city=Siena").json()["items"]] == [q]
    with SessionLocal() as db:   # voti di due settimane fa: non è più "in evidenza"
        db.execute(update(Vote).where(Vote.question_id == q).values(created_at=datetime.now(timezone.utc) - timedelta(days=14)))
        db.commit()
    assert people[0].get("/api/trending?where=city&city=Siena").json()["items"] == []
