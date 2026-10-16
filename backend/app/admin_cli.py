"""Nomina (o toglie) un amministratore.

In locale, dalla cartella del progetto:
    backend\\.venv\\Scripts\\python tools\\make_admin.py tuo_nome_utente
In produzione su Fly.io:
    fly ssh console -C "python -m app.admin_cli tuo_nome_utente"
Per togliere il ruolo aggiungi --rimuovi.
"""
import argparse
import sys

from sqlalchemy import select

from .crypto import nick_index
from .db import SessionLocal
from .migrate import run_migrations
from .models import User


def _list_users(db) -> None:
    """Elenca i nomi utente (si leggono solo qui, con la chiave: nel database sono cifrati)."""
    users = db.scalars(select(User).where(User.is_banned.is_(False)).order_by(User.id)).all()
    if not users:
        print("Non c'è ancora nessun utente: registrati prima nell'app, poi rilancia il comando.")
        return
    print("Utenti registrati:")
    for u in users:
        print(f"  @{u.nickname}" + ("   (amministratore)" if u.is_admin else ""))
    print("Rilancia il comando scrivendo il tuo nome utente al posto di quello sbagliato.")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Nomina un amministratore di PULSE")
    ap.add_argument("nickname", nargs="?", help="il nome utente (senza @); senza nome mostra gli utenti registrati")
    ap.add_argument("--rimuovi", action="store_true", help="toglie il ruolo di amministratore")
    args = ap.parse_args(argv)
    run_migrations()  # il database potrebbe non essere ancora aggiornato
    with SessionLocal() as db:
        if not args.nickname:
            _list_users(db)
            return 0
        nick = args.nickname.strip().lstrip("@")
        user = db.scalar(select(User).where(User.nickname_key == nick_index(nick)))
        if not user:
            print(f"Nessun utente @{nick}.")
            _list_users(db)
            return 1
        user.is_admin = not args.rimuovi
        db.commit()
        if args.rimuovi:
            print(f"@{user.nickname} non è più amministratore.")
        else:
            print(f"@{user.nickname} ora è amministratore: ricarica l'app, in Profilo trovi «Moderazione».")
    return 0


if __name__ == "__main__":
    sys.exit(main())
