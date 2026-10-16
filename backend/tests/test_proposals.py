"""Proposte e "Anch'io": un tocco per persona, solo il numero, e la proposta che diventa sondaggio (traguardo 3 nei test)."""


def test_me_too_on_post_counts_people_once(user, new_client):
    a, na, *_ = user()
    b, *_ = user()
    c, *_ = user()
    post = a.post("/api/posts", data={"body": "La fermata del 64 è senza pensilina."}).json()
    assert post["kind"] == "post" and post["supports"] == 0 and post["goal"] is None
    assert a.post(f"/api/posts/{post['id']}/support").status_code == 422      # non il proprio
    r = b.post(f"/api/posts/{post['id']}/support").json()
    assert r["supports"] == 1 and r["supported"] is True
    assert b.post(f"/api/posts/{post['id']}/support").json()["supports"] == 1  # doppio tocco = 1
    c.post(f"/api/posts/{post['id']}/support")
    g = new_client().get(f"/api/posts/{post['id']}").json()
    assert g["supports"] == 2 and g["supported"] is False and g["people"] == 2   # persone coinvolte
    assert "supporters" not in g                                               # nessun elenco di nomi
    assert b.delete(f"/api/posts/{post['id']}/support").json()["supports"] == 1
    assert new_client().get(f"/api/users/{na}").json()["reached"] == 1


def test_proposal_validation(user):
    a, *_ = user()
    assert a.post("/api/posts", data={"kind": "proposal", "headline": "corta"}).status_code == 422
    assert a.post("/api/posts", data={"kind": "proposal", "headline": "Vedi www.esempio.it per tutto"}).status_code == 422
    assert a.post("/api/posts", data={"kind": "boh", "body": "ciao a tutti"}).status_code == 422
    ok = a.post("/api/posts", data={"kind": "proposal", "headline": "Una fontanella in piazza Garibaldi"})
    assert ok.status_code == 201 and ok.json()["headline"] == "Una fontanella in piazza Garibaldi"
    assert ok.json()["goal"] == 3 and ok.json()["body"] == ""


def test_proposal_becomes_city_poll_and_notifies(user, new_client):
    a, na, *_ = user(city="Bologna")
    fans = [user() for _ in range(3)]
    p = a.post("/api/posts", data={"kind": "proposal", "headline": "Lampioni nuovi al belvedere",
                                   "body": "La sera è completamente al buio.", "scope": "local",
                                   "city": "Bologna", "category": "Sicurezza"}).json()
    for c, *_ in fans[:2]:
        assert c.post(f"/api/posts/{p['id']}/support").json()["poll_id"] is None
    last = fans[2][0].post(f"/api/posts/{p['id']}/support").json()
    qid = last["poll_id"]
    assert qid and last["supports"] == 3
    q = new_client().get(f"/api/questions/{qid}").json()
    assert q["title"] == "Lampioni nuovi al belvedere" and q["scope"] == "local" and q["city"] == "Bologna"
    assert q["description"] == "La sera è completamente al buio." and q["category"] == "Sicurezza"
    assert q["author"]["nickname"] == na and q["ends_at"]
    # dopo: i sostegni sono chiusi, si va a votare
    late, *_ = user()
    assert late.post(f"/api/posts/{p['id']}/support").status_code == 409
    assert fans[0][0].delete(f"/api/posts/{p['id']}/support").status_code == 409
    # avvisi: all'autore e a chi ha sostenuto
    for c in (a, fans[0][0]):
        items = c.get("/api/notifications").json()["items"]
        n = next(x for x in items if x["kind"] == "proposal_poll")
        assert n["question_id"] == qid and n["text"] == "Lampioni nuovi al belvedere"
    # il sondaggio si vota come gli altri
    assert fans[0][0].post(f"/api/questions/{qid}/vote", json={"value": 1, "resident": True}).status_code == 200


def test_deleting_post_removes_supports(user, new_client):
    a, *_ = user()
    b, *_ = user()
    p = a.post("/api/posts", data={"body": "Post da cancellare"}).json()
    b.post(f"/api/posts/{p['id']}/support")
    assert a.delete(f"/api/posts/{p['id']}").status_code == 204
    assert new_client().get(f"/api/posts/{p['id']}").status_code == 404
