"""La prova che chiede Boss: nel database e nello storage non si leggono nomi, testi né foto."""
import io

import pytest
from PIL import Image as PILImage
from sqlalchemy import create_engine, text
from sqlalchemy.pool import NullPool

from app import crypto
from app.config import DATABASE_URL, MEDIA_DIR, engine_kwargs


def _jpeg() -> bytes:
    buf = io.BytesIO()
    PILImage.new("RGB", (300, 200), (10, 120, 200)).save(buf, "JPEG")
    return buf.getvalue()


def _raw_db_dump() -> str:
    """Tutto il contenuto testuale delle tabelle, come lo vedrebbe chi apre il database."""
    eng = create_engine(DATABASE_URL, poolclass=NullPool, **engine_kwargs(DATABASE_URL))
    out = []
    with eng.connect() as conn:
        for table in ("users", "posts", "comments", "images", "follows", "reports"):
            for row in conn.execute(text(f"select * from {table}")):
                out.append(" | ".join(str(v) for v in row))
    eng.dispose()
    return "\n".join(out)


def test_database_and_storage_contain_no_readable_personal_data(new_client):
    c = new_client()
    nick, name, bio, city = "MarioSegreto77", "Mario Rossi Segreto", "Bio molto riservata", "Bologna"
    r = c.post("/api/auth/register", json={"nickname": nick, "password": "password-lunga-1", "city": city, "consent": True})
    assert r.status_code == 201
    assert c.patch("/api/me/profile", json={"display_name": name, "bio": bio}).status_code == 200
    body = "Testo del post riservatissimo"
    p = c.post("/api/posts", data={"body": body}, files=[("files", ("a.jpg", _jpeg(), "image/jpeg"))]).json()
    c.post(f"/api/posts/{p['id']}/comments", data={"body": "Commento riservatissimo"})

    # 1) l'app li mostra correttamente agli utenti...
    assert c.get("/api/me").json()["nickname"] == nick
    assert c.get(f"/api/posts/{p['id']}").json()["body"] == body

    # 2) ...ma nel database non c'è traccia leggibile
    dump = _raw_db_dump().lower()
    for secret in (nick, name, bio, city, body, "commento riservatissimo"):
        assert secret.lower() not in dump, f"'{secret}' è leggibile nel database"
    assert "e1:" in dump  # i valori ci sono, ma cifrati

    # 3) nello storage le foto sono file cifrati, non immagini
    image_id = p["images"][0]["id"]
    raw = (MEDIA_DIR / f"img/{image_id}/lg.webp").read_bytes()
    assert raw.startswith(crypto.BLOB_MAGIC) and b"WEBP" not in raw[:64]
    with pytest.raises(Exception):
        PILImage.open(io.BytesIO(raw))
    # mentre l'app la consegna normalmente decifrata
    served = c.get(p["images"][0]["lg"]).content
    assert PILImage.open(io.BytesIO(served)).format == "WEBP"


def test_tampering_and_swapping_are_detected():
    token = crypto.encrypt_text("Mario", b"users.nickname")
    assert crypto.decrypt_text(token, b"users.nickname") == "Mario"
    with pytest.raises(crypto.DecryptionError):  # copiato in un'altra colonna: non si decifra
        crypto.decrypt_text(token, b"users.bio")
    broken = token[:-4] + ("AAAA" if not token.endswith("AAAA") else "BBBB")
    with pytest.raises(crypto.DecryptionError):  # modificato: non si decifra
        crypto.decrypt_text(broken, b"users.nickname")
    blob = crypto.encrypt_blob(b"foto", "abc/lg")
    with pytest.raises(crypto.DecryptionError):  # file di un'altra foto: non si decifra
        crypto.decrypt_blob(blob, "xyz/lg")
    # stesso testo → cifrature diverse (nessun modo di capire chi ha lo stesso nome)
    assert crypto.encrypt_text("Mario", b"x") != crypto.encrypt_text("Mario", b"x")
    # ma l'indice cieco è stabile e non rivela il valore
    assert crypto.nick_index("Mario") == crypto.nick_index(" mario ") and "mario" not in crypto.nick_index("Mario")


def test_comparing_encrypted_columns_fails_loudly():
    from sqlalchemy import select

    from app.models import User

    with pytest.raises(TypeError):
        select(User).where(User.nickname == "mario")
    with pytest.raises(TypeError):
        select(User).where(User.city.like("%Rom%"))
    select(User).where(User.display_name.is_(None))  # questo invece è lecito
