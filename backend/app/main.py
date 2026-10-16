import html
import random
import re
from collections import Counter
from contextlib import asynccontextmanager
from datetime import date, datetime, timedelta, timezone
from uuid import uuid4
from zoneinfo import ZoneInfo

from fastapi import Depends, FastAPI, File, Form, HTTPException, Request, Response, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.gzip import GZipMiddleware
from pydantic import BaseModel, Field, ValidationError, field_validator
from sqlalchemy import and_, delete, func, or_, select, text, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .config import (
    PROPOSAL_GOAL,
    REPORT_HIDE_THRESHOLD,
    SOURCE_URL,
    TERMS_VERSION,
    MAX_POST_IMAGES,
    CONTACT_EMAIL,
    CONTROLLER_NAME,
    COOKIE_NAME,
    COOKIE_SECURE,
    IS_PROD,
    MIN_AGE,
    MIN_CITY_RESULTS,
    MIN_RESULTS,
    PRIVACY_VERSION,
    RATE_LIMIT_ENABLED,
    REGISTER_GLOBAL_HOUR,
    REGISTER_PER_IP_HOUR,
    SESSION_DAYS,
    STATIC_DIR,
)
from .crypto import nick_index
from .db import get_db
from .deps import admin_guard, client_ip, current_user, limit, viewer
from .media import MAX_UPLOAD_BYTES, delete_image_files
from .migrate import run_migrations
from .moderation import clean_topic, contains_blocked
from .places import is_city
from .local import declare, is_local
from .privacy import author_visible, can_see
from .search import sync_prefixes
from .places import router as places_router
from .people import user_by_nick
from .social import _process_uploads, _store_all, purge_user_content
from .social import router as social_router
from .profiles import me_extra
from .profiles import router as profiles_router
from . import votes as V
from .models import Follow, Image, Question, Report, User
from .notifications import router as notifications_router
from .debate import router as debate_router
from .trending import router as trending_router
from .polls import DURATIONS, _majority, _utc, secret_pct, compute_results, is_ended, question_out, questions_out, visible_to
from .security import (
    DUMMY_HASH,
    create_session,
    hash_secret,
    limiter,
    new_recovery_code,
    normalize_code,
    verify_secret,
)
from .seed_data import CATEGORIES, CITIES

ROME = ZoneInfo("Europe/Rome")
CITY_SET = set(CITIES)
CATEGORY_SET = set(CATEGORIES)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # crea o aggiorna lo schema (Alembic), anche su un database già esistente.
    # Nessun sondaggio "di Pulse": i sondaggi li creano solo le persone.
    run_migrations()
    yield


app = FastAPI(
    title="Pulse",
    lifespan=lifespan,
    docs_url=None if IS_PROD else "/api/docs",
    redoc_url=None,
    openapi_url=None if IS_PROD else "/api/openapi.json",
)

# File compressi (gzip): il codice dell'app e l'elenco dei comuni pesano circa 3 volte meno sul telefono
app.add_middleware(GZipMiddleware, minimum_size=1024, compresslevel=6)

# --------------------------------------------------------------------------------------------
# Sicurezza di base: header, errori in italiano, rate limit
# --------------------------------------------------------------------------------------------

CSP = (
    "default-src 'self'; img-src 'self' data: blob: https://tiles.openfreemap.org; "
    "style-src 'self' 'unsafe-inline'; script-src 'self'; "
    "connect-src 'self' https://tiles.openfreemap.org; worker-src 'self' blob:; font-src 'self'; "
    "frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
)


MAX_REQUEST_BYTES = MAX_POST_IMAGES * MAX_UPLOAD_BYTES + 1024 * 1024


@app.middleware("http")
async def security_headers(request: Request, call_next):
    # Upload di foto: rifiuta subito le richieste troppo grandi, prima di leggerle.
    if request.method == "POST" and request.headers.get("content-type", "").startswith("multipart/"):
        size = request.headers.get("content-length")
        if not size or not size.isdigit():
            return JSONResponse(status_code=411, content={"detail": "Richiesta non valida."})
        if int(size) > MAX_REQUEST_BYTES:
            return JSONResponse(status_code=413, content={"detail": "File troppo grandi."})
    try:
        response = await call_next(request)
    except RuntimeError as e:
        # il telefono ha chiuso la pagina mentre la risposta era in preparazione: niente da rispondere
        if str(e) == "No response returned." and await request.is_disconnected():
            return Response(status_code=499)
        raise
    h = response.headers
    h.setdefault("X-Content-Type-Options", "nosniff")
    h.setdefault("X-Frame-Options", "DENY")
    h.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    # posizione: solo per "usa la mia posizione" sulla mappa (calcolata nel browser, mai inviata)
    h.setdefault("Permissions-Policy", "geolocation=(self), camera=(), microphone=()")
    if not request.url.path.startswith("/api/docs"):
        h.setdefault("Content-Security-Policy", CSP)
    if request.url.path.startswith("/api/") and "cache-control" not in h:
        h["Cache-Control"] = "no-store"
    if IS_PROD:
        h.setdefault("Strict-Transport-Security", "max-age=31536000")
    return response


FIELD_MESSAGES = {
    "password": "La password deve avere tra 10 e 128 caratteri.",
    "new_password": "La nuova password deve avere tra 10 e 128 caratteri.",
    "title": "Il titolo deve avere tra 10 e 160 caratteri.",
    "description": "La descrizione può avere al massimo 600 caratteri.",
    "value": "Voto non valido.",
    "recovery_code": "Codice di recupero non valido.",
    "consent": "Per registrarti devi accettare i Termini e l'informativa privacy.",
}


def _first_error(exc) -> str:
    err = exc.errors()[0] if exc.errors() else {}
    msg = str(err.get("msg", ""))
    field = str(err["loc"][-1]) if err.get("loc") else ""
    if msg.startswith("Value error, "):
        return msg[len("Value error, "):]
    return FIELD_MESSAGES.get(field, "Dati non validi.")


@app.exception_handler(RequestValidationError)
async def validation_handler(_request: Request, exc: RequestValidationError):
    return JSONResponse(status_code=422, content={"detail": _first_error(exc)})


# --------------------------------------------------------------------------------------------
# Schemi
# --------------------------------------------------------------------------------------------

NICK_RE = re.compile(r"^[A-Za-z0-9_.-]{3,24}$")
RESERVED = {"admin", "administrator", "pulse", "moderatore", "moderator", "staff",
            "support", "root", "system", "anonimo"}
URL_RE = re.compile(r"https?://|www\.", re.IGNORECASE)


def _check_city(v: str | None) -> str | None:
    if v is None or not str(v).strip():
        return None
    v = str(v).strip()
    if not is_city(v):  # uno qualsiasi dei 7.896 comuni italiani
        raise ValueError("Città non valida: scegli un comune dall'elenco.")
    return v


class RegisterIn(BaseModel):
    nickname: str
    password: str = Field(min_length=10, max_length=128)
    city: str | None = None
    consent: bool  # obbligatorio: consenso esplicito all'informativa

    @field_validator("consent")
    @classmethod
    def _consent(cls, v: bool) -> bool:
        if v is not True:
            raise ValueError("Per registrarti devi accettare i Termini e l'informativa privacy.")
        return v

    @field_validator("nickname")
    @classmethod
    def _nick(cls, v: str) -> str:
        v = v.strip()
        if not NICK_RE.match(v):
            raise ValueError("Il nickname deve avere 3-24 caratteri: lettere, numeri, punto, trattino o underscore.")
        if v.lower() in RESERVED:
            raise ValueError("Questo nickname non è disponibile.")
        return v

    @field_validator("city")
    @classmethod
    def _city(cls, v):
        return _check_city(v)


class LoginIn(BaseModel):
    nickname: str = Field(max_length=40)
    password: str = Field(max_length=128)


class RecoverIn(BaseModel):
    nickname: str = Field(max_length=40)
    recovery_code: str = Field(max_length=40)
    new_password: str = Field(min_length=10, max_length=128)


class DeleteIn(BaseModel):
    password: str = Field(max_length=128)


class CityIn(BaseModel):
    city: str | None = None

    @field_validator("city")
    @classmethod
    def _city(cls, v):
        return _check_city(v)


class VoteIn(BaseModel):
    value: int
    # sondaggi di una città: True = "sono di qui", False = "sono di fuori" (se la città del profilo coincide, vale True)
    resident: bool | None = None

    @field_validator("value")
    @classmethod
    def _value(cls, v: int) -> int:
        if v not in (-1, 0, 1):
            raise ValueError("Voto non valido.")
        return v


class ProposalIn(BaseModel):
    title: str = Field(min_length=10, max_length=160)
    description: str = Field(default="", max_length=600)
    category: str
    scope: str = "national"
    duration_days: int | None = None  # 1, 3, 7, 30 giorni; None = senza scadenza
    city: str | None = None  # città scelta per un sondaggio locale (se vuota: quella del profilo)
    audience: str = "all"  # solo sondaggi di una città: all = votano tutti · local = solo chi è di lì

    @field_validator("audience")
    @classmethod
    def _audience(cls, v: str) -> str:
        if v not in ("all", "local"):
            raise ValueError("Scelta non valida per chi può votare.")
        return v

    @field_validator("city", mode="before")
    @classmethod
    def _city(cls, v):
        v = v.strip() if isinstance(v, str) else v
        if v and not is_city(v):
            raise ValueError("Città non valida: scegline una dall'elenco.")
        return v or None

    @field_validator("duration_days")
    @classmethod
    def _duration(cls, v: int | None) -> int | None:
        if v is not None and v not in DURATIONS:
            raise ValueError("Durata non valida.")
        return v

    @field_validator("title", "description", mode="before")
    @classmethod
    def _strip(cls, v):
        return v.strip() if isinstance(v, str) else v

    @field_validator("title", "description")
    @classmethod
    def _no_links(cls, v: str) -> str:
        if URL_RE.search(v):
            raise ValueError("Non inserire link nelle proposte.")
        return v

    @field_validator("category")
    @classmethod
    def _category(cls, v: str) -> str:
        topic = clean_topic(v, CATEGORIES)  # uno di quelli proposti o uno scritto da chi crea il sondaggio
        if not topic:
            raise ValueError("Scegli un argomento.")
        return topic

    @field_validator("scope")
    @classmethod
    def _scope(cls, v: str) -> str:
        if v not in ("national", "local"):
            raise ValueError("Ambito non valido.")
        return v


# --------------------------------------------------------------------------------------------
# Utilità
# --------------------------------------------------------------------------------------------


def set_session_cookie(response: Response, user: User) -> None:
    response.set_cookie(
        COOKIE_NAME,
        create_session(user.id, user.password_hash),
        max_age=SESSION_DAYS * 86400,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite="lax",
        path="/",
    )


def user_out(db: Session, user: User) -> dict:
    answered = V.answered(db, user)
    return {"nickname": user.nickname, "city": user.city, "answered": answered, **me_extra(db, user)}


def participants_map(db: Session, ids: list[int]) -> dict[int, int]:
    return {qid: sum(t.values()) for qid, t in V.tallies(db, ids).items()}



# --------------------------------------------------------------------------------------------
# API pubblica
# --------------------------------------------------------------------------------------------


@app.get("/api/health")
def health(db: Session = Depends(get_db)):
    db.execute(text("select 1"))
    return {"status": "ok"}


@app.get("/api/meta")
def meta():
    return {
        "cities": CITIES,
        "categories": CATEGORIES,
        "privacy": {
            "controller": CONTROLLER_NAME or None,
            "contact": CONTACT_EMAIL or None,
            "version": PRIVACY_VERSION,
            "min_age": MIN_AGE,
            "min_results": MIN_RESULTS,
            "min_city_results": MIN_CITY_RESULTS,
        },
        "source_url": SOURCE_URL or None,
        "terms_version": TERMS_VERSION,
        "report_threshold": REPORT_HIDE_THRESHOLD,
        "proposal_goal": PROPOSAL_GOAL,
    }


@app.get("/api/public/questions", dependencies=[Depends(limit("public-list", 60, 60))])
def public_questions(city: str | None = None, db: Session = Depends(get_db)):
    """Anteprima dei sondaggi per chi non è registrato: domande e partecipanti, senza risultati
    (i risultati si vedono dopo aver votato, per non influenzare l'opinione)."""
    cond = Question.scope == "national"
    if city and city in CITY_SET:
        cond = or_(cond, and_(Question.scope == "local", Question.city == city))
    items = [q for q in db.scalars(select(Question).where(Question.status == "approved", cond,
                                                         author_visible(Question.author_id, None)))
             if not is_ended(q)]
    random.shuffle(items)
    items.sort(key=lambda q: 0 if q.scope == "local" else 1)
    items = items[:20]
    counts = participants_map(db, [q.id for q in items])
    return [question_out(q, counts.get(q.id, 0)) for q in items]


@app.get("/api/public/questions/{qid}", dependencies=[Depends(limit("public", 60, 60))])
def public_question(qid: int, db: Session = Depends(get_db)):
    q = db.get(Question, qid)
    if not q or q.status != "approved" or not can_see(db, None, q.author_id):
        raise HTTPException(404, "Questione non trovata.")
    n = participants_map(db, [q.id]).get(q.id, 0)
    return question_out(q, n)


# --------------------------------------------------------------------------------------------
# Account
# --------------------------------------------------------------------------------------------


def register_limits(request: Request) -> None:
    if not RATE_LIMIT_ENABLED:
        return
    if not limiter.allow(f"register:{client_ip(request)}", REGISTER_PER_IP_HOUR, 3600):
        raise HTTPException(429, "Troppe registrazioni da questa rete. Riprova più tardi.")
    if not limiter.allow("register:global", REGISTER_GLOBAL_HOUR, 3600):
        raise HTTPException(429, "Troppe registrazioni in questo momento. Riprova tra qualche minuto.")


@app.post("/api/auth/register", status_code=201, dependencies=[Depends(register_limits)])
def register(body: RegisterIn, response: Response, db: Session = Depends(get_db)):
    key = body.nickname.lower()
    if db.scalar(select(User.id).where(User.nickname_key == nick_index(key))):
        raise HTTPException(409, "Nickname già in uso.")
    code = new_recovery_code()
    user = User(
        id=uuid4().hex,
        nickname=body.nickname,
        password_hash=hash_secret(body.password),
        recovery_hash=hash_secret(normalize_code(code)),
        city=body.city,
        consent_at=datetime.now(timezone.utc),
        privacy_version=PRIVACY_VERSION,
    )
    db.add(user)
    try:
        sync_prefixes(db, user)  # per trovarla nella ricerca mentre si scrive
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Nickname già in uso.")
    set_session_cookie(response, user)
    return {"user": user_out(db, user), "recovery_code": code}


@app.post("/api/auth/login", dependencies=[Depends(limit("login-ip", 30, 600))])
def login(body: LoginIn, request: Request, response: Response, db: Session = Depends(get_db)):
    key = body.nickname.strip().lower()
    if RATE_LIMIT_ENABLED and not limiter.allow(f"login:{client_ip(request)}:{key}", 8, 600):
        raise HTTPException(429, "Troppi tentativi. Riprova tra qualche minuto.")
    user = db.scalar(select(User).where(User.nickname_key == nick_index(key)))
    ok = verify_secret(user.password_hash if user else DUMMY_HASH, body.password)  # tempo costante
    if not user or not ok:
        raise HTTPException(401, "Nickname o password errati.")
    if user.is_banned:
        raise HTTPException(403, "Questo account è stato sospeso.")
    set_session_cookie(response, user)
    return {"user": user_out(db, user)}


@app.post("/api/auth/recover", dependencies=[Depends(limit("recover", 8, 3600))])
def recover(body: RecoverIn, response: Response, db: Session = Depends(get_db)):
    key = body.nickname.strip().lower()
    user = db.scalar(select(User).where(User.nickname_key == nick_index(key)))
    ok = verify_secret(user.recovery_hash if user else DUMMY_HASH, normalize_code(body.recovery_code))
    if not user or not ok:
        raise HTTPException(401, "Nickname o codice di recupero errati.")
    if user.is_banned:
        raise HTTPException(403, "Questo account è stato sospeso.")
    code = new_recovery_code()  # il vecchio codice viene bruciato
    user.password_hash = hash_secret(body.new_password)
    user.recovery_hash = hash_secret(normalize_code(code))
    db.commit()
    set_session_cookie(response, user)
    return {"user": user_out(db, user), "recovery_code": code}


@app.post("/api/auth/logout", status_code=204)
def logout(response: Response):
    response.delete_cookie(COOKIE_NAME, path="/")


@app.get("/api/me")
def me(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return user_out(db, user)


@app.patch("/api/me")
def update_me(body: CityIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    user.city = body.city
    db.commit()
    return user_out(db, user)


@app.post("/api/me/delete", status_code=204)
def delete_me(
    body: DeleteIn,
    response: Response,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    """Diritto alla cancellazione (GDPR art. 17) e revoca del consenso.

    Cancella account, risposte, post, commenti e foto. Un commento con risposte di altri resta come
    segnaposto "Commento eliminato" (senza testo, foto né autore). Le proposte ancora in moderazione
    vengono eliminate; quelle già pubblicate restano ma perdono ogni collegamento all'autore.
    """
    if RATE_LIMIT_ENABLED and not limiter.allow(f"delete:{user.id}", 5, 600):
        raise HTTPException(429, "Troppi tentativi. Riprova tra qualche minuto.")
    if not verify_secret(user.password_hash, body.password):
        raise HTTPException(401, "Password errata.")
    image_ids = purge_user_content(db, user.id)  # post, commenti e foto
    V.remove_user(db, user.id)
    gone = select(Question.id).where(Question.author_id == user.id, Question.status != "approved")
    image_ids += list(db.scalars(select(Image.id).where(Image.question_id.in_(gone))))
    db.execute(delete(Question).where(Question.author_id == user.id, Question.status != "approved"))
    db.execute(update(Question).where(Question.author_id == user.id).values(author_id=None))
    db.execute(delete(User).where(User.id == user.id))
    db.commit()
    delete_image_files(image_ids)  # dopo il commit: se il database fallisce, le foto restano
    response.delete_cookie(COOKIE_NAME, path="/")


# --------------------------------------------------------------------------------------------
# Questioni e voti
# --------------------------------------------------------------------------------------------


@app.get("/api/questions/next")
def next_questions(
    limit_n: int = 20,
    first: int | None = None,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    limit_n = max(1, min(limit_n, 50))
    voted = V.voted_ids(user)
    items = [q for q in db.scalars(select(Question).where(visible_to(user), Question.id.not_in(voted),
                                                       author_visible(Question.author_id, user)))
             if not is_ended(q)]
    random.shuffle(items)
    # le questioni della propria città passano davanti: sono quelle più "vicine"
    items.sort(key=lambda q: 0 if q.scope == "local" else 1)
    if first is not None:  # link condiviso: la questione ricevuta compare per prima
        for i, q in enumerate(items):
            if q.id == first:
                items.insert(0, items.pop(i))
                break
    return questions_out(db, items[:limit_n], user)


@app.post("/api/questions/{qid}/vote")
def vote(qid: int, body: VoteIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if RATE_LIMIT_ENABLED and not limiter.allow(f"vote:{user.id}", 120, 60):
        raise HTTPException(429, "Stai andando troppo veloce. Respira un attimo.")
    q = db.get(Question, qid)
    if not q or q.status != "approved" or not can_see(db, user, q.author_id):
        raise HTTPException(404, "Questione non trovata.")
    if is_ended(q):
        raise HTTPException(409, "Il sondaggio è concluso: guarda com'è finita.")
    # Tutti possono votare. Nei sondaggi di una città si dichiara se si è "di qui" o "di fuori":
    # nei risultati i due gruppi si vedono separati.
    # Sondaggi di una città: chi è "di qui" (città del profilo o dichiarata una volta) non deve dire niente.
    # Gli altri lo dicono al primo voto: "sono di qui" resta ricordato per tutta la città.
    resident = None
    if q.scope == "local":
        if is_local(db, user, q.city):
            resident = True
        elif body.resident is None:
            raise HTTPException(422, f"Dicci se sei di {q.city} o se voti da fuori.")
        elif body.resident:
            declare(db, user, q.city)
            resident = True
        elif q.audience == "local":
            raise HTTPException(403, f"Questo sondaggio è riservato a chi è di {q.city}.")
        else:
            resident = False
    try:
        V.cast(db, q, user, body.value, resident)
        db.commit()
    except IntegrityError:  # due richieste simultanee: la seconda aggiorna il voto della prima
        db.rollback()
        V.cast(db, q, user, body.value, resident)
        db.commit()
    return compute_results(db, q, user)


@app.get("/api/questions/{qid}/results")
def results(qid: int, user: User | None = Depends(viewer), db: Session = Depends(get_db)):
    q = db.get(Question, qid)
    if not q or q.status != "approved" or not can_see(db, user, q.author_id):
        raise HTTPException(404, "Questione non trovata.")
    if not is_ended(q):
        outsider = user is not None and q.scope == "local" and q.audience == "local" and not is_local(db, user, q.city)
        if not outsider and not V.has_voted(db, user, qid):  # si vedono dopo aver votato, per non influenzare
            raise HTTPException(403, "Vota per vedere i risultati.")
    return compute_results(db, q, user)


@app.get("/api/questions/{qid}")
def get_question(qid: int, user: User | None = Depends(viewer), db: Session = Depends(get_db)):
    """Un sondaggio completo (link condivisi, notifiche): leggibile anche da chi non è registrato."""
    q = db.get(Question, qid)
    if not q or (q.status != "approved" and (user is None or q.author_id != user.id)):
        raise HTTPException(404, "Sondaggio non trovato.")
    if not can_see(db, user, q.author_id):  # profilo privato: solo chi si segue a vicenda
        raise HTTPException(404, "Sondaggio non trovato.")
    return questions_out(db, [q], user)[0]


@app.delete("/api/questions/{qid}", status_code=204)
def delete_question(qid: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Chi ha creato un sondaggio può eliminarlo (spariscono anche voti, foto e segnalazioni)."""
    q = db.get(Question, qid)
    if not q or q.author_id != user.id:
        raise HTTPException(404, "Sondaggio non trovato.")
    image_ids = list(db.scalars(select(Image.id).where(Image.question_id == qid)))
    db.execute(delete(Report).where(Report.target_type == "question", Report.target_id == qid))
    V.remove_question(db, qid)
    db.delete(q)
    db.commit()
    delete_image_files(image_ids)


@app.get("/api/polls")
def list_polls(
    status: str = "open",
    before: int | None = None,
    author: str | None = None,
    city: str | None = None,
    following: bool = False,
    user: User | None = Depends(viewer),
    db: Session = Depends(get_db),
):
    """Elenco dei sondaggi, dal più recente. open: aperti · ended: conclusi ·
    author=<nickname>: quelli creati da una persona."""
    now = datetime.now(timezone.utc)
    q = select(Question).where(Question.status == "approved", author_visible(Question.author_id, user))
    if city:  # i sondaggi di una città
        if not is_city(city):
            raise HTTPException(422, "Città non valida.")
        q = q.where(Question.scope == "local", Question.city == city)
    if following:  # i sondaggi creati da chi segui
        if user is None:
            raise HTTPException(401, "Accedi per vedere i sondaggi di chi segui.")
        q = q.where(Question.author_id.in_(select(Follow.followee_id).where(
            Follow.follower_id == user.id, Follow.status == "accepted")))
    if author:
        q = q.where(Question.author_id == user_by_nick(db, author).id)
    elif status == "all":
        pass
    elif status == "ended":
        q = q.where(Question.ends_at.is_not(None), Question.ends_at <= now)
    else:
        q = q.where(or_(Question.ends_at.is_(None), Question.ends_at > now))
    if before:
        q = q.where(Question.id < before)
    rows = list(db.scalars(q.order_by(Question.id.desc()).limit(31)))
    has_more = len(rows) > 30
    rows = rows[:30]
    return {"items": questions_out(db, rows, user), "next": rows[-1].id if has_more and rows else None}


# --------------------------------------------------------------------------------------------
# Il tuo Pulse
# --------------------------------------------------------------------------------------------


def _streak(days: set[date]) -> int:
    today = datetime.now(ROME).date()
    cursor = today if today in days else today - timedelta(days=1)
    n = 0
    while cursor in days:
        n += 1
        cursor -= timedelta(days=1)
    return n


@app.get("/api/me/pulse")
def my_pulse(user: User = Depends(current_user), db: Session = Depends(get_db)):
    mine = V.my_votes(db, user)
    questions = {q.id: q for q in db.scalars(select(Question).where(Question.id.in_([m[0] for m in mine])))}
    rows = [(value, created, questions[qid]) for qid, value, created in mine if qid in questions]
    tallies = V.tallies(db, [q.id for _, _, q in rows])

    comparable = aligned = 0
    cats: Counter = Counter()
    recent = []
    days: set[date] = set()
    for my_value, created, q in rows:
        t = tallies.get(q.id, {})
        total = sum(t.values())
        cats[q.category] += 1
        days.add(_utc(created).astimezone(ROME).date())
        # La sintonia si misura con gli ALTRI: il proprio voto non deve entrare nella maggioranza,
        # altrimenti la percentuale risulta gonfiata (con pochi voti, decisivamente).
        others = dict(t)
        others[my_value] = others.get(my_value, 0) - 1
        others = {k: n for k, n in others.items() if n > 0}
        top = _majority(others)
        if sum(others.values()) >= MIN_RESULTS and top is not None:
            comparable += 1
            aligned += int(top == my_value)
        if len(recent) < 15:
            recent.append({
                "question_id": q.id, "title": q.title, "category": q.category,
                "mine": my_value, "total": total, "pct": secret_pct(t),
            })
    return {
        "answered": len(rows),
        "comparable": comparable,
        "aligned_pct": round(aligned * 100 / comparable) if comparable else None,
        "streak": _streak(days),
        "categories": [{"category": c, "answered": n} for c, n in cats.most_common(6)],
        "recent": recent,
        "min_results": MIN_RESULTS,
    }


# --------------------------------------------------------------------------------------------
# Proposte dei cittadini (moderate)
# --------------------------------------------------------------------------------------------


@app.post("/api/proposals", status_code=201)
def create_proposal(body: ProposalIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    _check_new_question(db, body, user)
    q = _new_question(db, body, user)
    db.commit()
    return {"id": q.id, "status": q.status}


def _check_new_question(db: Session, body: ProposalIn, user: User) -> None:
    if body.scope == "local" and not (body.city or user.city):
        raise HTTPException(422, "Scegli la città del sondaggio.")
    since = datetime.now(timezone.utc) - timedelta(days=1)
    recent = db.scalar(
        select(func.count()).select_from(Question)
        .where(Question.author_id == user.id, Question.created_at >= since)
    ) or 0
    if recent >= 3:
        raise HTTPException(429, "Hai già creato 3 sondaggi nelle ultime 24 ore.")
    if contains_blocked(body.title, body.description):
        raise HTTPException(422, "Il testo contiene parole offensive: riformula il sondaggio.")


def _new_question(db: Session, body: ProposalIn, user: User) -> Question:
    now = datetime.now(timezone.utc)
    q = Question(
        title=body.title, description=body.description, category=body.category,
        scope=body.scope, city=(body.city or user.city) if body.scope == "local" else None,
        audience=body.audience if body.scope == "local" else "all",
        status="approved", author_id=user.id,  # pubblicato subito: poi decidono le segnalazioni
        created_at=now, ends_at=now + timedelta(days=body.duration_days) if body.duration_days else None,
    )
    db.add(q)
    db.flush()
    if q.scope == "local" and q.audience == "local" and q.city:
        declare(db, user, q.city)  # chi riserva il sondaggio alla sua città dichiara di esserne
    return q


@app.post("/api/polls", status_code=201)
def create_poll(
    title: str = Form(...),
    description: str = Form(""),
    category: str = Form(...),
    scope: str = Form("national"),
    duration_days: int | None = Form(None),
    city: str = Form(""),
    audience: str = Form("all"),
    image: UploadFile | None = File(None),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    """Crea un sondaggio, con una foto facoltativa e una scadenza facoltativa. Si pubblica subito."""
    try:
        body = ProposalIn(title=title, description=description, category=category, scope=scope,
                          duration_days=duration_days or None, city=city or None, audience=audience)
    except ValidationError as e:
        raise HTTPException(422, _first_error(e))
    _check_new_question(db, body, user)
    has_image = image is not None and bool(image.filename or image.size)
    stored = _store_all(_process_uploads([image])) if has_image else []
    try:
        q = _new_question(db, body, user)
        for image_id, w, h in stored:
            db.add(Image(id=image_id, owner_id=user.id, question_id=q.id, position=0, width=w, height=h))
        db.commit()
    except Exception:
        db.rollback()
        delete_image_files([s[0] for s in stored])
        raise
    return questions_out(db, [q], user)[0]


@app.get("/api/me/proposals")
def my_proposals(user: User = Depends(current_user), db: Session = Depends(get_db)):
    rows = list(db.scalars(
        select(Question).where(Question.author_id == user.id).order_by(Question.created_at.desc()).limit(30)
    ))
    return [{**x, "status": q.status} for q, x in zip(rows, questions_out(db, rows, user))]


# --------------------------------------------------------------------------------------------
# Moderazione (chiave admin: vedi tools/moderate.py)
# --------------------------------------------------------------------------------------------


@app.get("/api/admin/pending", dependencies=[Depends(admin_guard)])
def admin_pending(db: Session = Depends(get_db)):
    rows = db.scalars(select(Question).where(Question.status == "pending").order_by(Question.id))
    return [
        {"id": q.id, "title": q.title, "description": q.description, "category": q.category,
         "scope": q.scope, "city": q.city}
        for q in rows
    ]


@app.post("/api/admin/questions/{qid}/{action}", dependencies=[Depends(admin_guard)])
def admin_moderate(qid: int, action: str, db: Session = Depends(get_db)):
    if action not in ("approve", "reject"):
        raise HTTPException(404, "Azione sconosciuta.")
    q = db.get(Question, qid)
    if not q:
        raise HTTPException(404, "Questione non trovata.")
    q.status = "approved" if action == "approve" else "rejected"
    db.commit()
    return {"id": q.id, "status": q.status}


app.include_router(social_router)  # Piazza: post, commenti, foto, segnalazioni
app.include_router(profiles_router)  # profili e follow
app.include_router(places_router)  # comuni e mappa
app.include_router(notifications_router)  # notifiche
app.include_router(debate_router)  # ragioni pro/contro e domanda del giorno
app.include_router(trending_router)  # in evidenza


# --------------------------------------------------------------------------------------------
# Frontend (React compilato) + anteprima per i link condivisi
# --------------------------------------------------------------------------------------------

if (STATIC_DIR / "assets").exists():
    app.mount("/assets", StaticFiles(directory=STATIC_DIR / "assets"), name="assets")


def _index_html(request: Request | None = None) -> str | None:
    path = STATIC_DIR / "index.html"
    if not path.exists():
        return None
    page = path.read_text(encoding="utf-8")
    if request is not None:
        # le anteprime dei link (WhatsApp, Telegram…) vogliono l'indirizzo completo dell'immagine
        base = str(request.base_url).rstrip("/")
        page = page.replace('content="/og.jpg"', f'content="{base}/og.jpg"')
    return page


NO_FRONTEND = HTMLResponse(
    "<h1>Pulse API attiva</h1><p>Il frontend non è stato compilato. "
    "Esegui <code>npm run build</code> in <code>frontend/</code> oppure <code>python run_local.py</code>.</p>",
    status_code=200,
)


@app.api_route("/q/{qid}", methods=["GET", "HEAD"], include_in_schema=False)
def shared_question(qid: int, request: Request, db: Session = Depends(get_db)):
    page = _index_html(request)
    if page is None:
        return NO_FRONTEND
    q = db.get(Question, qid)
    if q and q.status == "approved" and can_see(db, None, q.author_id):  # profilo privato: niente anteprima
        title = html.escape(f"Pulse · {q.title}", quote=True)
        desc = html.escape("Un sondaggio su Pulse: tu cosa ne pensi?", quote=True)
        # sostituisce titolo e descrizione generici (WhatsApp & co. leggono il primo che trovano)
        page = re.sub(r'<meta property="og:title"[^>]*>', f'<meta property="og:title" content="{title}">', page, count=1)
        page = re.sub(r'<meta property="og:description"[^>]*>', f'<meta property="og:description" content="{desc}">', page, count=1)
        page = re.sub(r"<title>.*?</title>", f"<title>{title}</title>", page, count=1, flags=re.S)
    return HTMLResponse(page)


@app.api_route("/{full_path:path}", methods=["GET", "HEAD"], include_in_schema=False)  # HEAD: alcuni lettori di anteprime controllano prima così
def spa(full_path: str, request: Request):
    if full_path.startswith("api/"):
        raise HTTPException(404, "Not found")
    if not STATIC_DIR.exists():
        return NO_FRONTEND
    candidate = (STATIC_DIR / full_path).resolve()
    if full_path and candidate.is_file() and STATIC_DIR.resolve() in candidate.parents:
        # immagine delle anteprime e icone: si possono tenere in cache (WhatsApp & co. le scaricano più in fretta)
        cache = {"Cache-Control": "public, max-age=86400"} if candidate.suffix in (".jpg", ".png", ".svg", ".ico") else None
        return FileResponse(candidate, headers=cache)
    page = _index_html(request)
    return HTMLResponse(page) if page else NO_FRONTEND
