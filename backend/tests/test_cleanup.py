"""Strumento di pulizia dell'amministratore (tools/pulisci.py)."""
from app.cleanup_cli import main


def _setup(user):
    gigi, ng, *_ = user()
    other, no, *_ = user()
    post = gigi.post("/api/posts", data={"body": "eeeeeeeee"}).json()
    qid = gigi.post("/api/polls", data={"title": "yhr4rgggggggggggg?", "category": "Diritti"}).json()["id"]
    other.post(f"/api/questions/{qid}/vote", json={"value": 1})
    theirs = other.post("/api/polls", data={"title": "Un sondaggio di un altro?", "category": "Città"}).json()["id"]
    gigi.post(f"/api/questions/{theirs}/vote", json={"value": -1})
    other_post = other.post("/api/posts", data={"body": "post di un altro"}).json()
    gigi.post(f"/api/posts/{other_post['id']}/comments", data={"body": "commento di gigi"})
    return gigi, ng, other, post, qid, theirs, other_post


def test_list_and_summary_never_show_vote_values(user, capsys, monkeypatch):
    gigi, ng, *_ = _setup(user)
    assert main([]) == 0
    assert f"@{ng}" in capsys.readouterr().out
    monkeypatch.setattr("builtins.input", lambda _="": "0")      # menu: "0) Niente, esci"
    assert main([ng]) == 0
    out = capsys.readouterr().out
    assert "1 post · 1 commenti · 1 sondaggi · 1 voti dati" in out
    assert "yhr4rg" in out and "Nessuna modifica." in out
    assert "Contrario" not in out and "-1" not in out           # voto segreto anche per l'admin
    assert main(["nessuno_cosi"]) == 1


def test_wrong_confirmation_deletes_nothing(user, new_client, monkeypatch, capsys):
    gigi, ng, other, post, *_ = _setup(user)
    answers = iter(["1", "nome-sbagliato"])
    monkeypatch.setattr("builtins.input", lambda _="": next(answers))
    main([ng])
    assert "non ho cancellato niente" in capsys.readouterr().out
    assert new_client().get(f"/api/posts/{post['id']}").status_code == 200


def test_clean_content_keeps_account(user, new_client, capsys, monkeypatch):
    gigi, ng, other, post, qid, theirs, other_post = _setup(user)
    answers = iter(["1", ng])                                     # scelta 1 + conferma col nome
    monkeypatch.setattr("builtins.input", lambda _="": next(answers))
    assert main([ng]) == 0
    assert "tolti 1 post, 1 commenti, 1 sondaggi e 1 voti" in capsys.readouterr().out
    g = new_client()
    assert g.get(f"/api/posts/{post['id']}").status_code == 404
    assert g.get(f"/api/questions/{qid}").status_code == 404
    assert g.get(f"/api/users/{ng}").status_code == 200            # l'account resta
    assert g.get(f"/api/posts/{other_post['id']}").json()["comment_count"] == 0
    assert g.get(f"/api/questions/{theirs}").json()["participants"] == 0   # il suo voto è sparito
    assert gigi.get("/api/me").status_code == 200                  # può ancora entrare


def test_votes_only_and_delete_account(user, new_client, capsys):
    gigi, ng, other, post, qid, theirs, _ = _setup(user)
    assert main([ng, "--voti", "--si"]) == 0
    assert "tolti 1 voti" in capsys.readouterr().out
    assert new_client().get(f"/api/posts/{post['id']}").status_code == 200   # i post restano
    assert main([ng, "--account", "--si"]) == 0
    g = new_client()
    assert g.get(f"/api/users/{ng}").status_code == 404
    assert g.get(f"/api/posts/{post['id']}").status_code == 404
    assert g.get(f"/api/questions/{qid}").status_code == 404
    assert gigi.get("/api/me").status_code == 401
