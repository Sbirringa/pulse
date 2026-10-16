"""Comuni italiani (fonte ISTAT, CC-BY 4.0) e attività per la mappa."""
import json
from datetime import datetime, timedelta, timezone
from functools import lru_cache
from pathlib import Path

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .db import get_db
from .deps import limit
from .models import Post
from .privacy import author_visible

DATA_FILE = Path(__file__).resolve().parent / "data" / "comuni.json"
router = APIRouter()


@lru_cache(maxsize=1)
def comuni() -> dict[str, list]:
    data = json.loads(DATA_FILE.read_text(encoding="utf-8"))
    return {row[0]: row for row in data["items"]}


def is_city(name: str | None) -> bool:
    return bool(name) and name in comuni()


@router.get("/api/places/activity", dependencies=[Depends(limit("activity", 60, 60))])
def activity(days: int = 60, db: Session = Depends(get_db)):
    """Quanti post locali (visibili) ci sono per comune negli ultimi giorni: le "bolle" della mappa.
    Solo numeri aggregati per città, nessun dato personale."""
    days = max(1, min(days, 365))
    since = datetime.now(timezone.utc) - timedelta(days=days)
    rows = db.execute(
        select(Post.city, func.count())
        .where(Post.scope == "local", Post.status == "visible", Post.created_at >= since, Post.city.is_not(None),
               author_visible(Post.author_id, None))  # i post dei profili privati non contano sulla mappa
        .group_by(Post.city)
    ).all()
    places = comuni()
    out = []
    for city, n in rows:
        row = places.get(city)
        if row:
            out.append({"city": city, "posts": n, "lat": row[3], "lon": row[4]})
    out.sort(key=lambda r: -r["posts"])
    return out
