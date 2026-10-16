"""Profili privati ed elenchi follower/seguiti visibili solo al proprietario."""


def mutual(a, na, b, nb):
    a.post(f"/api/users/{nb}/follow")
    b.post(f"/api/me/requests/{na}/accept")
    b.post(f"/api/users/{na}/follow")
    a.post(f"/api/me/requests/{nb}/accept")


def test_private_profile_hides_posts_and_polls_until_mutual(user, new_client):
    owner, no, *_ = user(city="Milano")
    fan, nf, *_ = user()
    friend, nfr, *_ = user()
    r = owner.patch("/api/me/profile", json={"is_private": True, "approve_followers": False}).json()
    assert r["is_private"] is True and r["approve_followers"] is True  # privato = richieste sempre da approvare
    post = owner.post("/api/posts", data={"body": "Solo per gli amici", "city": "Milano"}).json()
    qid = owner.post("/api/polls", data={"title": "Pizza o sushi stasera?", "category": "Città",
                                         "scope": "local", "city": "Milano"}).json()["id"]

    guest = new_client()
    for c in (guest, fan):
        prof = c.get(f"/api/users/{no}").json()
        assert prof["is_private"] and prof["can_see"] is False and prof["top"] is None
        assert prof["name"] is None or isinstance(prof["name"], str)  # nome e foto restano visibili
        assert c.get(f"/api/users/{no}/posts").status_code == 403
        assert c.get(f"/api/posts/{post['id']}").status_code == 404
        assert c.get(f"/api/questions/{qid}").status_code == 404
        assert post["id"] not in [x["id"] for x in c.get("/api/posts").json()["items"]]
        assert qid not in [x["id"] for x in c.get("/api/polls?status=all").json()["items"]]
        assert qid not in [x["id"] for x in c.get(f"/api/polls?author={no}").json()["items"]]
    assert qid not in [x["id"] for x in guest.get("/api/public/questions?city=Milano").json()]
    assert guest.get(f"/api/public/questions/{qid}").status_code == 404
    assert fan.post(f"/api/questions/{qid}/vote", json={"value": 1, "resident": False}).status_code == 404

    # seguire da una parte sola non basta
    fan.post(f"/api/users/{no}/follow")
    owner.post(f"/api/me/requests/{nf}/accept")
    assert fan.get(f"/api/users/{no}").json()["can_see"] is False
    assert fan.get(f"/api/users/{no}/posts").status_code == 403

    # seguirsi a vicenda: si vede tutto
    mutual(owner, no, friend, nfr)
    prof = friend.get(f"/api/users/{no}").json()
    assert prof["can_see"] is True
    assert [x["id"] for x in friend.get(f"/api/users/{no}/posts").json()["items"]] == [post["id"]]
    assert friend.get(f"/api/questions/{qid}").status_code == 200
    assert friend.post(f"/api/questions/{qid}/vote", json={"value": 1, "resident": False}).status_code == 200
    assert post["id"] in [x["id"] for x in friend.get("/api/posts").json()["items"]]

    # l'autore vede sempre i propri contenuti
    assert owner.get(f"/api/users/{no}/posts").json()["items"]
    assert owner.get(f"/api/questions/{qid}").status_code == 200

    # tornando pubblico si vede di nuovo tutto
    owner.patch("/api/me/profile", json={"is_private": False})
    assert guest.get(f"/api/posts/{post['id']}").status_code == 200
    assert guest.get(f"/api/users/{no}").json()["can_see"] is True


def test_follower_lists_only_for_owner_with_search(user, new_client):
    owner, no, *_ = user()
    a, na, *_ = user()
    b, nb, *_ = user()
    a.patch("/api/me/profile", json={"display_name": "Gualtiero Pozzobon"})
    b.patch("/api/me/profile", json={"display_name": "Ermenegilda Scarpazza"})
    owner.patch("/api/me/profile", json={"approve_followers": False})
    a.post(f"/api/users/{no}/follow")
    b.post(f"/api/users/{no}/follow")
    owner.post(f"/api/users/{na}/follow")
    a.post(f"/api/me/requests/{no}/accept")

    # il proprietario vede i suoi elenchi e li può cercare
    assert {x["nickname"] for x in owner.get(f"/api/users/{no}/followers").json()["items"]} == {na, nb}
    assert [x["nickname"] for x in owner.get(f"/api/users/{no}/followers?q=gualt").json()["items"]] == [na]
    assert [x["nickname"] for x in owner.get(f"/api/users/{no}/followers?q=Scarpaz").json()["items"]] == [nb]
    assert owner.get(f"/api/users/{no}/followers?q=nessunotrovato").json()["items"] == []
    assert [x["nickname"] for x in owner.get(f"/api/users/{no}/following?q=pozzob").json()["items"]] == [na]

    # gli altri no, nemmeno se vi seguite a vicenda (vedono solo i numeri)
    for c in (a, b, new_client()):
        assert c.get(f"/api/users/{no}/followers").status_code == 403
        assert c.get(f"/api/users/{no}/following").status_code == 403
    prof = a.get(f"/api/users/{no}").json()
    assert prof["followers"] == 2 and prof["following"] == 1
