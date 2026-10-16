"""Cambio password e nuovo codice di recupero dalle impostazioni."""


def test_change_password_keeps_this_session_and_logs_out_others(user, new_client):
    c, nick, pw, code = user()
    other = new_client()
    assert other.post("/api/auth/login", json={"nickname": nick, "password": pw}).status_code == 200
    assert c.post("/api/me/password", json={"current_password": "sbagliata-123", "new_password": "nuova-password-99"}).status_code == 403
    assert c.post("/api/me/password", json={"current_password": pw, "new_password": pw}).status_code == 422
    assert c.post("/api/me/password", json={"current_password": pw, "new_password": "corta"}).status_code == 422
    assert c.post("/api/me/password", json={"current_password": pw, "new_password": "nuova-password-99"}).status_code == 204
    assert c.get("/api/me").status_code == 200            # questo dispositivo resta dentro
    assert other.get("/api/me").status_code == 401        # gli altri devono rientrare
    fresh = new_client()
    assert fresh.post("/api/auth/login", json={"nickname": nick, "password": pw}).status_code == 401
    assert fresh.post("/api/auth/login", json={"nickname": nick, "password": "nuova-password-99"}).status_code == 200
    # il codice di recupero non cambia con la password
    assert new_client().post("/api/auth/recover", json={"nickname": nick, "recovery_code": code,
                                                         "new_password": "terza-password-77"}).status_code == 200


def test_new_recovery_code_replaces_the_old_one(user, new_client):
    c, nick, pw, old = user()
    assert c.post("/api/me/recovery-code", json={"password": "sbagliata-123"}).status_code == 403
    r = c.post("/api/me/recovery-code", json={"password": pw})
    assert r.status_code == 200
    new = r.json()["recovery_code"]
    assert new != old
    assert new_client().post("/api/auth/recover", json={"nickname": nick, "recovery_code": old,
                                                         "new_password": "altra-password-11"}).status_code == 401
    assert new_client().post("/api/auth/recover", json={"nickname": nick, "recovery_code": new,
                                                         "new_password": "altra-password-11"}).status_code == 200
