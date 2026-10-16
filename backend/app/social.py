"""Piazza: post con foto, commenti a thread (anche con foto), segnalazioni e moderazione."""
import re
from datetime import datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile
from pydantic import BaseModel, field_validator
from sqlalchemy import delete, exists, func, or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .config import MAX_POST_IMAGES, POSTS_PER_DAY, PROPOSAL_GOAL, REPORT_HIDE_THRESHOLD
from .crypto import nick_index
from .db import get_db
from .deps import admin_guard, current_user, user_limit, viewer
from .media import MAX_UPLOAD_BYTES, ImageError, delete_image_files, process_image, read_image, store_processed
from . import votes as V
from .models import Argument, ArgumentVote, Comment, Follow, Image, Post, PostSupport, Question, Report, User
from .notifications import notify
from .people import user_by_nick, user_cards
from .moderation import clean_topic, contains_blocked
from .places import is_city
from .privacy import author_visible, can_see
from .reach import post_people
from .local import declare, is_local
from .search import sync_prefixes
from .seed_data import CATEGORIES

router = APIRouter()

POST_MAX_CHARS = 2000
HEADLINE_MIN, HEADLINE_MAX = 10, 140
PROPOSAL_POLL_DAYS = 7  # quanto resta aperto il sondaggio nato da una proposta
_LINK = re.compile(r"https?://|www\.", re.IGNORECASE)
COMMENT_MAX_CHARS = 1000
MAX_COMMENTS_PER_POST = 500
REPORT_REASONS = {
    "spam": "Spam o pubblicità",
    "odio": "Odio, insulti o minacce",
    "illegale": "Contenuto illegale",
    "privacy": "Dati personali o foto di altre persone",
    "identita": "Si spaccia per un'altra persona",
    "falso": "Informazioni false o ingannevoli",
    "altro": "Altro",
}


# --------------------------------------------------------------------------------------------
# Utilità
# --------------------------------------------------------------------------------------------


def _iso(dt: datetime) -> str:
    return (dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)).isoformat()


def _read_upload(f: UploadFile) -> bytes:
    data = f.file.read(MAX_UPLOAD_BYTES + 1)
    if len(data) > MAX_UPLOAD_BYTES:
        raise ImageError(f"Foto troppo pesante: massimo {MAX_UPLOAD_BYTES // (1024 * 1024)} MB.")
    return data


def _process_uploads(files: list[UploadFile]) -> list[tuple[dict[str, bytes], int, int]]:
    """Elabora tutte le foto PRIMA di salvare qualsiasi cosa: se una non va bene, non si salva niente."""
    out = []
    for i, f in enumerate(files, start=1):
        try:
            out.append(process_image(_read_upload(f)))
        except ImageError as e:
            prefix = f"Foto {i}: " if len(files) > 1 else ""
            raise HTTPException(422, f"{prefix}{e}")
    return out


def _store_all(processed) -> list[tuple[str, int, int]]:
    stored: list[tuple[str, int, int]] = []
    try:
        for variants, w, h in processed:
            stored.append((store_processed(variants), w, h))
    except Exception:
        delete_image_files([s[0] for s in stored])
        raise HTTPException(503, "Non riesco a salvare la foto in questo momento. Riprova.")
    return stored


def image_out(img: Image) -> dict:
    return {"id": img.id, "w": img.width, "h": img.height,
            "sm": f"/api/media/{img.id}/sm", "lg": f"/api/media/{img.id}/lg"}


def _images_by(db: Session, column, ids) -> dict[int, list[Image]]:
    ids = list(ids)
    out: dict[int, list[Image]] = {}
    if not ids:
        return out
    for img in db.scalars(select(Image).where(column.in_(ids)).order_by(Image.position, Image.created_at)):
        out.setdefault(getattr(img, column.key), []).append(img)
    return out


def _comment_counts(db: Session, post_ids) -> dict[int, int]:
    post_ids = list(post_ids)
    if not post_ids:
        return {}
    rows = db.execute(
        select(Comment.post_id, func.count())
        .where(Comment.post_id.in_(post_ids), Comment.status == "visible")
        .group_by(Comment.post_id)
    )
    return dict(rows.all())


def _reported_by(db: Session, user: User | None, target_type: str, ids) -> set[int]:
    ids = list(ids)
    if not ids or user is None:
        return set()
    return set(db.scalars(select(Report.target_id).where(
        Report.reporter_id == user.id, Report.target_type == target_type, Report.target_id.in_(ids))))


def posts_out(db: Session, posts: list[Post], user: User | None) -> list[dict]:
    uid = user.id if user else None
    ids = [p.id for p in posts]
    people = user_cards(db, [p.author_id for p in posts])
    images = _images_by(db, Image.post_id, ids)
    counts = _comment_counts(db, ids)
    replied = post_people(db, ids)
    reported = _reported_by(db, user, "post", ids)
    supports, mine = _supports(db, ids, user)
    return [{
        "id": p.id,
        "author": people.get(p.author_id, {}).get("nickname", "utente"),
        "author_name": people.get(p.author_id, {}).get("name"),
        "author_avatar": people.get(p.author_id, {}).get("avatar"),
        "mine": uid is not None and p.author_id == uid,
        "body": p.body,
        "category": p.category,
        "scope": p.scope,
        "city": p.city,
        "status": p.status,
        "created_at": _iso(p.created_at),
        "images": [image_out(i) for i in images.get(p.id, [])],
        "comment_count": counts.get(p.id, 0),
        "people": replied.get(p.id, 0),  # persone diverse che hanno risposto (escluso chi l'ha scritto)
        "reported": p.id in reported,
        "kind": p.kind or "post",
        "headline": p.headline if p.kind == "proposal" else None,
        "supports": supports.get(p.id, 0),          # solo il numero: chi ha sostenuto non si mostra
        "supported": p.id in mine,
        "goal": PROPOSAL_GOAL if p.kind == "proposal" else None,
        "poll_id": p.poll_id,
        "audience": p.audience or "all",
    } for p in posts]


def _check_local(db: Session, post: Post, user: User) -> None:
    """Post di una città riservato a chi è di lì: commentano e sostengono solo loro (gli altri leggono)."""
    if (post.scope == "local" and post.audience == "local" and post.author_id != user.id
            and not is_local(db, user, post.city)):
        raise HTTPException(403, f"Possono partecipare solo le persone di {post.city}.")


def _supports(db: Session, ids: list[int], user: User | None) -> tuple[dict[int, int], set[int]]:
    if not ids:
        return {}, set()
    counts = dict(db.execute(
        select(PostSupport.post_id, func.count()).join(User, User.id == PostSupport.user_id)
        .where(PostSupport.post_id.in_(ids), User.is_banned.is_(False)).group_by(PostSupport.post_id)).all())
    mine = set(db.scalars(select(PostSupport.post_id).where(
        PostSupport.post_id.in_(ids), PostSupport.user_id == user.id))) if user else set()
    return counts, mine


def _proposal_to_poll(db: Session, post: Post) -> Question:
    """La proposta ha raggiunto i sostenitori: nasce il sondaggio (stessa città, aperto 7 giorni).
    Lo firma chi ha fatto la proposta; autore e sostenitori ricevono l'avviso per andare a votare."""
    details = " ".join((post.body or "").split())
    q = Question(
        title=(post.headline or "").strip()[:160],
        description=(details[:560] + "…") if len(details) > 560 else details,
        category=post.category or "Proposte",
        scope=post.scope, city=post.city if post.scope == "local" else None,
        audience=post.audience if post.scope == "local" else "all",  # stessa regola della proposta
        status="approved", author_id=post.author_id,
        ends_at=datetime.now(timezone.utc) + timedelta(days=PROPOSAL_POLL_DAYS),
    )
    db.add(q)
    db.flush()
    post.poll_id = q.id
    notify(db, post.author_id, None, "proposal_poll", post_id=post.id, question_id=q.id)
    for uid in db.scalars(select(PostSupport.user_id).where(PostSupport.post_id == post.id)):
        notify(db, uid, None, "proposal_poll", post_id=post.id, question_id=q.id)
    return q


def _visible_post(db: Session, post_id: int, user: User | None) -> Post:
    post = db.get(Post, post_id)
    if not post or (post.status != "visible" and (user is None or post.author_id != user.id)):
        raise HTTPException(404, "Post non trovato.")
    if not can_see(db, user, post.author_id):  # profilo privato: solo chi si segue a vicenda
        raise HTTPException(404, "Post non trovato.")
    return post


def remove_comment(db: Session, c: Comment) -> list[str]:
    """Elimina un commento. Se è un commento principale con risposte, resta un segnaposto
    "Commento eliminato" per non spezzare la conversazione; foto e testo spariscono comunque."""
    image_ids = list(db.scalars(select(Image.id).where(Image.comment_id == c.id)))
    has_replies = c.parent_id is None and db.scalar(
        select(exists().where(Comment.parent_id == c.id, Comment.status != "deleted")))
    db.execute(delete(Report).where(Report.target_type == "comment", Report.target_id == c.id))
    if has_replies:
        db.execute(delete(Image).where(Image.comment_id == c.id))
        c.status, c.body, c.author_id = "deleted", "", None
    else:
        replies = list(db.scalars(select(Comment.id).where(Comment.parent_id == c.id)))
        image_ids += list(db.scalars(select(Image.id).where(Image.comment_id.in_(replies)))) if replies else []
        db.delete(c)
    return image_ids


def remove_post(db: Session, p: Post) -> list[str]:
    comment_ids = list(db.scalars(select(Comment.id).where(Comment.post_id == p.id)))
    image_ids = list(db.scalars(select(Image.id).where(Image.post_id == p.id)))
    if comment_ids:
        image_ids += list(db.scalars(select(Image.id).where(Image.comment_id.in_(comment_ids))))
    db.execute(delete(Report).where(Report.target_type == "post", Report.target_id == p.id))
    if comment_ids:
        db.execute(delete(Report).where(Report.target_type == "comment", Report.target_id.in_(comment_ids)))
        # prima le risposte, poi i commenti principali (vincoli di chiave esterna)
        db.execute(delete(Image).where(Image.comment_id.in_(comment_ids)))
        db.execute(delete(Comment).where(Comment.post_id == p.id, Comment.parent_id.is_not(None)))
        db.execute(delete(Comment).where(Comment.post_id == p.id))
    db.execute(delete(Image).where(Image.post_id == p.id))
    db.execute(delete(PostSupport).where(PostSupport.post_id == p.id))
    db.delete(p)
    return image_ids


def purge_user_content(db: Session, user_id: str) -> list[str]:
    """Usato quando un account viene eliminato (o bannato con rimozione): toglie post, commenti e foto."""
    image_ids: list[str] = []
    for p in list(db.scalars(select(Post).where(Post.author_id == user_id))):
        image_ids += remove_post(db, p)
    db.flush()
    # prima le risposte, poi i commenti principali (che possono restare come segnaposto)
    mine = list(db.scalars(select(Comment).where(Comment.author_id == user_id)
                           .order_by(Comment.parent_id.is_(None), Comment.id)))
    for c in mine:
        image_ids += remove_comment(db, c)
        db.flush()
    avatars = list(db.scalars(select(Image.id).where(
        Image.owner_id == user_id, Image.post_id.is_(None), Image.comment_id.is_(None),
        Image.question_id.is_(None))))
    if avatars:
        db.execute(update(User).where(User.id == user_id).values(avatar_id=None))
        db.execute(delete(Image).where(Image.id.in_(avatars)))
        image_ids += avatars
    # le sue ragioni sotto i sondaggi (con i loro "Utile" e segnalazioni) e i suoi "Utile"
    arg_ids = select(Argument.id).where(Argument.author_id == user_id)
    db.execute(delete(Report).where(Report.target_type == "argument", Report.target_id.in_(arg_ids)))
    db.execute(delete(ArgumentVote).where(or_(ArgumentVote.argument_id.in_(arg_ids), ArgumentVote.user_id == user_id)))
    db.execute(delete(Argument).where(Argument.author_id == user_id))
    db.execute(delete(Report).where(Report.target_type == "user", Report.target_ref == user_id))
    db.execute(update(Image).where(Image.owner_id == user_id).values(owner_id=None))
    return image_ids


# --------------------------------------------------------------------------------------------
# Post
# --------------------------------------------------------------------------------------------


@router.post("/api/posts", status_code=201)
def create_post(
    body: str = Form(""),
    scope: str = Form("national"),
    category: str = Form(""),
    city: str = Form(""),  # città scelta per un post locale (se vuota: quella del profilo)
    kind: str = Form("post"),  # post | proposal
    audience: str = Form("all"),  # solo post di una città: all = partecipano tutti · local = solo chi è di lì
    headline: str = Form(""),  # solo per le proposte: cosa si propone, in una frase
    files: list[UploadFile] = File(default=[]),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    text = body.strip()
    files = [f for f in files if f.filename or f.size]
    if kind not in ("post", "proposal"):
        raise HTTPException(422, "Tipo di post non valido.")
    if audience not in ("all", "local"):
        raise HTTPException(422, "Scelta non valida per chi può partecipare.")
    head = " ".join(headline.split()) if kind == "proposal" else ""
    if kind == "proposal":
        if not (HEADLINE_MIN <= len(head) <= HEADLINE_MAX):
            raise HTTPException(422, f"Scrivi la proposta in una frase ({HEADLINE_MIN}-{HEADLINE_MAX} caratteri).")
        if _LINK.search(head):
            raise HTTPException(422, "Non inserire link nella proposta.")
        if contains_blocked(head):
            raise HTTPException(422, "La proposta contiene parole non ammesse.")
    if len(text) > POST_MAX_CHARS:
        raise HTTPException(422, f"Il testo può avere al massimo {POST_MAX_CHARS} caratteri.")
    if not text and not files and kind == "post":
        raise HTTPException(422, "Scrivi qualcosa o aggiungi almeno una foto.")
    if len(files) > MAX_POST_IMAGES:
        raise HTTPException(422, f"Puoi aggiungere al massimo {MAX_POST_IMAGES} foto.")
    if scope not in ("national", "local"):
        raise HTTPException(422, "Ambito non valido.")
    place = city.strip() or user.city
    if scope == "local" and not place:
        raise HTTPException(422, "Scegli la città del post.")
    if scope == "local" and not is_city(place):
        raise HTTPException(422, "Città non valida: scegline una dall'elenco.")
    try:
        category = clean_topic(category, CATEGORIES) or ""
    except ValueError as e:
        raise HTTPException(422, str(e))
    since = datetime.now(timezone.utc) - timedelta(days=1)
    recent = db.scalar(select(func.count()).select_from(Post)
                       .where(Post.author_id == user.id, Post.created_at >= since)) or 0
    if recent >= POSTS_PER_DAY:
        raise HTTPException(429, f"Hai già pubblicato {POSTS_PER_DAY} post nelle ultime 24 ore.")
    user_limit(f"post:{user.id}", 3, 60, "Aspetta un attimo prima di pubblicare un altro post.")

    if scope == "local" and audience == "local":
        declare(db, user, place)  # chi riserva un post alla sua città dichiara di esserne
    stored = _store_all(_process_uploads(files))
    try:
        post = Post(author_id=user.id, body=text, category=category or None, scope=scope,
                    city=place if scope == "local" else None, status="visible",
                    kind=kind, headline=head or None, audience=audience if scope == "local" else "all")
        db.add(post)
        db.flush()
        for pos, (image_id, w, h) in enumerate(stored):
            db.add(Image(id=image_id, owner_id=user.id, post_id=post.id, position=pos, width=w, height=h))
        db.commit()
    except Exception:
        db.rollback()
        delete_image_files([s[0] for s in stored])
        raise
    return posts_out(db, [post], user)[0]


@router.post("/api/posts/{post_id}/support")
def support_post(post_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """"Anch'io" su un post, "Sostengo" su una proposta. Raggiunto il traguardo, la proposta diventa un sondaggio."""
    post = _visible_post(db, post_id, user)
    if post.author_id == user.id:
        raise HTTPException(422, "Non puoi sostenere un tuo post.")
    if post.status != "visible":
        raise HTTPException(409, "Questo post è in revisione.")
    if post.poll_id is not None:
        raise HTTPException(409, "La proposta è già diventata un sondaggio: vai a votare.")
    _check_local(db, post, user)
    user_limit(f"support:{user.id}", 60, 60, "Stai andando troppo veloce.")
    try:
        db.add(PostSupport(post_id=post.id, user_id=user.id))
        db.flush()
    except IntegrityError:  # già sostenuto (doppio tocco): va bene così
        db.rollback()
        post = _visible_post(db, post_id, user)
    if post.kind == "proposal" and post.poll_id is None:
        n = db.scalar(select(func.count()).select_from(PostSupport).join(User, User.id == PostSupport.user_id)
                      .where(PostSupport.post_id == post.id, User.is_banned.is_(False))) or 0
        if n >= PROPOSAL_GOAL:
            _proposal_to_poll(db, post)
    db.commit()
    return posts_out(db, [post], user)[0]


@router.delete("/api/posts/{post_id}/support")
def unsupport_post(post_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    post = _visible_post(db, post_id, user)
    if post.poll_id is not None:
        raise HTTPException(409, "La proposta è già diventata un sondaggio.")
    db.execute(delete(PostSupport).where(PostSupport.post_id == post.id, PostSupport.user_id == user.id))
    db.commit()
    return posts_out(db, [post], user)[0]


@router.get("/api/posts")
def list_posts(
    scope: Literal["all", "city", "following"] = "all",
    city: str | None = None,
    before: int | None = None,
    limit_n: int = 15,
    kind: Literal["all", "posts"] = "all",  # posts: solo i post, senza i sondaggi in mezzo
    user: User | None = Depends(viewer),
    db: Session = Depends(get_db),
):
    """Feed della Piazza, leggibile anche da chi non è registrato.
    all: tutti i post (nazionali e di tutte le città) · city: i post di una città (qualsiasi) ·
    following: i post di chi segui (serve l'accesso)."""
    limit_n = max(1, min(limit_n, 30))
    visible = Post.status == "visible"
    if user is not None:
        visible = or_(visible, Post.author_id == user.id)  # i tuoi post "in revisione" li vedi tu
    if scope == "following":
        if user is None:
            raise HTTPException(401, "Accedi per vedere i post di chi segui.")
        followed = select(Follow.followee_id).where(Follow.follower_id == user.id, Follow.status == "accepted")
        where = Post.author_id.in_(followed)
    elif scope == "city":
        target = city or (user.city if user else None)
        if not target:
            return {"items": [], "next": None}
        if not is_city(target):
            raise HTTPException(422, "Città non valida.")
        where = (Post.scope == "local") & (Post.city == target)
    else:
        where = Post.id.is_not(None)  # tutto
    q = select(Post).where(visible, where, author_visible(Post.author_id, user))
    if before:
        q = q.where(Post.id < before)
    posts = list(db.scalars(q.order_by(Post.id.desc()).limit(limit_n + 1)))
    has_more = len(posts) > limit_n
    posts = posts[:limit_n]
    items = [{"type": "post", **p} for p in posts_out(db, posts, user)]
    polls = [] if kind == "posts" else _feed_polls(db, scope, city or (user.city if user else None), user, before,
                        posts[-1].created_at if has_more and posts else None)
    if polls:
        items = sorted(items + polls, key=lambda x: x["created_at"], reverse=True)
    return {"items": items, "next": posts[-1].id if has_more and posts else None}


def _feed_polls(db: Session, scope: str, city: str | None, user: User | None,
                before: int | None, older_than: datetime | None) -> list[dict]:
    """Sondaggi pubblicati nello stesso intervallo di tempo della pagina di post."""
    from .polls import questions_out  # import qui: polls usa people, nessun ciclo con main

    q = select(Question).where(Question.status == "approved", Question.author_id.is_not(None),
                               author_visible(Question.author_id, user))
    if scope == "following":
        followed = select(Follow.followee_id).where(Follow.follower_id == user.id, Follow.status == "accepted")
        q = q.where(Question.author_id.in_(followed))
    elif scope == "city":
        if not city:
            return []
        q = q.where(Question.scope == "local", Question.city == city)
    if before:
        newest = db.scalar(select(Post.created_at).where(Post.id == before))
        if newest is not None:
            q = q.where(Question.created_at < newest)
    if older_than is not None:
        q = q.where(Question.created_at >= older_than)
    rows = list(db.scalars(q.order_by(Question.created_at.desc()).limit(30)))
    return questions_out(db, rows, user)


@router.get("/api/posts/{post_id}")
def get_post(post_id: int, user: User | None = Depends(viewer), db: Session = Depends(get_db)):
    return posts_out(db, [_visible_post(db, post_id, user)], user)[0]


@router.delete("/api/posts/{post_id}", status_code=204)
def delete_post(post_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    post = db.get(Post, post_id)
    if not post or post.author_id != user.id:
        raise HTTPException(404, "Post non trovato.")
    image_ids = remove_post(db, post)
    db.commit()
    delete_image_files(image_ids)


# --------------------------------------------------------------------------------------------
# Commenti
# --------------------------------------------------------------------------------------------


def comments_out(db: Session, comments: list[Comment], user: User | None) -> dict[int, dict]:
    uid = user.id if user else None
    ids = [c.id for c in comments]
    people = user_cards(db, [c.author_id for c in comments])
    names = {uid: p["nickname"] for uid, p in people.items()}
    images = _images_by(db, Image.comment_id, ids)
    reported = _reported_by(db, user, "comment", ids)
    by_id = {c.id: c for c in comments}
    out = {}
    for c in comments:
        shown = c.status == "visible"
        target = by_id.get(c.reply_to_id) if c.reply_to_id else None
        imgs = images.get(c.id, [])
        out[c.id] = {
            "id": c.id,
            "parent_id": c.parent_id,
            "author": names.get(c.author_id) if shown else None,
            "author_name": people.get(c.author_id, {}).get("name") if shown else None,
            "author_avatar": people.get(c.author_id, {}).get("avatar") if shown else None,
            "mine": uid is not None and c.author_id == uid,
            "body": c.body if shown else "",
            "status": c.status,
            "image": image_out(imgs[0]) if shown and imgs else None,
            "reply_to": names.get(target.author_id) if target is not None and target.status == "visible" else None,
            "created_at": _iso(c.created_at),
            "reported": c.id in reported,
        }
    return out


@router.get("/api/posts/{post_id}/comments")
def list_comments(post_id: int, user: User | None = Depends(viewer), db: Session = Depends(get_db)):
    """Commenti in ordine cronologico, raggruppati per conversazione: ogni commento principale
    ha sotto le sue risposte, anch'esse in ordine cronologico."""
    _visible_post(db, post_id, user)
    comments = list(db.scalars(select(Comment).where(Comment.post_id == post_id)
                               .order_by(Comment.created_at, Comment.id).limit(MAX_COMMENTS_PER_POST)))
    data = comments_out(db, comments, user)
    threads: list[dict] = []
    index: dict[int, dict] = {}
    for c in comments:
        if c.parent_id is None:
            item = {**data[c.id], "replies": []}
            index[c.id] = item
            threads.append(item)
    for c in comments:
        if c.parent_id is not None and c.parent_id in index:
            if c.status == "visible" or (user is not None and c.author_id == user.id):  # nascoste: no
                index[c.parent_id]["replies"].append(data[c.id])
    # i commenti principali non visibili restano solo se hanno risposte (segnaposto)
    threads = [t for t in threads if t["status"] == "visible" or t["replies"]]
    total = sum(1 for c in comments if c.status == "visible")
    return {"threads": threads, "total": total}


@router.post("/api/posts/{post_id}/comments", status_code=201)
def create_comment(
    post_id: int,
    body: str = Form(""),
    reply_to: int | None = Form(None),
    image: UploadFile | None = File(None),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    post = _visible_post(db, post_id, user)
    if post.status != "visible":
        raise HTTPException(403, "Non si può commentare un post in revisione.")
    _check_local(db, post, user)
    text = body.strip()
    has_image = image is not None and bool(image.filename or image.size)
    if len(text) > COMMENT_MAX_CHARS:
        raise HTTPException(422, f"Il commento può avere al massimo {COMMENT_MAX_CHARS} caratteri.")
    if not text and not has_image:
        raise HTTPException(422, "Scrivi qualcosa o allega una foto.")
    parent_id = None
    if reply_to is not None:
        target = db.get(Comment, reply_to)
        if not target or target.post_id != post.id or target.status != "visible":
            raise HTTPException(404, "Il commento a cui rispondi non esiste più.")
        parent_id = target.parent_id or target.id  # si risponde sempre dentro la stessa conversazione
    user_limit(f"comment:{user.id}", 20, 300, "Stai commentando troppo velocemente. Riprova tra poco.")

    stored = _store_all(_process_uploads([image])) if has_image else []
    try:
        c = Comment(post_id=post.id, author_id=user.id, parent_id=parent_id, reply_to_id=reply_to,
                    body=text, status="visible")
        db.add(c)
        db.flush()
        for image_id, w, h in stored:
            db.add(Image(id=image_id, owner_id=user.id, comment_id=c.id, position=0, width=w, height=h))
        replied_to = db.get(Comment, reply_to).author_id if reply_to else None
        if replied_to:
            notify(db, replied_to, user.id, "reply", post_id=post.id, comment_id=c.id)
        if post.author_id != replied_to:  # chi ha scritto il post sa dei nuovi commenti (una notifica sola)
            notify(db, post.author_id, user.id, "comment", post_id=post.id, comment_id=c.id)
        db.commit()
    except Exception:
        db.rollback()
        delete_image_files([s[0] for s in stored])
        raise
    related = [c] + ([db.get(Comment, reply_to)] if reply_to else [])
    return comments_out(db, related, user)[c.id]


@router.delete("/api/comments/{comment_id}", status_code=204)
def delete_comment(comment_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    c = db.get(Comment, comment_id)
    if not c or c.author_id != user.id or c.status == "deleted":
        raise HTTPException(404, "Commento non trovato.")
    image_ids = remove_comment(db, c)
    db.commit()
    delete_image_files(image_ids)


# --------------------------------------------------------------------------------------------
# Foto
# --------------------------------------------------------------------------------------------


def _image_visible(db: Session, img: Image, user: User | None) -> bool:
    if img.question_id is not None:
        q = db.get(Question, img.question_id)
        return q is not None and (q.status == "approved" or (user is not None and q.author_id == user.id)) \
            and can_see(db, user, q.author_id)
    if img.post_id is None and img.comment_id is None:  # foto profilo
        return db.scalar(select(User.id).where(User.avatar_id == img.id, User.is_banned.is_(False))) is not None
    if img.post_id is not None:
        post = db.get(Post, img.post_id)
        return post is not None and (post.status == "visible" or (user is not None and post.author_id == user.id)) \
            and can_see(db, user, post.author_id)
    if img.comment_id is not None:
        c = db.get(Comment, img.comment_id)
        if c is None or (c.status != "visible" and not (user is not None and c.author_id == user.id)):
            return False
        post = db.get(Post, c.post_id)
        return post is not None and post.status == "visible" and can_see(db, user, post.author_id)
    return False


def _image_response(image_id: str, variant: str, private: bool) -> Response:
    data = read_image(image_id, variant)
    if data is None:
        raise HTTPException(404, "Foto non trovata.")
    return Response(
        content=data,
        media_type="image/webp",
        headers={
            # le foto non cambiano mai (id casuale): il browser può tenerle in cache
            "Cache-Control": "private, max-age=31536000, immutable" if private else "no-store",
            "ETag": f'"{image_id}-{variant}"',
        },
    )


@router.get("/api/media/{image_id}/{variant}")
def get_media(image_id: str, variant: Literal["sm", "lg", "av"], user: User | None = Depends(viewer),
              db: Session = Depends(get_db)):
    img = db.get(Image, image_id)
    if not img or not _image_visible(db, img, user):
        raise HTTPException(404, "Foto non trovata.")
    return _image_response(img.id, variant, private=True)


# --------------------------------------------------------------------------------------------
# Segnalazioni
# --------------------------------------------------------------------------------------------


class ReportIn(BaseModel):
    target_type: Literal["post", "comment", "question", "argument", "user"]
    target_id: int = 0
    target_nickname: str | None = None  # per i profili
    reason: str

    @field_validator("reason")
    @classmethod
    def _reason(cls, v: str) -> str:
        if v not in REPORT_REASONS:
            raise ValueError("Motivo non valido.")
        return v


MODELS = {"post": Post, "comment": Comment, "question": Question, "argument": Argument}
VISIBLE = {"post": "visible", "comment": "visible", "question": "approved", "argument": "visible"}  # stato "pubblicato" per tipo


@router.get("/api/report-reasons")
def report_reasons():
    return [{"id": k, "label": v} for k, v in REPORT_REASONS.items()]


@router.post("/api/reports", status_code=201)
def create_report(body: ReportIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if body.target_type == "user":
        return _report_user(body, user, db)
    model = MODELS[body.target_type]
    target = db.get(model, body.target_id)
    if not target or target.status in ("deleted", "rejected"):
        raise HTTPException(404, "Contenuto non trovato.")
    if target.author_id == user.id:
        raise HTTPException(422, "Non puoi segnalare un tuo contenuto.")
    user_limit(f"report:{user.id}", 20, 3600, "Hai inviato troppe segnalazioni. Riprova più tardi.")
    db.add(Report(reporter_id=user.id, target_type=body.target_type, target_id=target.id, reason=body.reason))
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Hai già segnalato questo contenuto.")
    open_reports = db.scalar(select(func.count()).select_from(Report).where(
        Report.target_type == body.target_type, Report.target_id == target.id, Report.resolved.is_(False))) or 0
    hidden = False
    if open_reports >= REPORT_HIDE_THRESHOLD and target.status == VISIBLE[body.target_type]:
        target.status = "hidden"  # nascosto in automatico: l'amministratore può ripristinarlo o eliminarlo
        hidden = True
    db.commit()
    return {"hidden": hidden}


def _report_user(body: ReportIn, user: User, db: Session) -> dict:
    """I profili non vengono nascosti automaticamente: decide sempre un moderatore."""
    target = user_by_nick(db, body.target_nickname or "")
    if target.id == user.id:
        raise HTTPException(422, "Non puoi segnalare il tuo profilo.")
    user_limit(f"report:{user.id}", 20, 3600, "Hai inviato troppe segnalazioni. Riprova più tardi.")
    db.add(Report(reporter_id=user.id, target_type="user", target_id=0, target_ref=target.id, reason=body.reason))
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Hai già segnalato questo profilo.")
    return {"hidden": False}


# --------------------------------------------------------------------------------------------
# Moderazione (chiave admin: tools/moderate.py)
# --------------------------------------------------------------------------------------------


@router.get("/api/admin/reports", dependencies=[Depends(admin_guard)])
def admin_reports(db: Session = Depends(get_db)):
    """Contenuti con segnalazioni aperte o nascosti, i più segnalati per primi."""
    rows = db.execute(
        select(Report.target_type, Report.target_id, func.count(), func.min(Report.created_at))
        .where(Report.resolved.is_(False), Report.target_type != "user")
        .group_by(Report.target_type, Report.target_id)
    ).all()
    keys = {(t, i): (n, first) for t, i, n, first in rows}
    for p in db.scalars(select(Post.id).where(Post.status == "hidden")):
        keys.setdefault(("post", p), (0, None))
    for c in db.scalars(select(Comment.id).where(Comment.status == "hidden")):
        keys.setdefault(("comment", c), (0, None))
    for q in db.scalars(select(Question.id).where(Question.status == "hidden")):
        keys.setdefault(("question", q), (0, None))
    for a in db.scalars(select(Argument.id).where(Argument.status == "hidden")):
        keys.setdefault(("argument", a), (0, None))
    out = []
    for (ttype, tid), (n, _first) in keys.items():
        target = db.get(MODELS[ttype], tid)
        if target is None:
            continue
        if ttype == "question":
            author = db.get(User, target.author_id) if target.author_id else None
            reasons = dict(db.execute(select(Report.reason, func.count()).where(
                Report.target_type == ttype, Report.target_id == tid, Report.resolved.is_(False))
                .group_by(Report.reason)).all())
            out.append({
                "type": "question", "id": tid, "status": target.status, "reports": n, "reasons": reasons,
                "author": author.nickname if author else None, "author_banned": bool(author and author.is_banned),
                "body": f"{target.title} — {target.description}" if target.description else target.title,
                "post_id": None,
                "images": list(db.scalars(select(Image.id).where(Image.question_id == tid))),
            })
            continue
        if ttype == "argument":
            author = db.get(User, target.author_id) if target.author_id else None
            poll = db.get(Question, target.question_id)
            reasons = dict(db.execute(select(Report.reason, func.count()).where(
                Report.target_type == ttype, Report.target_id == tid, Report.resolved.is_(False))
                .group_by(Report.reason)).all())
            lato = "Perché sì" if target.side == 1 else "Perché no"
            out.append({
                "type": "argument", "id": tid, "status": target.status, "reports": n, "reasons": reasons,
                "author": author.nickname if author else None, "author_banned": bool(author and author.is_banned),
                "body": f"{lato}: {target.body}" + (f"  (sondaggio: {poll.title})" if poll else ""),
                "post_id": None, "images": [],
            })
            continue
        reasons = dict(db.execute(
            select(Report.reason, func.count()).where(
                Report.target_type == ttype, Report.target_id == tid, Report.resolved.is_(False))
            .group_by(Report.reason)).all())
        col = Image.post_id if ttype == "post" else Image.comment_id
        author = db.get(User, target.author_id) if target.author_id else None
        out.append({
            "type": ttype, "id": tid, "status": target.status, "reports": n, "reasons": reasons,
            "author": author.nickname if author else None,
            "author_banned": bool(author and author.is_banned),
            "body": target.body,
            "post_id": target.id if ttype == "post" else target.post_id,
            "images": [i.id for i in db.scalars(select(Image).where(col == tid).order_by(Image.position))],
        })
    # profili segnalati (nome, bio, foto profilo)
    for ref, n in db.execute(
        select(Report.target_ref, func.count()).where(Report.resolved.is_(False), Report.target_type == "user")
        .group_by(Report.target_ref)
    ).all():
        u = db.get(User, ref)
        if u is None:
            continue
        reasons = dict(db.execute(select(Report.reason, func.count()).where(
            Report.target_type == "user", Report.target_ref == ref, Report.resolved.is_(False))
            .group_by(Report.reason)).all())
        out.append({
            "type": "user", "id": 0, "status": "bannato" if u.is_banned else "attivo", "reports": n,
            "reasons": reasons, "author": u.nickname, "author_banned": u.is_banned,
            "body": f"Nome: {u.display_name or '-'} · Bio: {u.bio or '-'}", "post_id": None,
            "images": [u.avatar_id] if u.avatar_id else [],
        })
    out.sort(key=lambda r: (-r["reports"], r["type"], r["id"]))
    return out


@router.post("/api/admin/users/{nickname}/profile/{action}", dependencies=[Depends(admin_guard)])
def admin_profile(nickname: str, action: Literal["restore", "reset"], db: Session = Depends(get_db)):
    """restore: profilo ok, chiude le segnalazioni. reset: cancella nome, bio e foto profilo."""
    user = db.scalar(select(User).where(User.nickname_key == nick_index(nickname)))
    if not user:
        raise HTTPException(404, "Utente non trovato.")
    old_avatar = None
    if action == "reset":
        old_avatar = user.avatar_id
        user.display_name, user.bio, user.avatar_id = None, None, None
        sync_prefixes(db, user)  # il nome cancellato non si trova più nella ricerca
        if old_avatar:
            db.execute(delete(Image).where(Image.id == old_avatar))
    db.execute(update(Report).where(Report.target_type == "user", Report.target_ref == user.id).values(resolved=True))
    db.commit()
    if old_avatar:
        delete_image_files([old_avatar])
    return {"ok": True}


@router.get("/api/admin/media/{image_id}/{variant}", dependencies=[Depends(admin_guard)])
def admin_media(image_id: str, variant: Literal["sm", "lg", "av"], db: Session = Depends(get_db)):
    if not db.get(Image, image_id):
        raise HTTPException(404, "Foto non trovata.")
    return _image_response(image_id, variant, private=False)


@router.post("/api/admin/content/{target_type}/{target_id}/{action}", dependencies=[Depends(admin_guard)])
def admin_content(target_type: Literal["post", "comment", "question", "argument"], target_id: int,
                  action: Literal["restore", "remove"], db: Session = Depends(get_db)):
    target = db.get(MODELS[target_type], target_id)
    if not target:
        raise HTTPException(404, "Contenuto non trovato.")
    image_ids: list[str] = []
    if action == "restore":
        if target.status == "hidden":
            target.status = VISIBLE[target_type]
        db.execute(update(Report).where(Report.target_type == target_type, Report.target_id == target_id)
                   .values(resolved=True))
    elif target_type == "question":
        image_ids = list(db.scalars(select(Image.id).where(Image.question_id == target_id)))
        db.execute(delete(Report).where(Report.target_type == "question", Report.target_id == target_id))
        V.remove_question(db, target_id)
        db.delete(target)
    elif target_type == "argument":
        db.execute(delete(Report).where(Report.target_type == "argument", Report.target_id == target_id))
        db.execute(delete(ArgumentVote).where(ArgumentVote.argument_id == target_id))
        db.delete(target)
    else:
        image_ids = remove_post(db, target) if target_type == "post" else remove_comment(db, target)
    db.commit()
    delete_image_files(image_ids)
    return {"ok": True}


class BanIn(BaseModel):
    nickname: str
    purge: bool = False  # True: elimina anche tutti i suoi post e commenti


@router.post("/api/admin/users/ban", dependencies=[Depends(admin_guard)])
def admin_ban(body: BanIn, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.nickname_key == nick_index(body.nickname)))
    if not user:
        raise HTTPException(404, "Utente non trovato.")
    user.is_banned = True  # da ora ogni sua richiesta viene rifiutata
    image_ids = purge_user_content(db, user.id) if body.purge else []
    db.commit()
    delete_image_files(image_ids)
    return {"nickname": user.nickname, "banned": True, "purged": body.purge}


@router.post("/api/admin/users/unban", dependencies=[Depends(admin_guard)])
def admin_unban(body: BanIn, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.nickname_key == nick_index(body.nickname)))
    if not user:
        raise HTTPException(404, "Utente non trovato.")
    user.is_banned = False
    db.commit()
    return {"nickname": user.nickname, "banned": False}


__all__ = ["router", "purge_user_content"]
