"""Chi può partecipare: nei contenuti di una città, "tutti" oppure "solo chi è di lì" (dichiarato una volta)."""


def _poll(c, **data):
    base = {"title": "Più bus la sera nel quartiere?", "category": "Trasporti", "scope": "local", "city": "Bari"}
    return c.post("/api/polls", data={**base, **data})


def test_restricted_poll_only_locals_vote_outsiders_see_results(user):
    author, *_ = user(city="Bari")
    local, *_ = user(city="Bari")
    outsider, *_ = user(city="Milano")
    newcomer, *_ = user()
    qid = _poll(author, audience="local").json()["id"]
    p = outsider.get(f"/api/questions/{qid}").json()
    assert p["audience"] == "local" and p["can_vote"] is False and p["results"] is not None   # vede i risultati
    assert outsider.post(f"/api/questions/{qid}/vote", json={"value": 1, "resident": False}).status_code == 403
    assert outsider.get(f"/api/questions/{qid}/results").status_code == 200
    assert local.get(f"/api/questions/{qid}").json()["can_vote"] is True
    assert local.post(f"/api/questions/{qid}/vote", json={"value": 1}).status_code == 200   # niente domande
    # chi non ha città dichiara "sono di Bari" una volta, poi vale per tutti i contenuti di Bari
    assert newcomer.post(f"/api/questions/{qid}/vote", json={"value": -1, "resident": True}).status_code == 200
    assert newcomer.get("/api/me").json()["places"] == ["Bari"]
    q2 = _poll(author, title="Una seconda domanda per Bari?", audience="local").json()["id"]
    assert newcomer.get(f"/api/questions/{q2}").json()["is_resident"] is True
    assert newcomer.post(f"/api/questions/{q2}/vote", json={"value": 1}).status_code == 200


def test_open_city_poll_still_counts_outsiders_apart(user):
    author, *_ = user(city="Bari")
    outsider, *_ = user(city="Milano")
    qid = _poll(author).json()["id"]
    p = outsider.get(f"/api/questions/{qid}").json()
    assert p["audience"] == "all" and p["can_vote"] is True and p["results"] is None
    assert outsider.post(f"/api/questions/{qid}/vote", json={"value": 1, "resident": False}).status_code == 200


def test_restricted_city_post_comments_and_support(user):
    author, *_ = user(city="Lecce")
    outsider, *_ = user(city="Roma")
    p = author.post("/api/posts", data={"body": "Assemblea di quartiere giovedì", "scope": "local",
                                        "city": "Lecce", "audience": "local"}).json()
    assert p["audience"] == "local"
    assert outsider.post(f"/api/posts/{p['id']}/comments", data={"body": "vengo anch'io"}).status_code == 403
    assert outsider.post(f"/api/posts/{p['id']}/support").status_code == 403
    assert outsider.get(f"/api/posts/{p['id']}").status_code == 200                       # leggere sì
    assert outsider.post("/api/me/places", json={"city": "Lecce"}).json()["places"] == ["Lecce"]
    assert outsider.post(f"/api/posts/{p['id']}/comments", data={"body": "ci lavoro, vengo"}).status_code == 201
    assert outsider.post(f"/api/posts/{p['id']}/support").json()["supports"] == 1
    # l'autore può sempre rispondere sotto il suo post
    assert author.post(f"/api/posts/{p['id']}/comments", data={"body": "grazie"}).status_code == 201
    # nazionale: la scelta non vale (partecipano tutti)
    n = author.post("/api/posts", data={"body": "Per tutti", "audience": "local"}).json()
    assert n["audience"] == "all"


def test_restricted_proposal_becomes_restricted_poll(user):
    author, *_ = user(city="Pisa")
    fans = [user(city="Pisa")[0] for _ in range(3)]
    p = author.post("/api/posts", data={"kind": "proposal", "headline": "Rastrelliere per bici in stazione",
                                        "scope": "local", "city": "Pisa", "audience": "local"}).json()
    for f in fans:
        last = f.post(f"/api/posts/{p['id']}/support").json()
    q = fans[0].get(f"/api/questions/{last['poll_id']}").json()
    assert q["audience"] == "local" and q["city"] == "Pisa"


def test_invalid_place_and_audience(user):
    c, *_ = user()
    assert c.post("/api/me/places", json={"city": "Atlantide"}).status_code == 422
    assert c.post("/api/posts", data={"body": "x", "audience": "boh"}).status_code == 422
    assert _poll(c, audience="boh").status_code == 422


def test_participating_elsewhere_never_changes_profile_city(user):
    """Chi è di Catania e partecipa a Milano resta di Catania: Milano si aggiunge, non sostituisce."""
    author, *_ = user(city="Milano")
    c, *_ = user(city="Catania")
    open_q = _poll(author, city="Milano").json()["id"]
    c.post(f"/api/questions/{open_q}/vote", json={"value": 1, "resident": False})   # vota da fuori
    me = c.get("/api/me").json()
    assert me["city"] == "Catania" and me["places"] == []                           # niente di salvato
    c.post(f"/api/questions/{open_q}/vote", json={"value": 1, "resident": True})    # "ci lavoro"
    me = c.get("/api/me").json()
    assert me["city"] == "Catania" and me["places"] == ["Milano"]                   # si aggiunge
