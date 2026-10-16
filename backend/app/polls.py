"""Sondaggi: come si presentano (foto, autore, scadenza) e i loro risultati in percentuale."""
from datetime import datetime, timezone

from sqlalchemy import and_, or_, select
from sqlalchemy.orm import Session

from .config import MIN_CITY_RESULTS, MIN_RESULTS
from . import votes as V
from .crypto import city_index
from .local import local_idx
from .models import Image, Question, Report, User
from .people import user_cards

DURATIONS = (1, 3, 7, 30)  # giorni che si possono scegliere per la scadenza
# voto segreto: nessun gruppo (città, "di qui", "da fuori") mostra percentuali sotto la soglia generale
GROUP_MIN = max(MIN_CITY_RESULTS, MIN_RESULTS)


def _utc(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _iso(dt: datetime | None) -> str | None:
    return _utc(dt).isoformat() if dt else None


def is_ended(q: Question, now: datetime | None = None) -> bool:
    return q.ends_at is not None and _utc(q.ends_at) <= (now or datetime.now(timezone.utc))


def _pct(counts: dict[int, int]) -> dict[str, int]:
    """Percentuali intere che sommano a 100 (metodo del resto più grande)."""
    total = sum(counts.values())
    keys = {"yes": 1, "depends": 0, "no": -1}
    if total == 0:
        return {k: 0 for k in keys}
    raw = {k: counts.get(v, 0) * 100 / total for k, v in keys.items()}
    base = {k: int(x) for k, x in raw.items()}
    leftover = 100 - sum(base.values())
    for k in sorted(raw, key=lambda k: raw[k] - base[k], reverse=True)[:leftover]:
        base[k] += 1
    return base


def secret_pct(counts: dict[int, int]) -> dict[str, int] | None:
    """Percentuali solo da MIN_RESULTS voti in su: con 1-2 voti si capirebbe come ha votato qualcuno.
    Il voto resta segreto: nessuno vede mai chi ha votato cosa, e con pochi voti nemmeno le percentuali."""
    full = {k: counts.get(k, 0) for k in (1, 0, -1)}
    return _pct(full) if sum(full.values()) >= MIN_RESULTS else None


DIVISIVE_MIN_VOTES = 10


def is_divisive(counts: dict[int, int]) -> bool:
    """"Fa discutere": abbastanza voti, favorevoli e contrari vicini (max 10 punti) e insieme maggioranza.
    Non dice chi vince, quindi si può mostrare a tutti senza influenzare il voto."""
    total = sum(counts.get(k, 0) for k in (1, 0, -1))
    if total < max(DIVISIVE_MIN_VOTES, MIN_RESULTS):
        return False
    p = _pct({k: counts.get(k, 0) for k in (1, 0, -1)})
    return abs(p["yes"] - p["no"]) <= 10 and p["yes"] + p["no"] >= 60


def _majority(counts: dict[int, int]) -> int | None:
    if not counts:
        return None
    best = max(counts.values())
    winners = [v for v, n in counts.items() if n == best]
    return winners[0] if len(winners) == 1 else None


def visible_to(user: User):
    """Sondaggi in cui l'utente può votare: nazionali + quelli della sua città."""
    cond = Question.scope == "national"
    if user.city:
        cond = or_(cond, and_(Question.scope == "local", Question.city == user.city))
    return and_(Question.status == "approved", cond)


def can_vote(q: Question, user: User | None) -> bool:
    """Chiunque abbia un account può votare un sondaggio aperto (anche di un'altra città)."""
    return user is not None and q.status == "approved" and not is_ended(q)


def _local_split(db: Session, ids: list[int]) -> dict[int, dict[bool, dict[int, int]]]:
    """Per i sondaggi di una città: voti di chi è "di qui" (True) e di chi è "di fuori" (False)."""
    return V.local_split(db, ids)


def _group(counts: dict[int, int]) -> dict:
    """Un gruppo (di qui / da fuori): quanti hanno votato e, se sono abbastanza, come."""
    total = sum(counts.values())
    full = {k: counts.get(k, 0) for k in (1, 0, -1)}
    # sotto la soglia si mostra solo il numero: con 1-2 voti la percentuale svelerebbe come ha votato qualcuno
    return {"total": total, "pct": _pct(full) if total >= GROUP_MIN else None}


def local_breakdown(split: dict[bool, dict[int, int]] | None) -> dict:
    split = split or {}
    return {"residents": _group(split.get(True, {})), "outside": _group(split.get(False, {}))}


def _tallies(db: Session, ids: list[int]) -> dict[int, dict[int, int]]:
    return V.tallies(db, ids)


def compute_results(db: Session, q: Question, user: User | None) -> dict:
    t = _tallies(db, [q.id]).get(q.id, {})
    counts = {k: t.get(k, 0) for k in (1, 0, -1)}
    total = sum(counts.values())
    mine = V.mine(db, user, [q.id]).get(q.id, (None, None))[0]
    result = {
        "question_id": q.id,
        "total": total,
        "counts": {"yes": counts[1], "depends": counts[0], "no": counts[-1]} if total >= MIN_RESULTS else None,
        "pct": secret_pct(counts),
        "low_sample": total < MIN_RESULTS,
        "city": None,
        "mine": mine,
        "ended": is_ended(q),
        "local": local_breakdown(_local_split(db, [q.id]).get(q.id)) if q.scope == "local" else None,
    }
    if user is not None and user.city:
        c = V.city_counts(db, q.id, user.city_idx)  # calcolato al momento sui voti cifrati
        ctotal = sum(c.values())
        if ctotal >= GROUP_MIN:  # soglia: non si espongono gruppi troppo piccoli (voto segreto)
            result["city"] = {"name": user.city, "total": ctotal, "pct": _pct(c)}
    return result


def question_out(q: Question, participants: int) -> dict:
    """Forma minima (anteprime pubbliche e link condivisi)."""
    return {
        "id": q.id, "title": q.title, "description": q.description, "category": q.category,
        "scope": q.scope, "city": q.city, "participants": participants,
        "ends_at": _iso(q.ends_at), "ended": is_ended(q),
    }


def questions_out(db: Session, qs: list[Question], user: User | None) -> list[dict]:
    """Sondaggi completi: foto, autore, scadenza, il tuo voto e, se hai votato o è concluso, i risultati."""
    ids = [q.id for q in qs]
    tallies = _tallies(db, ids)
    people = user_cards(db, [q.author_id for q in qs])
    images: dict[int, Image] = {}
    if ids:
        for img in db.scalars(select(Image).where(Image.question_id.in_(ids))):
            images.setdefault(img.question_id, img)
    mine: dict[int, int] = {}
    mine_resident: dict[int, bool | None] = {}
    reported: set[int] = set()
    split = _local_split(db, [q.id for q in qs if q.scope == "local"])
    if user is not None and ids:
        for qid, (value, res) in V.mine(db, user, ids).items():
            mine[qid] = value
            mine_resident[qid] = res
        reported = set(db.scalars(select(Report.target_id).where(
            Report.reporter_id == user.id, Report.target_type == "question", Report.target_id.in_(ids))))
    now = datetime.now(timezone.utc)
    mine_places = local_idx(db, user)  # città di cui sono "di qui" (profilo + dichiarate)
    from .debate import summaries  # import locale: debate usa questo modulo
    reasons = summaries(db, ids, user)
    out = []
    for q in qs:
        local_me = bool(q.scope == "local" and q.city and city_index(q.city) in mine_places)
        # sondaggio riservato a una città e io non ne sono: non posso votare, quindi vedo subito i risultati
        outsider = bool(user is not None and q.scope == "local" and q.audience == "local" and not local_me)
        t = tallies.get(q.id, {})
        counts = {k: t.get(k, 0) for k in (1, 0, -1)}
        total = sum(counts.values())
        ended = is_ended(q, now)
        img = images.get(q.id)
        voted = q.id in mine
        out.append({
            "type": "poll",
            **question_out(q, total),
            "ended": ended,
            "created_at": _iso(q.created_at),
            "author": people.get(q.author_id) if q.author_id else None,
            "is_author": user is not None and q.author_id == user.id,
            "image": {"id": img.id, "w": img.width, "h": img.height,
                      "sm": f"/api/media/{img.id}/sm", "lg": f"/api/media/{img.id}/lg"} if img else None,
            "divisive": is_divisive(counts),
            "my_vote": mine.get(q.id),
            "my_resident": mine_resident.get(q.id),
            # sondaggio di una città di cui sono (profilo o dichiarata): conto come "di qui" senza chiedere
            "is_resident": local_me,
            "audience": q.audience or "all",
            "can_vote": can_vote(q, user) and not outsider,
            "reported": q.id in reported,
            # le ragioni: perché sì / perché no (le più utili) e se posso aggiungerne
            "arguments": {**reasons.get(q.id, {}), "can_add": user is not None and not ended and not outsider},
            # i risultati si vedono dopo aver votato (per non influenzare) oppure a sondaggio concluso
            "results": {"total": total, "pct": secret_pct(counts),
                        "counts": {"yes": counts[1], "depends": counts[0], "no": counts[-1]} if total >= MIN_RESULTS else None,
                        "low_sample": total < MIN_RESULTS,
                        "local": local_breakdown(split.get(q.id)) if q.scope == "local" else None} if (voted or ended or outsider) else None,
        })
    return out
