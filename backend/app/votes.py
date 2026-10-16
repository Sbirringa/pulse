"""Voti protetti: un solo posto per salvarli, leggerli e contarli.

Nel database un voto NON contiene il codice dell'utente né il suo contenuto in chiaro:
- owner     = impronta HMAC della persona (con chiave segreta): un voto a testa, "Le tue risposte";
- user_ref  = codice dell'utente CIFRATO: si legge solo per avvisare quando il sondaggio si conclude;
- value, resident, city_ref = CIFRATI.
Le percentuali si leggono da VoteTally (solo numeri). Il dettaglio "A Roma: x%" si calcola al momento,
decifrando i voti di quel sondaggio, così nel database non restano contatori per città (gruppi piccoli = rischio).

Limite onesto: chi controlla il server E la chiave potrebbe ricostruire i voti; chi ha solo il database no.
"""
from datetime import datetime, timezone

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from .crypto import vote_owner
from .models import Question, User, Vote, VoteTally


def owner_of(user: User | str) -> str:
    return vote_owner(user if isinstance(user, str) else user.id)


def _res_code(resident: bool | None) -> int:
    return -1 if resident is None else (1 if resident else 0)


def _res_str(resident: bool | None) -> str | None:
    return None if resident is None else ("1" if resident else "0")


def _res_bool(value: str | None) -> bool | None:
    return None if value is None else value == "1"


def recount(db: Session, question_id: int) -> None:
    """Ricostruisce i contatori di un sondaggio decifrando i suoi voti (sempre coerenti, anche dopo modifiche)."""
    db.flush()
    buckets: dict[tuple[int, int], int] = {}
    for value, resident in db.execute(select(Vote.value, Vote.resident).where(Vote.question_id == question_id)):
        key = (int(value), -1 if resident is None else int(resident))
        buckets[key] = buckets.get(key, 0) + 1
    db.execute(delete(VoteTally).where(VoteTally.question_id == question_id))
    for (value, res), n in buckets.items():
        db.add(VoteTally(question_id=question_id, value=value, resident=res, n=n))
    db.flush()


def cast(db: Session, q: Question, user: User, value: int, resident: bool | None) -> None:
    """Salva o cambia il voto (dentro la transazione di chi chiama) e aggiorna i contatori."""
    # su PostgreSQL blocca il sondaggio finché il voto è salvato: due voti insieme non sbagliano i contatori
    db.execute(select(Question.id).where(Question.id == q.id).with_for_update())
    now = datetime.now(timezone.utc)
    owner = owner_of(user)
    existing = db.scalar(select(Vote).where(Vote.question_id == q.id, Vote.owner == owner))
    if existing:
        existing.value, existing.resident, existing.city_ref, existing.updated_at = (
            str(value), _res_str(resident), user.city_idx, now)
    else:
        db.add(Vote(question_id=q.id, owner=owner, user_ref=user.id, value=str(value),
                    resident=_res_str(resident), city_ref=user.city_idx, created_at=now, updated_at=now))
    recount(db, q.id)


def mine(db: Session, user: User | None, ids: list[int]) -> dict[int, tuple[int, bool | None]]:
    """I miei voti su questi sondaggi: {id: (voto, di qui?)}."""
    if user is None or not ids:
        return {}
    return {qid: (int(v), _res_bool(r)) for qid, v, r in db.execute(
        select(Vote.question_id, Vote.value, Vote.resident)
        .where(Vote.owner == owner_of(user), Vote.question_id.in_(ids)))}


def has_voted(db: Session, user: User | None, question_id: int) -> bool:
    return user is not None and db.scalar(
        select(Vote.id).where(Vote.question_id == question_id, Vote.owner == owner_of(user))) is not None


def voted_ids(user: User):
    """Sottoquery: i sondaggi a cui la persona ha già risposto."""
    return select(Vote.question_id).where(Vote.owner == owner_of(user))


def answered(db: Session, user: User) -> int:
    return db.scalar(select(func.count()).select_from(Vote).where(Vote.owner == owner_of(user))) or 0


def tallies(db: Session, ids: list[int]) -> dict[int, dict[int, int]]:
    """{sondaggio: {voto: quanti}} dai contatori."""
    out: dict[int, dict[int, int]] = {}
    if ids:
        for qid, value, n in db.execute(select(VoteTally.question_id, VoteTally.value, func.sum(VoteTally.n))
                                        .where(VoteTally.question_id.in_(ids))
                                        .group_by(VoteTally.question_id, VoteTally.value)):
            out.setdefault(qid, {})[value] = int(n)
    return out


def local_split(db: Session, ids: list[int]) -> dict[int, dict[bool, dict[int, int]]]:
    """Per i sondaggi di una città: {sondaggio: {di qui?: {voto: quanti}}}."""
    out: dict[int, dict[bool, dict[int, int]]] = {}
    if ids:
        for qid, res, value, n in db.execute(select(VoteTally.question_id, VoteTally.resident, VoteTally.value, VoteTally.n)
                                             .where(VoteTally.question_id.in_(ids), VoteTally.resident >= 0)):
            out.setdefault(qid, {}).setdefault(res == 1, {})[value] = n
    return out


def city_counts(db: Session, question_id: int, city_idx: str | None) -> dict[int, int]:
    """Come hanno votato le persone di una città (indice cieco), calcolato al momento: non resta salvato."""
    c = {1: 0, 0: 0, -1: 0}
    if not city_idx:
        return c
    for value, ref in db.execute(select(Vote.value, Vote.city_ref).where(Vote.question_id == question_id)):
        if ref == city_idx:
            c[int(value)] += 1
    return c


def my_votes(db: Session, user: User) -> list[tuple[int, int, datetime]]:
    """Le mie risposte, dalla più recente: (sondaggio, voto, quando ho votato la prima volta)."""
    return [(qid, int(v), created) for qid, v, created in db.execute(
        select(Vote.question_id, Vote.value, Vote.created_at)
        .where(Vote.owner == owner_of(user)).order_by(Vote.updated_at.desc()))]


def voters(db: Session, question_id: int) -> set[str]:
    """Chi ha votato (codici utente, decifrati): solo per gli avvisi di fine sondaggio."""
    return {ref for (ref,) in db.execute(select(Vote.user_ref).where(Vote.question_id == question_id))}


def remove_user(db: Session, user_id: str) -> int:
    """Toglie tutti i voti di una persona (account eliminato o pulizia) e aggiorna i contatori."""
    owner = owner_of(user_id)
    qids = list(db.scalars(select(Vote.question_id).where(Vote.owner == owner)))
    db.execute(delete(Vote).where(Vote.owner == owner))
    for qid in qids:
        recount(db, qid)
    return len(qids)


def remove_question(db: Session, question_id: int) -> None:
    """Toglie voti, conteggi e le ragioni (con i loro "Utile" e segnalazioni) di un sondaggio."""
    from .models import Argument, ArgumentVote, Report
    arg_ids = select(Argument.id).where(Argument.question_id == question_id)
    db.execute(delete(Report).where(Report.target_type == "argument", Report.target_id.in_(arg_ids)))
    db.execute(delete(ArgumentVote).where(ArgumentVote.argument_id.in_(arg_ids)))
    db.execute(delete(Argument).where(Argument.question_id == question_id))
    db.execute(delete(Vote).where(Vote.question_id == question_id))
    db.execute(delete(VoteTally).where(VoteTally.question_id == question_id))


def owners_on(db: Session, question_ids_query, since: datetime | None = None):
    """Impronte (owner) di chi ha votato i sondaggi indicati: per contare persone diverse senza sapere chi sono."""
    q = select(Vote.owner, Vote.question_id).where(Vote.question_id.in_(question_ids_query))
    if since is not None:
        q = q.where(Vote.created_at >= since)
    return q
