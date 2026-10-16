"""In evidenza: i post, le proposte e i sondaggi che hanno coinvolto più persone negli ultimi 7 giorni.

Si contano PERSONE diverse (chi ha votato, commentato o sostenuto), come nelle "persone coinvolte" del profilo:
chi commenta dieci volte conta 1, i propri voti/commenti e gli account bannati non contano.
Uguale per tutti (non personalizzato), per tutta Italia oppure per una città.
"""
import os
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .crypto import vote_owner
from .db import get_db
from .deps import viewer
from .models import Comment, Post, PostSupport, Question, User, Vote
from .places import is_city
from .polls import questions_out
from .privacy import author_visible
from .social import posts_out

router = APIRouter()

DAYS = 7
LIMIT = 3
MIN_PEOPLE = int(os.getenv("PULSE_TRENDING_MIN", "3"))  # sotto questa soglia non è "in evidenza"


@router.get("/api/trending")
def trending(where: Literal["italy", "city"] = "italy", city: str | None = None, exclude: int | None = None,
             user: User | None = Depends(viewer), db: Session = Depends(get_db)):
    if where == "city" and not is_city(city):
        raise HTTPException(422, "Città non valida.")
    since = datetime.now(timezone.utc) - timedelta(days=DAYS)
    banned = set(db.scalars(select(User.id).where(User.is_banned.is_(True))))
    banned_h = {vote_owner(b) for b in banned}

    def scoped(q, model):
        q = q.where(author_visible(model.author_id, user))
        return q.where(model.scope == "local", model.city == city) if where == "city" else q

    # post e proposte: chi ha commentato o sostenuto (non l'autore)
    post_people: dict[int, set] = defaultdict(set)
    authors: dict[int, str | None] = {}
    for model, col_uid, col_time in ((Comment, Comment.author_id, Comment.created_at),
                                     (PostSupport, PostSupport.user_id, PostSupport.created_at)):
        q = (select(Post.id, Post.author_id, col_uid).select_from(model).join(Post, Post.id == model.post_id)
             .where(Post.status == "visible", col_time >= since, col_uid.is_not(None)))
        if model is Comment:
            q = q.where(Comment.status == "visible")
        for pid, author, uid in db.execute(scoped(q, Post)):
            authors[pid] = author
            if uid != author and uid not in banned:
                post_people[pid].add(uid)

    # sondaggi: chi ha votato (per impronta: si sa quanti, non chi)
    poll_people: dict[int, set] = defaultdict(set)
    q = (select(Question.id, Question.author_id, Vote.owner).select_from(Vote).join(Question, Question.id == Vote.question_id)
         .where(Question.status == "approved", Vote.created_at >= since))
    for qid, author, owner in db.execute(scoped(q, Question)):
        if qid == exclude:
            continue  # è già la domanda del giorno
        if owner not in banned_h and (author is None or owner != vote_owner(author)):
            poll_people[qid].add(owner)

    ranked = sorted(
        [("post", pid, len(s)) for pid, s in post_people.items()] +
        [("poll", qid, len(s)) for qid, s in poll_people.items()],
        key=lambda x: (-x[2], -x[1]))
    top = [x for x in ranked if x[2] >= MIN_PEOPLE][:LIMIT]

    posts = {p["id"]: p for p in posts_out(db, list(db.scalars(select(Post).where(
        Post.id.in_([i for t, i, _ in top if t == "post"])))), user)} if any(t == "post" for t, _, _ in top) else {}
    polls = {p["id"]: p for p in questions_out(db, list(db.scalars(select(Question).where(
        Question.id.in_([i for t, i, _ in top if t == "poll"])))), user)} if any(t == "poll" for t, _, _ in top) else {}
    items = []
    for t, i, n in top:
        item = posts.get(i) if t == "post" else polls.get(i)
        if item:
            items.append({**item, "type": t, "week_people": n})
    return {"where": where, "city": city if where == "city" else None, "days": DAYS, "items": items}
