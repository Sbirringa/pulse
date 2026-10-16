"""Profili (nome, bio, foto) e follow con richieste di approvazione."""
import re
import unicodedata
from typing import Literal

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from pydantic import BaseModel, field_validator
from sqlalchemy import delete, func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .crypto import nick_index
from .db import get_db
from .deps import client_ip, current_user, user_limit, viewer
from .media import MAX_UPLOAD_BYTES, ImageError, delete_image_files, process_avatar, store_processed
from .models import Follow, Image, Notification, Post, User
from .notifications import forget_follow, notify
from .people import avatar_url, card, user_by_nick
from .reach import reach
from .local import declare, places, undeclare
from .places import is_city
from .privacy import can_see
from .search import search_ids, sync_prefixes

router = APIRouter()

PAGE = 50
NAME_RE = re.compile(r"^[^\W\d_]+(?:[ '’\-.]+[^\W\d_]+)*\.?$")  # lettere (anche accentate), spazi, apostrofi, trattini


def _clean(text: str) -> str:
    text = "".join(ch for ch in text if unicodedata.category(ch)[0] != "C" or ch == "\n")  # niente caratteri di controllo
    return re.sub(r"[ \t]+", " ", text).strip()


# --------------------------------------------------------------------------------------------
# Utilità
# --------------------------------------------------------------------------------------------


def _follow(db: Session, follower_id: str, followee_id: str) -> Follow | None:
    return db.scalar(select(Follow).where(Follow.follower_id == follower_id, Follow.followee_id == followee_id))


def relation(db: Session, me: User | None, other: User) -> dict:
    if me is None:  # ospite
        return {"following": "none", "follows_you": False, "requested_you": False}
    if me.id == other.id:
        return {"following": "self", "follows_you": False, "requested_you": False}
    mine = _follow(db, me.id, other.id)
    theirs = _follow(db, other.id, me.id)
    return {
        "following": mine.status if mine else "none",               # none | pending | accepted
        "follows_you": bool(theirs and theirs.status == "accepted"),
        "requested_you": bool(theirs and theirs.status == "pending"),  # ti ha chiesto di seguirti
    }


def counts(db: Session, user: User) -> dict:
    followers = db.scalar(select(func.count()).select_from(Follow).where(
        Follow.followee_id == user.id, Follow.status == "accepted")) or 0
    following = db.scalar(select(func.count()).select_from(Follow).where(
        Follow.follower_id == user.id, Follow.status == "accepted")) or 0
    posts = db.scalar(select(func.count()).select_from(Post).where(
        Post.author_id == user.id, Post.status == "visible")) or 0
    return {"followers": followers, "following": following, "posts": posts, **reach(db, user)}


def pending_count(db: Session, user: User) -> int:
    return db.scalar(select(func.count()).select_from(Follow).where(
        Follow.followee_id == user.id, Follow.status == "pending")) or 0


def me_extra(db: Session, user: User) -> dict:
    """Campi in più per /api/me."""
    return {
        "name": user.display_name,
        "bio": user.bio,
        "avatar": avatar_url(user),
        "approve_followers": user.approve_followers,
        "is_private": user.is_private,
        "is_admin": user.is_admin,
        "pending_requests": pending_count(db, user),
        "places": places(db, user),  # città dichiarate ("sono di qui"), oltre a quella del profilo
        **counts(db, user),
    }


def profile_out(db: Session, me: User | None, user: User) -> dict:
    visible = can_see(db, me, user.id)
    out = {**card(user), "bio": user.bio, **counts(db, user), "relation": relation(db, me, user),
           "approve_followers": user.approve_followers, "is_private": user.is_private, "can_see": visible}
    if not visible:
        out["top"] = None  # il titolo del contenuto più seguito è un contenuto: con il profilo privato non si mostra
    return out


# --------------------------------------------------------------------------------------------
# Il mio profilo
# --------------------------------------------------------------------------------------------


class PlaceIn(BaseModel):
    city: str


@router.post("/api/me/places")
def add_place(body: PlaceIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """"Sono di questa città" (ci vivo, lavoro o studio): vale per tutti i suoi post e sondaggi."""
    city = body.city.strip()
    if not is_city(city):
        raise HTTPException(422, "Città non valida.")
    user_limit(f"places:{user.id}", 20, 3600, "Troppe città dichiarate in poco tempo.")
    declare(db, user, city)
    db.commit()
    return {"places": places(db, user)}


@router.delete("/api/me/places")
def remove_place(body: PlaceIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    undeclare(db, user, body.city.strip())
    db.commit()
    return {"places": places(db, user)}


class ProfileIn(BaseModel):
    display_name: str | None = None   # "" per toglierlo
    bio: str | None = None
    approve_followers: bool | None = None
    is_private: bool | None = None

    @field_validator("display_name")
    @classmethod
    def _name(cls, v):
        if v is None:
            return None
        v = _clean(v)
        if v and (len(v) < 2 or len(v) > 60 or not NAME_RE.match(v)):
            raise ValueError("Scrivi nome e cognome usando solo lettere, spazi, apostrofi o trattini (2-60 caratteri).")
        return v

    @field_validator("bio")
    @classmethod
    def _bio(cls, v):
        if v is None:
            return None
        v = _clean(v)
        if len(v) > 160:
            raise ValueError("La bio può avere al massimo 160 caratteri.")
        return v


@router.patch("/api/me/profile")
def update_profile(body: ProfileIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if body.display_name is not None:
        user.display_name = body.display_name or None
        sync_prefixes(db, user)  # il nome reale si cerca mentre si scrive
    if body.bio is not None:
        user.bio = body.bio or None
    if body.is_private is not None:
        user.is_private = body.is_private
        if body.is_private:
            user.approve_followers = True  # profilo privato: le richieste si approvano sempre
    if body.approve_followers is not None and not (user.is_private and not body.approve_followers):
        user.approve_followers = body.approve_followers
        if not body.approve_followers:  # niente più approvazione: accetta le richieste in attesa
            db.execute(update(Follow).where(Follow.followee_id == user.id, Follow.status == "pending")
                       .values(status="accepted"))
    db.commit()
    return {**card(user), **me_extra(db, user)}


@router.post("/api/me/avatar")
def upload_avatar(image: UploadFile = File(...), user: User = Depends(current_user), db: Session = Depends(get_db)):
    user_limit(f"avatar:{user.id}", 10, 3600, "Hai cambiato foto troppe volte. Riprova più tardi.")
    data = image.file.read(MAX_UPLOAD_BYTES + 1)
    try:
        if len(data) > MAX_UPLOAD_BYTES:
            raise ImageError(f"Foto troppo pesante: massimo {MAX_UPLOAD_BYTES // (1024 * 1024)} MB.")
        variants = process_avatar(data)
    except ImageError as e:
        raise HTTPException(422, str(e))
    try:
        image_id = store_processed(variants)
    except Exception:
        raise HTTPException(503, "Non riesco a salvare la foto in questo momento. Riprova.")
    old = user.avatar_id
    db.add(Image(id=image_id, owner_id=user.id, position=0, width=400, height=400))
    user.avatar_id = image_id
    if old:
        db.execute(delete(Image).where(Image.id == old))
    db.commit()
    if old:
        delete_image_files([old])
    return {"avatar": avatar_url(user)}


@router.delete("/api/me/avatar", status_code=204)
def delete_avatar(user: User = Depends(current_user), db: Session = Depends(get_db)):
    old = user.avatar_id
    if old:
        user.avatar_id = None
        db.execute(delete(Image).where(Image.id == old))
        db.commit()
        delete_image_files([old])


# --------------------------------------------------------------------------------------------
# Profili degli altri e ricerca
# --------------------------------------------------------------------------------------------


@router.get("/api/users/search")
def search_users(request: Request, q: str = "", user: User | None = Depends(viewer), db: Session = Depends(get_db)):
    """Ricerca mentre si scrive: per nome utente o nome reale, anche solo con le prime lettere
    ("giu ros" trova Giulia Rossi). I nomi restano cifrati: si confrontano impronte, vedi search.py."""
    q = q.strip().lstrip("@")
    if len(q) < 2:
        return []
    user_limit(f"search:{user.id if user else client_ip(request)}", 120, 60, "Stai cercando troppo velocemente.")
    found: list[User] = []
    exact = db.scalar(select(User).where(User.nickname_key == nick_index(q), User.is_banned.is_(False)))
    if exact:
        found.append(exact)  # il nome utente esatto sempre per primo
    ids = [i for i in search_ids(db, q) if not exact or i != exact.id]
    if ids:
        found += list(db.scalars(select(User).where(User.id.in_(ids))))
    me_first = sorted(found[1 if exact else 0:], key=lambda u: (u.display_name or u.nickname).lower())
    found = found[:1] + me_first if exact else me_first
    return [{**card(u), "relation": relation(db, user, u)} for u in found[:20]]


@router.get("/api/users/{nickname}")
def get_profile(nickname: str, user: User | None = Depends(viewer), db: Session = Depends(get_db)):
    return profile_out(db, user, user_by_nick(db, nickname))


@router.get("/api/users/{nickname}/posts")
def user_posts(nickname: str, before: int | None = None, user: User | None = Depends(viewer),
               db: Session = Depends(get_db)):
    from .social import posts_out  # import qui per evitare un ciclo tra moduli

    target = user_by_nick(db, nickname)
    if not can_see(db, user, target.id):
        raise HTTPException(403, "Profilo privato: post e sondaggi li vede chi si segue a vicenda.")
    q = select(Post).where(Post.author_id == target.id)
    if user is None or target.id != user.id:
        q = q.where(Post.status == "visible")
    if before:
        q = q.where(Post.id < before)
    posts = list(db.scalars(q.order_by(Post.id.desc()).limit(16)))
    more = len(posts) > 15
    posts = posts[:15]
    return {"items": posts_out(db, posts, user), "next": posts[-1].id if more and posts else None}


def _people_list(db: Session, rows: list[tuple[int, User]], viewer: User | None) -> dict:
    more = len(rows) > PAGE
    rows = rows[:PAGE]
    items = []
    for _fid, u in rows:
        items.append({**card(u), "relation": relation(db, viewer, u)})
    return {"items": items, "next": rows[-1][0] if more and rows else None}


def _own_list(nickname: str, user: User | None, db: Session) -> User:
    """Gli elenchi di follower e seguiti li vede solo il diretto interessato, nel proprio profilo."""
    target = user_by_nick(db, nickname)
    if user is None or user.id != target.id:
        raise HTTPException(403, "Follower e seguiti di una persona li vede solo lei.")
    return target


def _filtered(q, column, db: Session, search: str):
    """Ricerca dentro l'elenco (per nome o nome utente, anche solo le prime lettere)."""
    if search.strip():
        ids = search_ids(db, search, limit=1000)
        q = q.where(column.in_(ids or [""]))
    return q


@router.get("/api/users/{nickname}/followers")
def followers(nickname: str, before: int | None = None, q: str = "", user: User | None = Depends(viewer),
              db: Session = Depends(get_db)):
    target = _own_list(nickname, user, db)
    query = (select(Follow.id, User).join(User, User.id == Follow.follower_id)
             .where(Follow.followee_id == target.id, Follow.status == "accepted", User.is_banned.is_(False)))
    query = _filtered(query, Follow.follower_id, db, q)
    if before:
        query = query.where(Follow.id < before)
    return _people_list(db, list(db.execute(query.order_by(Follow.id.desc()).limit(PAGE + 1)).all()), user)


@router.get("/api/users/{nickname}/following")
def following(nickname: str, before: int | None = None, q: str = "", user: User | None = Depends(viewer),
              db: Session = Depends(get_db)):
    target = _own_list(nickname, user, db)
    query = (select(Follow.id, User).join(User, User.id == Follow.followee_id)
             .where(Follow.follower_id == target.id, Follow.status == "accepted", User.is_banned.is_(False)))
    query = _filtered(query, Follow.followee_id, db, q)
    if before:
        query = query.where(Follow.id < before)
    return _people_list(db, list(db.execute(query.order_by(Follow.id.desc()).limit(PAGE + 1)).all()), user)


# --------------------------------------------------------------------------------------------
# Segui / richieste
# --------------------------------------------------------------------------------------------


@router.post("/api/users/{nickname}/follow")
def follow(nickname: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    target = user_by_nick(db, nickname)
    if target.id == user.id:
        raise HTTPException(422, "Non puoi seguire te stesso.")
    user_limit(f"follow:{user.id}", 60, 600, "Stai seguendo troppe persone di fila. Riprova tra poco.")
    if not _follow(db, user.id, target.id):
        # se l'altra persona ti segue già, la segui senza bisogno di approvazione ("segui anche tu")
        theirs = _follow(db, target.id, user.id)
        auto = not target.approve_followers or bool(theirs and theirs.status == "accepted")
        db.add(Follow(follower_id=user.id, followee_id=target.id, status="accepted" if auto else "pending"))
        forget_follow(db, user.id, target.id)  # niente doppioni se segui, smetti e segui di nuovo
        notify(db, target.id, user.id, "follow" if auto else "follow_request")
        try:
            db.commit()
        except IntegrityError:  # doppio tocco: la richiesta esiste già
            db.rollback()
    return profile_out(db, user, target)


@router.delete("/api/users/{nickname}/follow")
def unfollow(nickname: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Smetti di seguire, oppure annulla una richiesta in attesa."""
    target = user_by_nick(db, nickname)
    db.execute(delete(Follow).where(Follow.follower_id == user.id, Follow.followee_id == target.id))
    forget_follow(db, user.id, target.id)
    db.commit()
    return profile_out(db, user, target)


@router.delete("/api/users/{nickname}/follower")
def remove_follower(nickname: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Togli qualcuno dai tuoi follower (non viene avvisato)."""
    target = user_by_nick(db, nickname)
    db.execute(delete(Follow).where(Follow.follower_id == target.id, Follow.followee_id == user.id))
    forget_follow(db, target.id, user.id)
    db.commit()
    return profile_out(db, user, target)


@router.get("/api/me/requests")
def my_requests(user: User = Depends(current_user), db: Session = Depends(get_db)):
    rows = db.execute(
        select(Follow, User).join(User, User.id == Follow.follower_id)
        .where(Follow.followee_id == user.id, Follow.status == "pending", User.is_banned.is_(False))
        .order_by(Follow.id.desc()).limit(100)
    ).all()
    return [{**card(u), "relation": relation(db, user, u)} for _f, u in rows]


@router.post("/api/me/requests/{nickname}/{action}")
def answer_request(nickname: str, action: Literal["accept", "decline"], user: User = Depends(current_user),
                   db: Session = Depends(get_db)):
    target = user_by_nick(db, nickname)
    req = _follow(db, target.id, user.id)
    if not req or req.status != "pending":
        raise HTTPException(404, "Richiesta non trovata.")
    forget_follow(db, target.id, user.id)
    if action == "accept":
        req.status = "accepted"
        notify(db, user.id, target.id, "follow")            # resta in elenco come "ha iniziato a seguirti"
        db.flush()
        db.execute(update(Notification).where(Notification.user_id == user.id, Notification.actor_id == target.id,
                                              Notification.kind == "follow").values(read=True))
        notify(db, target.id, user.id, "follow_accepted")   # a chi aveva chiesto
    else:
        db.delete(req)
    db.commit()
    return {"pending_requests": pending_count(db, user), "relation": relation(db, user, target)}
