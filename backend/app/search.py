"""Ricerca delle persone mentre si scrive, senza decifrare il database.

Per ogni persona si salvano le impronte (HMAC con chiave segreta) dei pezzi iniziali di ogni parola
del nome utente e del nome reale: "giulia.rossi" → "gi", "giu", … "ro", "ros", …
Cercando "giu ros" si calcolano le stesse impronte e si trovano le persone che le hanno tutte.
"""
import re
import unicodedata

from sqlalchemy import delete, func, insert, select
from sqlalchemy.orm import Session

from .crypto import blind_index
from .models import NamePrefix, User

MIN_LEN = 2
MAX_PREFIX = 20
_SPLIT = re.compile(r"[^a-z0-9]+")


def _norm(text: str) -> str:
    text = unicodedata.normalize("NFKD", text or "")
    return "".join(ch for ch in text if not unicodedata.combining(ch)).lower()


def words(*texts: str | None) -> set[str]:
    out: set[str] = set()
    for t in texts:
        n = _norm(t or "")
        compact = re.sub(r"[^a-z0-9]", "", n)
        if len(compact) >= MIN_LEN:
            out.add(compact)  # "giulia.rossi" anche tutto attaccato: "giuliaro…"
        out.update(w for w in _SPLIT.split(n) if len(w) >= MIN_LEN)
    return out


def _h(prefix: str) -> str:
    return blind_index(prefix, "prefix")[:32]


def prefix_hashes(*texts: str | None) -> set[str]:
    hs: set[str] = set()
    for w in words(*texts):
        for i in range(MIN_LEN, min(len(w), MAX_PREFIX) + 1):
            hs.add(_h(w[:i]))
    return hs


def sync_prefixes(db: Session, user: User) -> None:
    """Da chiamare quando cambiano nome utente o nome reale (nella stessa transazione)."""
    db.flush()
    db.execute(delete(NamePrefix).where(NamePrefix.user_id == user.id))
    hs = prefix_hashes(user.nickname, user.display_name)
    if hs:
        db.execute(insert(NamePrefix), [{"user_id": user.id, "h": h} for h in hs])


def search_ids(db: Session, query: str, limit: int = 20) -> list[str]:
    """Id delle persone in cui OGNI parola cercata è l'inizio di una parola del loro nome."""
    terms = {_h(w[:MAX_PREFIX]) for w in _SPLIT.split(_norm(query)) if len(w) >= MIN_LEN}
    if not terms:
        return []
    rows = db.execute(
        select(NamePrefix.user_id)
        .join(User, User.id == NamePrefix.user_id)
        .where(NamePrefix.h.in_(terms), User.is_banned.is_(False))
        .group_by(NamePrefix.user_id)
        .having(func.count(func.distinct(NamePrefix.h)) == len(terms))
        .limit(limit)
    )
    return [r[0] for r in rows]
