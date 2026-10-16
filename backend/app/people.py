"""Come si presenta un utente agli altri: nickname, nome (facoltativo) e foto profilo."""
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .crypto import nick_index
from .models import User


def avatar_url(user: User) -> str | None:
    return f"/api/media/{user.avatar_id}/av" if user.avatar_id else None


def card(user: User) -> dict:
    return {"nickname": user.nickname, "name": user.display_name, "avatar": avatar_url(user)}


def user_cards(db: Session, ids) -> dict[str, dict]:
    ids = {i for i in ids if i}
    if not ids:
        return {}
    return {u.id: card(u) for u in db.scalars(select(User).where(User.id.in_(ids)))}


def user_by_nick(db: Session, nickname: str) -> User:
    user = db.scalar(select(User).where(User.nickname_key == nick_index(nickname)))
    if not user or user.is_banned:
        raise HTTPException(404, "Utente non trovato.")
    return user
