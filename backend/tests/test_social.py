"""Piazza: post con foto, commenti a thread con foto, segnalazioni, eliminazioni, storage."""
import io

import pytest
from PIL import Image as PILImage

from app import main as main_module
from app import media
from app.config import MEDIA_DIR

ADMIN = {"X-Admin-Key": "test-admin-key"}


# --- utilità --------------------------------------------------------------------------------


def jpeg(w=400, h=200, color=(200, 40, 40), secret=True, orientation=None) -> bytes:
    img = PILImage.new("RGB", (w, h), color)
    exif = img.getexif()
    if secret:
        exif[0x010F] = "SecretPhone"            # marca del telefono
        gps = exif.get_ifd(0x8825)              # posizione GPS
        gps[1] = "N"
        gps[2] = (45.0, 30.0, 15.0)
        gps[3] = "E"
        gps[4] = (12.0, 20.0, 5.0)
    if orientation:
        exif[0x0112] = orientation
    buf = io.BytesIO()
    img.save(buf, "JPEG", exif=exif.tobytes(), quality=90)
    return buf.getvalue()


def png(w, h, mode="RGB") -> bytes:
    buf = io.BytesIO()
    PILImage.new(mode, (w, h)).save(buf, "PNG")
    return buf.getvalue()


def media_files() -> set[str]:
    return {p.relative_to(MEDIA_DIR).as_posix() for p in MEDIA_DIR.rglob("*.webp")} if MEDIA_DIR.exists() else set()


def post(client, body="Ciao Piazza", images=(), scope="national", category=""):
    files = [("files", (f"foto{i}.jpg", data, "image/jpeg")) for i, data in enumerate(images)]
    return client.post("/api/posts", data={"body": body, "scope": scope, "category": category},
                       files=files or None)


def comment(client, post_id, body="", reply_to=None, image=None):
    data = {"body": body}
    if reply_to is not None:
        data["reply_to"] = str(reply_to)
    files = {"image": ("c.jpg", image, "image/jpeg")} if image else None
    return client.post(f"/api/posts/{post_id}/comments", data=data, files=files)


# --- foto -----------------------------------------------------------------------------------


def test_photo_is_reencoded_without_metadata(user):
    raw = jpeg()
    assert b"SecretPhone" in raw and PILImage.open(io.BytesIO(raw)).getexif().get_ifd(0x8825)
    c, *_ = user()
    r = post(c, "Guardate questa piazza", [raw, jpeg(1200, 900, (0, 90, 200))])
    assert r.status_code == 201, r.text
    imgs = r.json()["images"]
    assert len(imgs) == 2
    for img in imgs:
        for variant, side in (("sm", 640), ("lg", 1600)):
            res = c.get(img[variant])
            assert res.status_code == 200 and res.headers["content-type"] == "image/webp"
            assert "immutable" in res.headers["cache-control"]
            out = PILImage.open(io.BytesIO(res.content))
            assert out.format == "WEBP" and max(out.size) <= side
            assert not out.getexif()                            # nessun metadato
            assert b"SecretPhone" not in res.content and b"Exif" not in res.content


def test_photo_orientation_is_applied(user):
    c, *_ = user()
    r = post(c, "", [jpeg(400, 200, secret=False, orientation=6)])  # telefono girato
    img = r.json()["images"][0]
    assert (img["w"], img["h"]) == (200, 400)


def test_invalid_files_are_rejected_and_nothing_is_saved(user):
    c, *_ = user()
    before = media_files()
    fake = post(c, "", [b"questo non e' un jpeg"])
    assert fake.status_code == 422 and "immagine valida" in fake.json()["detail"]
    gif = io.BytesIO()
    PILImage.new("RGB", (10, 10)).save(gif, "GIF")
    r = post(c, "", [jpeg(), gif.getvalue()])  # la prima è buona, la seconda no: non si salva nulla
    assert r.status_code == 422 and r.json()["detail"].startswith("Foto 2:")
    assert post(c, "", [jpeg()] * 5).status_code == 422          # massimo 4
    assert post(c, "   ").status_code == 422                       # post vuoto
    assert post(c, "x" * 2001).status_code == 422
    assert media_files() == before


def test_decompression_bomb_is_rejected(user):
    c, *_ = user()
    r = post(c, "", [png(9000, 5000, mode="1")])  # 45 milioni di pixel in pochi KB
    assert r.status_code == 422 and "grande" in r.json()["detail"]


def test_upload_size_limit(user, monkeypatch):
    c, *_ = user()
    monkeypatch.setattr(main_module, "MAX_REQUEST_BYTES", 1000)
    r = post(c, "", [jpeg(800, 800)])
    assert r.status_code == 413


def test_media_visible_to_guests_only_if_content_visible(user, new_client):
    c, *_ = user()
    url = post(c, "", [jpeg()]).json()["images"][0]["sm"]
    assert new_client().get(url).status_code == 200  # gli ospiti vedono le foto dei post visibili
    assert c.get("/api/media/" + "0" * 32 + "/sm").status_code == 404
    assert c.get(url.replace("/sm", "/xl")).status_code == 422


# --- feed -----------------------------------------------------------------------------------


def test_feed_scopes_and_order(user):
    roma, *_ = user(city="Roma")
    milano, *_ = user(city="Milano")
    roma2, *_ = user(city="Roma")
    nat = post(roma, "Post nazionale").json()["id"]
    loc = post(roma, "Solo per Roma", scope="local").json()["id"]
    ids_roma2 = [p["id"] for p in roma2.get("/api/posts").json()["items"]]
    assert ids_roma2.index(loc) < ids_roma2.index(nat)  # più recenti prima
    assert loc in [p["id"] for p in milano.get("/api/posts").json()["items"]]   # "Tutti": anche le altre città
    city = roma2.get("/api/posts?scope=city").json()["items"]                    # senza città: la propria
    assert city and all(p["city"] == "Roma" for p in city)
    mil = milano.get("/api/posts?scope=city").json()["items"]
    assert loc not in [p["id"] for p in mil]
    explore = milano.get("/api/posts?scope=city&city=Roma").json()["items"]      # esplorare un'altra città
    assert loc in [p["id"] for p in explore] and nat not in [p["id"] for p in explore]
    assert milano.get("/api/posts?scope=city&city=Atlantide").status_code == 422
    noc, *_ = user()
    assert post(noc, "x", scope="local").status_code == 422     # serve la città


def test_feed_pagination(user):
    c, *_ = user()
    for i in range(5):
        assert post(c, f"post {i}").status_code == 201
    page1 = c.get("/api/posts?limit_n=2").json()
    page2 = c.get(f"/api/posts?limit_n=2&before={page1['next']}").json()
    assert len(page1["items"]) == 2 and page1["next"]
    assert max(p["id"] for p in page2["items"]) < min(p["id"] for p in page1["items"])


def test_daily_post_limit(user):
    c, *_ = user()
    for i in range(5):
        assert post(c, f"post {i}").status_code == 201
    assert post(c, "sesto").status_code == 429


# --- commenti -------------------------------------------------------------------------------


def test_comment_threads_are_ordered(user):
    a, *_ = user()
    b, nb, *_ = user()
    c, nc, *_ = user()
    d, *_ = user()
    pid = post(a, "Discutiamone").json()["id"]
    c1 = comment(b, pid, "primo commento").json()
    r1 = comment(c, pid, "rispondo a B", reply_to=c1["id"]).json()
    r2 = comment(b, pid, "rispondo a C dentro lo stesso thread", reply_to=r1["id"]).json()
    c2 = comment(d, pid, "secondo commento").json()
    assert r1["parent_id"] == c1["id"] and r2["parent_id"] == c1["id"]  # resta nello stesso thread
    assert r2["reply_to"] == nc
    data = a.get(f"/api/posts/{pid}/comments").json()
    assert [t["id"] for t in data["threads"]] == [c1["id"], c2["id"]]
    assert [r["id"] for r in data["threads"][0]["replies"]] == [r1["id"], r2["id"]]
    assert data["threads"][0]["author"] == nb and data["total"] == 4
    feed = a.get(f"/api/posts/{pid}").json()
    assert feed["comment_count"] == 4


def test_comment_with_photo(user):
    a, *_ = user()
    b, *_ = user()
    pid = post(a, "Foto del quartiere").json()["id"]
    c1 = comment(b, pid, image=jpeg()).json()        # solo foto, senza testo
    assert c1["image"] and c1["body"] == ""
    reply = comment(a, pid, "bella!", reply_to=c1["id"], image=jpeg(300, 300)).json()
    assert reply["image"]["sm"].startswith("/api/media/")
    assert b.get(reply["image"]["lg"]).status_code == 200
    assert comment(b, pid, "").status_code == 422
    assert comment(b, pid, "x", reply_to=999999).status_code == 404


def test_delete_comment_tombstone_and_files(user):
    a, *_ = user()
    b, *_ = user()
    pid = post(a, "Post").json()["id"]
    top = comment(b, pid, "con foto", image=jpeg()).json()
    comment(a, pid, "risposta", reply_to=top["id"])
    alone = comment(b, pid, "da solo", image=jpeg()).json()
    top_img, alone_img = top["image"]["id"], alone["image"]["id"]
    assert {f"img/{top_img}/sm.webp", f"img/{alone_img}/lg.webp"} <= media_files()
    assert a.delete(f"/api/comments/{top['id']}").status_code == 404   # non è suo
    assert b.delete(f"/api/comments/{top['id']}").status_code == 204
    assert b.delete(f"/api/comments/{alone['id']}").status_code == 204
    threads = a.get(f"/api/posts/{pid}/comments").json()["threads"]
    assert len(threads) == 1                                            # "da solo" sparito del tutto
    t = threads[0]
    assert t["status"] == "deleted" and t["author"] is None and t["body"] == "" and t["image"] is None
    assert len(t["replies"]) == 1                                        # la risposta resta
    assert not any(top_img in f or alone_img in f for f in media_files())


def test_delete_post_removes_all_photos(user):
    a, *_ = user()
    b, *_ = user()
    p = post(a, "Post con foto", [jpeg(), jpeg()]).json()
    c1 = comment(b, p["id"], "", image=jpeg()).json()
    ids = [i["id"] for i in p["images"]] + [c1["image"]["id"]]
    assert b.delete(f"/api/posts/{p['id']}").status_code == 404
    assert a.delete(f"/api/posts/{p['id']}").status_code == 204
    assert a.get(f"/api/posts/{p['id']}").status_code == 404
    assert not any(i in f for i in ids for f in media_files())


# --- segnalazioni e moderazione ----------------------------------------------------------------


def test_reports_hide_content_and_admin_restores(user, new_client):
    a, *_ = user()
    reporters = [user()[0] for _ in range(3)]
    viewer, *_ = user()
    p = post(a, "Contenuto discutibile", [jpeg()]).json()
    rep = {"target_type": "post", "target_id": p["id"], "reason": "spam"}
    assert a.post("/api/reports", json=rep).status_code == 422             # non il proprio
    assert reporters[0].post("/api/reports", json=rep).json() == {"hidden": False}
    assert reporters[0].post("/api/reports", json=rep).status_code == 409  # una volta sola
    assert reporters[0].get(f"/api/posts/{p['id']}").json()["reported"] is True
    reporters[1].post("/api/reports", json=rep)
    assert reporters[2].post("/api/reports", json=rep).json() == {"hidden": True}
    assert p["id"] not in [x["id"] for x in viewer.get("/api/posts").json()["items"]]
    assert viewer.get(p["images"][0]["sm"]).status_code == 404               # foto non più visibile
    mine = a.get(f"/api/posts/{p['id']}").json()
    assert mine["status"] == "hidden"                                        # l'autore lo vede "in revisione"
    queue = new_client().get("/api/admin/reports", headers=ADMIN).json()
    item = next(i for i in queue if i["type"] == "post" and i["id"] == p["id"])
    assert item["reports"] == 3 and item["reasons"] == {"spam": 3} and item["images"]
    assert new_client().get(f"/api/admin/media/{item['images'][0]}/sm", headers=ADMIN).status_code == 200
    assert new_client().post(f"/api/admin/content/post/{p['id']}/restore", headers=ADMIN).status_code == 200
    assert p["id"] in [x["id"] for x in viewer.get("/api/posts").json()["items"]]
    assert reporters[0].post("/api/reports", json={**rep, "reason": "boh"}).status_code == 422


def test_admin_remove_comment_and_ban_with_purge(user, new_client):
    a, *_ = user()
    bad, bad_nick, *_ = user()
    pid = post(a, "Post").json()["id"]
    cid = comment(bad, pid, "insulto", image=jpeg()).json()["id"]
    post(bad, "altro post del troll", [jpeg()])
    assert new_client().post(f"/api/admin/content/comment/{cid}/remove", headers=ADMIN).status_code == 200
    assert a.get(f"/api/posts/{pid}/comments").json()["threads"] == []
    r = new_client().post("/api/admin/users/ban", headers=ADMIN, json={"nickname": bad_nick, "purge": True})
    assert r.status_code == 200
    assert bad.get("/api/me").status_code == 401                              # bannato: fuori
    assert all(x["author"] != bad_nick for x in a.get("/api/posts?limit_n=30").json()["items"])
    assert new_client().post("/api/admin/users/ban", json={"nickname": bad_nick}).status_code == 403


def test_account_deletion_purges_social_content(user):
    owner, *_ = user()
    x, _nick, pw, _ = user()
    p_other = post(owner, "Post di un altro").json()["id"]
    mine = post(x, "Il mio post", [jpeg()]).json()
    top = comment(x, p_other, "mio commento con foto", image=jpeg()).json()
    comment(owner, p_other, "risposta dell'altro", reply_to=top["id"])
    ids = [mine["images"][0]["id"], top["image"]["id"]]
    assert x.post("/api/me/delete", json={"password": pw}).status_code == 204
    assert owner.get(f"/api/posts/{mine['id']}").status_code == 404
    t = owner.get(f"/api/posts/{p_other}/comments").json()["threads"][0]
    assert t["status"] == "deleted" and t["author"] is None and len(t["replies"]) == 1
    assert not any(i in f for i in ids for f in media_files())


# --- storage S3 (Tigris) ----------------------------------------------------------------------


def test_s3_storage_roundtrip(user, monkeypatch):
    moto = pytest.importorskip("moto")
    monkeypatch.setenv("AWS_ACCESS_KEY_ID", "test")
    monkeypatch.setenv("AWS_SECRET_ACCESS_KEY", "test")
    monkeypatch.delenv("AWS_ENDPOINT_URL_S3", raising=False)
    with moto.mock_aws():
        import boto3

        boto3.client("s3", region_name="us-east-1").create_bucket(Bucket="pulse-test")
        s3 = media.S3Storage("pulse-test", None, "us-east-1")
        previous = media.get_storage()
        media.set_storage(s3)
        try:
            c, *_ = user()
            p = post(c, "su S3", [jpeg()]).json()
            img = p["images"][0]
            assert c.get(img["lg"]).status_code == 200
            keys = {o["Key"] for o in s3.client.list_objects_v2(Bucket="pulse-test")["Contents"]}
            assert keys == {f"img/{img['id']}/sm.webp", f"img/{img['id']}/lg.webp"}
            assert c.delete(f"/api/posts/{p['id']}").status_code == 204
            assert s3.client.list_objects_v2(Bucket="pulse-test").get("KeyCount") == 0
        finally:
            media.set_storage(previous)
