"""Pulizia da amministratore: togli i contenuti di un utente (post, commenti, sondaggi, voti) o l'intero account.

In locale, dalla cartella del progetto (anche con Pulse accesa):
    backend\\.venv\\Scripts\\python tools\\pulisci.py              elenco utenti con quanto hanno pubblicato
    backend\\.venv\\Scripts\\python tools\\pulisci.py mario       riepilogo di @mario e menu di pulizia
In produzione su Fly.io:
    fly ssh console -C "python -m app.cleanup_cli mario"

Voto segreto: lo strumento mostra QUANTI voti ha dato una persona, mai COSA ha votato.
Prima di cancellare chiede sempre di riscrivere il nome utente per conferma.
"""
import argparse
import sys

from sqlalchemy import delete, func, select, update
from sqlalchemy.orm import Session

from .crypto import nick_index
from .db import SessionLocal
from .media import delete_image_files
from .migrate import run_migrations
from . import votes as V
from .models import Comment, Image, Notification, Post, Question, Report, User
from .social import purge_user_content, remove_comment, remove_post


def _counts(db: Session, uid: str) -> dict[str, int]:
    return {
        "post": db.scalar(select(func.count()).select_from(Post).where(Post.author_id == uid)) or 0,
        "commenti": db.scalar(select(func.count()).select_from(Comment).where(Comment.author_id == uid)) or 0,
        "sondaggi": db.scalar(select(func.count()).select_from(Question).where(Question.author_id == uid)) or 0,
        "voti": db.scalar(select(func.count()).select_from(V.Vote).where(V.Vote.owner == V.owner_of(uid))) or 0,
    }


def _short(text: str | None, n: int = 60) -> str:
    t = " ".join((text or "").split())
    return t if len(t) <= n else t[: n - 1] + "…"


def remove_question(db: Session, q: Question) -> list[str]:
    """Elimina un sondaggio con voti, foto, segnalazioni e notifiche. Restituisce le foto da cancellare."""
    image_ids = list(db.scalars(select(Image.id).where(Image.question_id == q.id)))
    db.execute(delete(Notification).where(Notification.question_id == q.id))
    db.execute(delete(Report).where(Report.target_type == "question", Report.target_id == q.id))
    V.remove_question(db, q.id)
    db.execute(delete(Image).where(Image.question_id == q.id))
    db.delete(q)
    return image_ids


def clean_content(db: Session, user: User) -> dict[str, int]:
    """Toglie post, commenti, sondaggi e voti di un utente. L'account (nome, foto, follow) resta."""
    before = _counts(db, user.id)
    image_ids: list[str] = []
    for p in list(db.scalars(select(Post).where(Post.author_id == user.id))):
        image_ids += remove_post(db, p)
    db.flush()
    for c in list(db.scalars(select(Comment).where(Comment.author_id == user.id)
                             .order_by(Comment.parent_id.is_(None), Comment.id))):
        image_ids += remove_comment(db, c)
        db.flush()
    for q in list(db.scalars(select(Question).where(Question.author_id == user.id))):
        image_ids += remove_question(db, q)
    V.remove_user(db, user.id)
    db.commit()
    delete_image_files(image_ids)
    return before


def clean_votes(db: Session, user: User) -> int:
    n = V.remove_user(db, user.id)
    db.commit()
    return n


def delete_account(db: Session, user: User) -> None:
    """Elimina l'account con tutto quello che ha pubblicato (anche i sondaggi)."""
    image_ids = purge_user_content(db, user.id)  # post, commenti, foto profilo
    for q in list(db.scalars(select(Question).where(Question.author_id == user.id))):
        image_ids += remove_question(db, q)
    V.remove_user(db, user.id)
    db.execute(update(Question).where(Question.author_id == user.id).values(author_id=None))
    db.execute(delete(User).where(User.id == user.id))
    db.commit()
    delete_image_files(image_ids)


def _find(db: Session, nickname: str) -> User | None:
    return db.scalar(select(User).where(User.nickname_key == nick_index(nickname.lstrip("@"))))


def _list(db: Session) -> None:
    users = db.scalars(select(User).order_by(User.id)).all()
    if not users:
        print("Non c'è ancora nessun utente.")
        return
    print(f"{'utente':<24} {'post':>5} {'commenti':>9} {'sondaggi':>9} {'voti':>5}")
    for u in users:
        c = _counts(db, u.id)
        tag = " (admin)" if u.is_admin else (" (bannato)" if u.is_banned else "")
        print(f"{'@' + u.nickname + tag:<24} {c['post']:>5} {c['commenti']:>9} {c['sondaggi']:>9} {c['voti']:>5}")
    print("\nPer ripulire qualcuno: tools\\pulisci.py nome_utente")


def _summary(db: Session, u: User) -> None:
    c = _counts(db, u.id)
    print(f"\n@{u.nickname}" + (f" · {u.display_name}" if u.display_name else ""))
    print(f"  {c['post']} post · {c['commenti']} commenti · {c['sondaggi']} sondaggi · {c['voti']} voti dati")
    for p in db.scalars(select(Post).where(Post.author_id == u.id).order_by(Post.id.desc()).limit(10)):
        print(f"   post      #{p.id}: {_short(p.body) or '(solo foto)'}")
    for q in db.scalars(select(Question).where(Question.author_id == u.id).order_by(Question.id.desc()).limit(10)):
        print(f"   sondaggio #{q.id}: {_short(q.title)}")
    if c["voti"]:
        print("   (dei voti si mostra solo il numero: il voto è segreto, anche per l'amministratore)")


def _confirm(nick: str, what: str, yes: bool) -> bool:
    if yes:
        return True
    typed = input(f"Per confermare {what}, riscrivi il nome utente ({nick}): ").strip().lstrip("@")
    if typed.lower() != nick.lower():
        print("Nome diverso: non ho cancellato niente.")
        return False
    return True


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Ripulisci i contenuti di un utente di Pulse")
    ap.add_argument("nickname", nargs="?", help="nome utente (senza nome: elenco di tutti con i conteggi)")
    g = ap.add_mutually_exclusive_group()
    g.add_argument("--tutto", action="store_true", help="cancella post, commenti, sondaggi e voti (l'account resta)")
    g.add_argument("--voti", action="store_true", help="cancella solo i voti che ha dato")
    g.add_argument("--account", action="store_true", help="elimina l'account intero con tutto")
    ap.add_argument("--si", action="store_true", help="non chiedere conferma")
    args = ap.parse_args(argv)

    run_migrations()
    with SessionLocal() as db:
        if not args.nickname:
            _list(db)
            return 0
        u = _find(db, args.nickname)
        if not u:
            print(f"Nessun utente @{args.nickname.lstrip('@')}. Ecco chi c'è:\n")
            _list(db)
            return 1
        _summary(db, u)
        choice = "1" if args.tutto else "2" if args.voti else "3" if args.account else None
        if choice is None:
            print("\nCosa vuoi fare?")
            print("  1) Cancella post, commenti, sondaggi e voti (l'account resta)")
            print("  2) Cancella solo i voti che ha dato")
            print("  3) Elimina l'account intero con tutto")
            print("  0) Niente, esci")
            choice = input("Scelta: ").strip()
        if choice == "1" and _confirm(u.nickname, "la pulizia dei contenuti", args.si):
            c = clean_content(db, u)
            print(f"Fatto: tolti {c['post']} post, {c['commenti']} commenti, {c['sondaggi']} sondaggi e {c['voti']} voti di @{u.nickname}.")
        elif choice == "2" and _confirm(u.nickname, "la cancellazione dei voti", args.si):
            print(f"Fatto: tolti {clean_votes(db, u)} voti di @{u.nickname}.")
        elif choice == "3":
            if u.is_admin and not args.si:
                print("Attenzione: è un amministratore.")
            if _confirm(u.nickname, "l'eliminazione dell'account", args.si):
                nick = u.nickname
                delete_account(db, u)
                print(f"Fatto: account @{nick} eliminato con tutto ciò che aveva pubblicato.")
        elif choice not in ("1", "2", "3"):
            print("Nessuna modifica.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
