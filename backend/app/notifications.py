"""Notifiche: chi ti segue, chi ti chiede di seguirti, chi commenta o risponde, sondaggi conclusi.

Nel database una notifica è solo "chi, cosa, dove": nessun testo. L'anteprima (un pezzo del commento,
il titolo del sondaggio) si costruisce al momento della lettura, dal contenuto originale cifrato.
"""
import threading
import time
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import delete, func, insert, select, update
from sqlalchemy.orm import Session

from .db import get_db
from .deps import current_user
from . import votes as V
from .models import Comment, Follow, Notification, Post, Question, User
from .people import user_cards
from .polls import secret_pct

router = APIRouter()

PAGE = 40
KEEP = 200  # notifiche conservate per persona: le più vecchie si cancellano da sole
SNIPPET = 90


def notify(db: Session, user_id: str | None, actor_id: str | None, kind: str, *,
           post_id: int | None = None, comment_id: int | None = None, question_id: int | None = None) -> None:
    """Aggiunge una notifica (dentro la transazione di chi chiama). Mai a se stessi."""
    if not user_id or user_id == actor_id:
        return
    db.add(Notification(user_id=user_id, actor_id=actor_id, kind=kind, post_id=post_id,
                        comment_id=comment_id, question_id=question_id))


def forget_follow(db: Session, follower_id: str, followee_id: str) -> None:
    """Toglie le notifiche di follow superate (richiesta annullata, rifiutata o accettata, unfollow)."""
    db.execute(delete(Notification).where(
        Notification.user_id == followee_id, Notification.actor_id == follower_id,
        Notification.kind.in_(("follow", "follow_request"))))


# --------------------------------------------------------------------------------------------
# Sondaggi conclusi: niente processi in background, si controlla quando qualcuno chiede le notifiche
# --------------------------------------------------------------------------------------------

_sweep_lock = threading.Lock()
_last_sweep = 0.0


def sweep_ended_polls(db: Session, force: bool = False) -> None:
    global _last_sweep
    now_t = time.monotonic()
    if not force and now_t - _last_sweep < 30:
        return
    if not _sweep_lock.acquire(blocking=False):
        return
    try:
        _last_sweep = now_t
        now = datetime.now(timezone.utc)
        ended = list(db.scalars(select(Question).where(
            Question.ends_at.is_not(None), Question.ends_at <= now,
            Question.ended_notified.is_(False)).limit(50)))
        for q in ended:
            # segna prima il sondaggio: se due processi arrivano insieme, notifica uno solo
            done = db.execute(update(Question).where(Question.id == q.id, Question.ended_notified.is_(False))
                              .values(ended_notified=True)).rowcount
            if not done or q.status != "approved":
                continue
            voters = V.voters(db, q.id)  # decifrati solo qui, per l'avviso
            if q.author_id:
                voters.add(q.author_id)
            if voters:  # solo account ancora esistenti
                voters = set(db.scalars(select(User.id).where(User.id.in_(voters))))
            if voters:
                db.execute(insert(Notification), [
                    {"user_id": uid, "actor_id": None, "kind": "poll_ended", "question_id": q.id,
                     "read": False, "created_at": now}
                    for uid in voters
                ])
        db.commit()
    finally:
        _sweep_lock.release()


# --------------------------------------------------------------------------------------------
# API
# --------------------------------------------------------------------------------------------


def _iso(dt: datetime) -> str:
    return (dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)).isoformat()


def _snip(text: str | None) -> str:
    text = " ".join((text or "").split())
    return text if len(text) <= SNIPPET else text[: SNIPPET - 1].rstrip() + "…"


def unread_count(db: Session, user: User) -> int:
    return db.scalar(select(func.count()).select_from(Notification).join(
        User, User.id == Notification.actor_id, isouter=True).where(
        Notification.user_id == user.id, Notification.read.is_(False),
        Notification.kind != "follow_request",  # le richieste si contano a parte (pending_requests)
        (Notification.actor_id.is_(None)) | (User.is_banned.is_(False)))) or 0


@router.get("/api/notifications/unread")
def unread(user: User = Depends(current_user), db: Session = Depends(get_db)):
    sweep_ended_polls(db)
    pending = db.scalar(select(func.count()).select_from(Follow).where(
        Follow.followee_id == user.id, Follow.status == "pending")) or 0
    return {"count": unread_count(db, user), "pending_requests": pending}


@router.get("/api/notifications")
def list_notifications(before: int | None = None, user: User = Depends(current_user),
                       db: Session = Depends(get_db)):
    sweep_ended_polls(db)
    q = select(Notification).where(Notification.user_id == user.id)
    if before:
        q = q.where(Notification.id < before)
    rows = list(db.scalars(q.order_by(Notification.id.desc()).limit(PAGE + 1)))
    has_more = len(rows) > PAGE
    rows = rows[:PAGE]

    people = user_cards(db, [n.actor_id for n in rows])
    banned = set(db.scalars(select(User.id).where(User.id.in_({n.actor_id for n in rows if n.actor_id}),
                                                   User.is_banned.is_(True))))
    comments = {c.id: c for c in db.scalars(select(Comment).where(
        Comment.id.in_({n.comment_id for n in rows if n.comment_id})))}
    posts = {p.id: p for p in db.scalars(select(Post).where(Post.id.in_({n.post_id for n in rows if n.post_id})))}
    questions = {x.id: x for x in db.scalars(select(Question).where(
        Question.id.in_({n.question_id for n in rows if n.question_id})))}
    tallies = V.tallies(db, list(questions))
    following = set(db.scalars(select(Follow.followee_id).where(
        Follow.follower_id == user.id, Follow.followee_id.in_({n.actor_id for n in rows if n.actor_id}))))

    items = []
    for n in rows:
        if n.actor_id in banned:
            continue
        item = {"id": n.id, "kind": n.kind, "read": n.read, "created_at": _iso(n.created_at),
                "actor": people.get(n.actor_id) if n.actor_id else None,
                "post_id": n.post_id, "comment_id": n.comment_id, "question_id": n.question_id, "text": None}
        if n.kind in ("comment", "reply"):
            c = comments.get(n.comment_id)
            if c is None or c.status != "visible":
                continue
            item["text"] = _snip(c.body) or "📷 Foto"
        elif n.kind == "poll_ended":
            x = questions.get(n.question_id)
            if x is None or x.status != "approved":
                continue
            t = tallies.get(x.id, {})
            item["text"] = x.title
            item["poll"] = {"total": sum(t.values()), "pct": secret_pct(t),
                            "mine": x.author_id == user.id}
        elif n.kind == "proposal_poll":  # una proposta (tua o sostenuta da te) è diventata un sondaggio
            x = questions.get(n.question_id)
            if x is None or x.status != "approved":
                continue
            item["text"] = x.title
            item["mine"] = x.author_id == user.id
        if n.kind in ("follow", "follow_request", "follow_accepted"):
            item["following_back"] = n.actor_id in following
        if n.post_id and n.post_id in posts:
            item["post_text"] = _snip(posts[n.post_id].body)
        items.append(item)
    return {"items": items, "next": rows[-1].id if has_more and rows else None}


@router.post("/api/notifications/read", status_code=204)
def mark_read(user: User = Depends(current_user), db: Session = Depends(get_db)):
    db.execute(update(Notification).where(Notification.user_id == user.id, Notification.read.is_(False))
               .values(read=True))
    # pulizia: tiene solo le ultime KEEP notifiche
    old = select(Notification.id).where(Notification.user_id == user.id).order_by(
        Notification.id.desc()).offset(KEEP).limit(1)
    cutoff = db.scalar(old)
    if cutoff:
        db.execute(delete(Notification).where(Notification.user_id == user.id, Notification.id <= cutoff))
    db.commit()
