"""Persone coinvolte: quante persone DIVERSE hanno risposto ai tuoi post o votato i tuoi sondaggi.

Si contano persone, non interazioni: chi commenta dieci volte e vota tre sondaggi conta 1.
Non contano i propri commenti/voti, i contenuti nascosti o eliminati e gli account bannati.
"""
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select, union
from sqlalchemy.orm import Session

from .crypto import vote_owner
from .models import Comment, Post, PostSupport, Question, User, Vote

RECENT_DAYS = 30


def _responders(user_id: str, since: datetime | None = None):
    """Chi ha risposto ai post di un utente: commentando oppure con "Anch'io" / "Sostengo"."""
    commenters = (select(Comment.author_id.label("uid"), Comment.post_id.label("item"))
                  .join(Post, Post.id == Comment.post_id)
                  .where(Post.author_id == user_id, Post.status == "visible", Comment.status == "visible",
                         Comment.author_id.is_not(None), Comment.author_id != user_id))
    supporters = (select(PostSupport.user_id.label("uid"), PostSupport.post_id.label("item"))
                  .join(Post, Post.id == PostSupport.post_id)
                  .where(Post.author_id == user_id, Post.status == "visible", PostSupport.user_id != user_id))
    if since is not None:
        commenters = commenters.where(Comment.created_at >= since)
        supporters = supporters.where(PostSupport.created_at >= since)
    return union(commenters, supporters).subquery()


def _voters(user_id: str, since: datetime | None = None):
    """Impronte di chi ha votato i sondaggi di un utente (i voti non contengono il codice di chi vota)."""
    q = (select(Vote.owner, Vote.question_id)
         .join(Question, Question.id == Vote.question_id)
         .where(Question.author_id == user_id, Question.status == "approved"))
    if since is not None:
        q = q.where(Vote.created_at >= since)
    return q


def reach(db: Session, user: User) -> dict:
    """Tre misure che non si mescolano:
    - reached: persone raggiunte in tutto (chi ha votato O risposto, ognuno una volta);
    - reached_polls / reached_posts: le due cose separate (votare costa un tocco, commentare no:
      sommarle favorirebbe i sondaggi);
    - top: il contenuto che ha coinvolto più persone (la qualità, più chiara di una media).
    Le persone si confrontano per impronta (vote_owner): si sa QUANTE sono, non chi ha votato."""
    banned = set(db.scalars(select(User.id).where(User.is_banned.is_(True))))
    banned_h = {vote_owner(b) for b in banned}
    me_h = vote_owner(user.id)

    def people(since=None):
        voters = [(o, item) for o, item in db.execute(_voters(user.id, since)) if o != me_h and o not in banned_h]
        resp = _responders(user.id, since)
        responders = [(vote_owner(uid), item) for uid, item in db.execute(select(resp.c.uid, resp.c.item))
                      if uid not in banned]
        return voters, responders

    voters, responders = people()
    recent_v, recent_r = people(datetime.now(timezone.utc) - timedelta(days=RECENT_DAYS))

    def best(pairs) -> tuple[int, int] | None:
        """Il contenuto con più persone diverse: (id, persone); a parità, il più recente."""
        by_item: dict[int, set[str]] = {}
        for who, item in pairs:
            by_item.setdefault(item, set()).add(who)
        if not by_item:
            return None
        item = max(by_item, key=lambda i: (len(by_item[i]), i))
        return item, len(by_item[item])

    polls = db.scalar(select(func.count()).select_from(Question).where(
        Question.author_id == user.id, Question.status == "approved")) or 0
    return {
        "reached": len({o for o, _ in voters} | {h for h, _ in responders}),
        "reached_recent": len({o for o, _ in recent_v} | {h for h, _ in recent_r}),
        "reached_polls": len({o for o, _ in voters}),
        "reached_posts": len({h for h, _ in responders}),
        "top": _top(db, best(voters), best(responders)),
        "polls": polls,
    }


def _top(db: Session, poll: tuple[int, int] | None, post: tuple[int, int] | None) -> dict | None:
    """Il contenuto che ha coinvolto più persone (sondaggio o post), da mostrare nel profilo.
    Solo da 2 persone in su: con una sola non è un "più coinvolgente"."""
    pick = max([x for x in ((poll, "poll"), (post, "post")) if x[0]], key=lambda x: x[0][1], default=None)
    if not pick or pick[0][1] < 2:
        return None
    (item_id, people), kind = pick
    if kind == "poll":
        q = db.get(Question, item_id)
        return {"type": "poll", "id": item_id, "text": q.title, "people": people}
    p = db.get(Post, item_id)
    text = " ".join(((p.headline if p.kind == "proposal" else None) or p.body or "").split())
    return {"type": "post", "id": item_id, "text": (text[:90] + "…") if len(text) > 90 else (text or "Post con foto"),
            "people": people}


def post_people(db: Session, post_ids) -> dict[int, int]:
    """Per ogni post: quante persone diverse (escluso chi l'ha scritto) hanno risposto: commento, "Anch'io" o "Sostengo"."""
    post_ids = list(post_ids)
    if not post_ids:
        return {}
    commenters = (select(Comment.post_id.label("pid"), Comment.author_id.label("uid"))
                  .join(Post, Post.id == Comment.post_id)
                  .where(Comment.post_id.in_(post_ids), Comment.status == "visible", Comment.author_id != Post.author_id))
    supporters = (select(PostSupport.post_id.label("pid"), PostSupport.user_id.label("uid"))
                  .join(Post, Post.id == PostSupport.post_id)
                  .where(PostSupport.post_id.in_(post_ids), PostSupport.user_id != Post.author_id))
    both = union(commenters, supporters).subquery()
    rows = db.execute(
        select(both.c.pid, func.count(func.distinct(both.c.uid)))
        .join(User, User.id == both.c.uid).where(User.is_banned.is_(False))
        .group_by(both.c.pid)
    )
    return dict(rows.all())
