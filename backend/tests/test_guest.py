"""Chi non è registrato può guardare tutto, ma per partecipare deve registrarsi."""
import io

from PIL import Image as PILImage


def _jpeg() -> bytes:
    buf = io.BytesIO()
    PILImage.new("RGB", (200, 200), (50, 50, 200)).save(buf, "JPEG")
    return buf.getvalue()


def test_guest_can_browse_everything(user, new_client):
    a, na, *_ = user(city="Napoli")
    a.patch("/api/me/profile", json={"display_name": "Anna Esposito"})
    a.post("/api/me/avatar", files={"image": ("a.jpg", _jpeg(), "image/jpeg")})
    p = a.post("/api/posts", data={"body": "Il lungomare di Napoli", "scope": "local"},
               files=[("files", ("f.jpg", _jpeg(), "image/jpeg"))]).json()
    a.post(f"/api/posts/{p['id']}/comments", data={"body": "che bello"},
           files={"image": ("c.jpg", _jpeg(), "image/jpeg")})

    guest = new_client()
    feed = guest.get("/api/posts").json()["items"]
    item = next(x for x in feed if x["id"] == p["id"])
    assert item["author_name"] == "Anna Esposito" and item["mine"] is False and item["reported"] is False
    assert [x["id"] for x in guest.get("/api/posts?scope=city&city=Napoli").json()["items"]][0] == p["id"]
    assert guest.get(f"/api/posts/{p['id']}").status_code == 200
    thread = guest.get(f"/api/posts/{p['id']}/comments").json()["threads"][0]
    assert thread["body"] == "che bello" and thread["mine"] is False
    for url in (item["images"][0]["sm"], item["images"][0]["lg"], thread["image"]["lg"], item["author_avatar"]):
        assert guest.get(url).status_code == 200, url
    prof = guest.get(f"/api/users/{na}").json()
    assert prof["name"] == "Anna Esposito" and prof["relation"]["following"] == "none"
    assert guest.get(f"/api/users/{na}/posts").json()["items"]
    assert guest.get(f"/api/users/{na}/followers").status_code == 403  # elenchi: solo il proprietario
    qs = guest.get("/api/public/questions?city=Napoli").json()
    assert qs and any(q["city"] == "Napoli" for q in qs) and "pct" not in qs[0]   # niente risultati


def test_guest_must_register_to_participate(user, new_client):
    a, na, *_ = user()
    pid = a.post("/api/posts", data={"body": "Post"}).json()["id"]
    guest = new_client()
    assert guest.post("/api/posts", data={"body": "ciao"}).status_code == 401
    assert guest.post(f"/api/posts/{pid}/comments", data={"body": "ciao"}).status_code == 401
    assert guest.post(f"/api/users/{na}/follow").status_code == 401
    assert guest.post("/api/reports", json={"target_type": "post", "target_id": pid, "reason": "spam"}).status_code == 401
    assert guest.get("/api/questions/next").status_code == 401
    assert guest.post("/api/questions/1/vote", json={"value": 1}).status_code == 401
    assert guest.get("/api/posts?scope=following").status_code == 401
    assert guest.delete(f"/api/posts/{pid}").status_code == 401
    assert guest.get("/api/me").status_code == 401


def test_guest_never_sees_hidden_content(user, new_client):
    a, *_ = user()
    reporters = [user()[0] for _ in range(3)]
    p = a.post("/api/posts", data={"body": "Da nascondere"}, files=[("files", ("f.jpg", _jpeg(), "image/jpeg"))]).json()
    for r in reporters:
        r.post("/api/reports", json={"target_type": "post", "target_id": p["id"], "reason": "spam"})
    guest = new_client()
    assert p["id"] not in [x["id"] for x in guest.get("/api/posts").json()["items"]]
    assert guest.get(f"/api/posts/{p['id']}").status_code == 404
    assert guest.get(p["images"][0]["sm"]).status_code == 404


def test_banned_user_cookie_is_treated_as_guest(user, new_client):
    bad, nick, *_ = user()
    new_client().post("/api/admin/users/ban", headers={"X-Admin-Key": "test-admin-key"}, json={"nickname": nick})
    assert bad.get("/api/posts").status_code == 200          # può solo guardare, come un ospite
    assert bad.post("/api/posts", data={"body": "x"}).status_code == 401


def test_meta_has_source_link_and_terms(new_client):
    m = new_client().get("/api/meta").json()
    assert m["source_url"] is None            # finché PULSE_SOURCE_URL non è impostato: "In arrivo"
    assert m["terms_version"] and m["report_threshold"] >= 1
