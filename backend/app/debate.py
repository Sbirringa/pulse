"""Le ragioni sotto i sondaggi (perché sì / perché no) e la domanda del giorno.

Ragioni: senza nome visibile (chi scrive non rivela come vota), testo cifrato, una per lato per persona,
ordinate per "Utile". Si segnalano e si moderano come post e commenti.
Domanda del giorno: un sondaggio aperto a cui non hai ancora risposto, prima della tua città, poi d'Italia.
"""
import re
from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import delete, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from . import votes as V
from .crypto import city_index
from .db import get_db
from .deps import current_user, user_limit, viewer
from .local import is_local, local_idx
from .models import Argument, ArgumentVote, Question, Report, User
from .moderation import contains_blocked
from .polls import is_ended, questions_out
from .privacy import author_visible, can_see

router = APIRouter()

ARG_MIN, ARG_MAX = 10, 200
_LINK = re.compile(r"https?://|www\.", re.IGNORECASE)
SIDES = {"yes": 1, "no": -1}


def _open_question(db: Session, qid: int, user: User | None) -> Question:
    q = db.get(Question, qid)
    if not q or q.status != "approved" or not can_see(db, user, q.author_id):
        raise HTTPException(404, "Sondaggio non trovato.")
    return q


def _visible_args(user: User | None):
    cond = Argument.status == "visible"
    return or_(cond, Argument.author_id == user.id) if user else cond


def summaries(db: Session, ids: list[int], user: User | None) -> dict[int, dict]:
    """Per le card: quante ragioni per lato e la più utile di ciascun lato."""
    out: dict[int, dict] = {qid: {"yes": 0, "no": 0, "top_yes": None, "top_no": None} for qid in ids}
    if not ids:
        return out
    rows = list(db.scalars(select(Argument).where(Argument.question_id.in_(ids), _visible_args(user))))
    useful = _useful(db, [a.id for a in rows])
    mine_votes = _my_votes(db, [a.id for a in rows], user)
    best: dict[tuple[int, int], Argument] = {}
    for a in rows:
        key = "yes" if a.side == 1 else "no"
        out[a.question_id][key] += 1
        cur = best.get((a.question_id, a.side))
        if cur is None or (useful.get(a.id, 0), -a.id) > (useful.get(cur.id, 0), -cur.id):
            best[(a.question_id, a.side)] = a
    for (qid, side), a in best.items():
        out[qid]["top_yes" if side == 1 else "top_no"] = _out(a, useful, mine_votes, user)
    return out


def _useful(db: Session, ids: list[int]) -> dict[int, int]:
    if not ids:
        return {}
    return dict(db.execute(select(ArgumentVote.argument_id, func.count()).join(User, User.id == ArgumentVote.user_id)
                           .where(ArgumentVote.argument_id.in_(ids), User.is_banned.is_(False))
                           .group_by(ArgumentVote.argument_id)).all())


def _my_votes(db: Session, ids: list[int], user: User | None) -> set[int]:
    if not ids or user is None:
        return set()
    return set(db.scalars(select(ArgumentVote.argument_id).where(
        ArgumentVote.argument_id.in_(ids), ArgumentVote.user_id == user.id)))


def _out(a: Argument, useful: dict[int, int], mine_votes: set[int], user: User | None) -> dict:
    return {"id": a.id, "side": "yes" if a.side == 1 else "no", "body": a.body, "useful": useful.get(a.id, 0),
            "voted": a.id in mine_votes, "mine": user is not None and a.author_id == user.id,
            "hidden": a.status != "visible"}


@router.get("/api/questions/{qid}/arguments")
def list_arguments(qid: int, user: User | None = Depends(viewer), db: Session = Depends(get_db)):
    q = _open_question(db, qid, user)
    rows = list(db.scalars(select(Argument).where(Argument.question_id == q.id, _visible_args(user))))
    useful = _useful(db, [a.id for a in rows])
    mine_votes = _my_votes(db, [a.id for a in rows], user)
    items = sorted((_out(a, useful, mine_votes, user) for a in rows), key=lambda x: (-x["useful"], x["id"]))
    return {"yes": [x for x in items if x["side"] == "yes"], "no": [x for x in items if x["side"] == "no"]}


class ArgumentIn(BaseModel):
    side: Literal["yes", "no"]
    body: str


@router.post("/api/questions/{qid}/arguments", status_code=201)
def add_argument(qid: int, data: ArgumentIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    q = _open_question(db, qid, user)
    if is_ended(q):
        raise HTTPException(409, "Il sondaggio è concluso: non si aggiungono più ragioni.")
    if (q.scope == "local" and q.audience == "local" and q.author_id != user.id
            and not is_local(db, user, q.city)):
        raise HTTPException(403, f"Possono partecipare solo le persone di {q.city}.")
    text = " ".join(data.body.split())
    if not (ARG_MIN <= len(text) <= ARG_MAX):
        raise HTTPException(422, f"Scrivi la ragione in {ARG_MIN}-{ARG_MAX} caratteri.")
    if _LINK.search(text):
        raise HTTPException(422, "Non inserire link nelle ragioni.")
    if contains_blocked(text):
        raise HTTPException(422, "La ragione contiene parole non ammesse.")
    user_limit(f"argument:{user.id}", 10, 600, "Stai scrivendo troppo velocemente. Riprova tra poco.")
    a = Argument(question_id=q.id, author_id=user.id, side=SIDES[data.side], body=text, status="visible")
    db.add(a)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        lato = "il sì" if data.side == "yes" else "il no"
        raise HTTPException(409, f"Hai già scritto una ragione per {lato}: eliminala se vuoi scriverne un'altra.")
    return _out(a, {}, set(), user)


@router.delete("/api/arguments/{aid}", status_code=204)
def delete_argument(aid: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    a = db.get(Argument, aid)
    if not a or (a.author_id != user.id and not user.is_admin):
        raise HTTPException(404, "Ragione non trovata.")
    db.execute(delete(Report).where(Report.target_type == "argument", Report.target_id == aid))
    db.delete(a)
    db.commit()


@router.post("/api/arguments/{aid}/useful")
def useful_on(aid: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return _useful_toggle(aid, user, db, True)


@router.delete("/api/arguments/{aid}/useful")
def useful_off(aid: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return _useful_toggle(aid, user, db, False)


def _useful_toggle(aid: int, user: User, db: Session, on: bool) -> dict:
    a = db.get(Argument, aid)
    if not a or a.status != "visible":
        raise HTTPException(404, "Ragione non trovata.")
    _open_question(db, a.question_id, user)
    if a.author_id == user.id:
        raise HTTPException(422, "Non puoi segnare come utile una tua ragione.")
    if on:
        try:
            with db.begin_nested():
                db.add(ArgumentVote(argument_id=a.id, user_id=user.id))
        except IntegrityError:
            pass
    else:
        db.execute(delete(ArgumentVote).where(ArgumentVote.argument_id == a.id, ArgumentVote.user_id == user.id))
    db.commit()
    useful = _useful(db, [a.id])
    return _out(a, useful, {a.id} if on else set(), user)


# --------------------------------------------------------------------------------------------
# Domanda del giorno
# --------------------------------------------------------------------------------------------


@router.get("/api/polls/today")
def poll_of_the_day(user: User | None = Depends(viewer), db: Session = Depends(get_db)):
    """Un sondaggio aperto a cui non hai ancora risposto: prima delle tue città (profilo e dichiarate),
    altrimenti nazionale. Vince quello con più partecipanti; a parità, il più recente."""
    now = datetime.now(timezone.utc)
    mine = local_idx(db, user)
    q = select(Question).where(Question.status == "approved", author_visible(Question.author_id, user),
                               or_(Question.ends_at.is_(None), Question.ends_at > now))
    if user is not None:
        q = q.where(Question.id.not_in(V.voted_ids(user)))
    candidates = []
    for x in db.scalars(q.order_by(Question.id.desc()).limit(300)):
        local = x.scope == "local" and bool(x.city) and city_index(x.city) in mine
        if x.scope == "local" and not local:
            continue  # sondaggi di altre città: non sono la "tua" domanda del giorno
        candidates.append((x, local))
    if not candidates:
        return None
    parts = {qid: sum(t.values()) for qid, t in V.tallies(db, [x.id for x, _ in candidates]).items()}
    best, local = max(candidates, key=lambda c: (c[1], parts.get(c[0].id, 0), c[0].id))
    return {**questions_out(db, [best], user)[0], "today": {"local": local}}
