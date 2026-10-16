"""Essere "di qui": la città del profilo oppure una città dichiarata (ci vivi, lavori o studi).

Si chiede una volta per città e vale per tutti i suoi post e sondaggi. È una dichiarazione, non una verifica.
"""
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .crypto import city_index
from .models import CityPlace, User


def places(db: Session, user: User | None) -> list[str]:
    """Le città dichiarate (nomi, decifrati), in ordine di dichiarazione."""
    if user is None:
        return []
    return [p.city for p in db.scalars(select(CityPlace).where(CityPlace.user_id == user.id).order_by(CityPlace.id))]


def local_idx(db: Session, user: User | None) -> set[str]:
    """Indici ciechi delle città di cui la persona è "di qui" (profilo + dichiarate)."""
    if user is None:
        return set()
    out = set(db.scalars(select(CityPlace.city_idx).where(CityPlace.user_id == user.id)))
    if user.city_idx:
        out.add(user.city_idx)
    return out


def is_local(db: Session, user: User | None, city: str | None) -> bool:
    return bool(user and city) and city_index(city) in local_idx(db, user)


def declare(db: Session, user: User, city: str) -> None:
    """Ricorda che la persona è di questa città (dentro la transazione di chi chiama)."""
    if is_local(db, user, city):
        return
    try:
        with db.begin_nested():
            db.add(CityPlace(user_id=user.id, city=city, city_idx=city_index(city)))
    except IntegrityError:  # dichiarata nello stesso istante da un'altra richiesta
        pass


def undeclare(db: Session, user: User, city: str) -> None:
    db.execute(delete(CityPlace).where(CityPlace.user_id == user.id, CityPlace.city_idx == city_index(city)))
