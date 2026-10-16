"""Profili privati: chi può vedere post e sondaggi di chi.

Regola unica, usata ovunque (feed, sondaggi, città, mappa, foto, link condivisi):
- profilo pubblico → tutti;
- profilo privato → solo l'autore e chi si segue A VICENDA con lui (entrambi i follow accettati).
"""
from sqlalchemy import and_, or_, select
from sqlalchemy.orm import Session

from .models import Follow, User


def _private_ids():
    return select(User.id).where(User.is_private.is_(True))


def _mutual_ids(viewer_id: str):
    """Persone che io seguo e che seguono me (follow accettati in entrambe le direzioni)."""
    they_follow_me = select(Follow.follower_id).where(Follow.followee_id == viewer_id, Follow.status == "accepted")
    return select(Follow.followee_id).where(
        Follow.follower_id == viewer_id, Follow.status == "accepted", Follow.followee_id.in_(they_follow_me))


def author_visible(column, viewer: User | None):
    """Condizione SQL: il contenuto con questo autore si può mostrare a chi guarda?
    (un autore NULL = account eliminato: il contenuto resta pubblico)"""
    cond = or_(column.is_(None), column.not_in(_private_ids()))
    if viewer is None:
        return cond
    return or_(cond, column == viewer.id, column.in_(_mutual_ids(viewer.id)))


def is_mutual(db: Session, a_id: str, b_id: str) -> bool:
    rows = db.scalar(select(Follow.id).where(
        or_(and_(Follow.follower_id == a_id, Follow.followee_id == b_id),
            and_(Follow.follower_id == b_id, Follow.followee_id == a_id)),
        Follow.status == "accepted").limit(1).offset(1))
    return rows is not None


def can_see(db: Session, viewer: User | None, author_id: str | None) -> bool:
    """Lo stesso controllo, per un singolo autore."""
    if author_id is None:
        return True
    if viewer is not None and viewer.id == author_id:
        return True
    author = db.get(User, author_id)
    if author is None or not author.is_private:
        return True
    return viewer is not None and is_mutual(db, viewer.id, author_id)
