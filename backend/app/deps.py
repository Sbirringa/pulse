"""Dipendenze condivise tra i moduli delle API: utente corrente, rate limit, accesso admin."""
import hmac

from fastapi import Depends, Header, HTTPException, Request
from sqlalchemy.orm import Session

from .config import ADMIN_KEY, COOKIE_NAME, RATE_LIMIT_ENABLED
from .db import get_db
from .models import User
from .security import limiter, read_session, session_matches


def client_ip(request: Request) -> str:
    # Su Fly.io il proxy imposta Fly-Client-IP (e sovrascrive quello inviato dal client).
    return request.headers.get("fly-client-ip") or (request.client.host if request.client else "?")


def limit(name: str, count: int, seconds: int):
    """Rate limit per IP."""

    def dependency(request: Request) -> None:
        if RATE_LIMIT_ENABLED and not limiter.allow(f"{name}:{client_ip(request)}", count, seconds):
            raise HTTPException(429, "Troppe richieste. Riprova tra qualche minuto.")

    return dependency


def user_limit(key: str, count: int, seconds: int, message: str = "Stai andando troppo veloce. Riprova tra poco.") -> None:
    """Rate limit per utente (da chiamare dentro l'endpoint)."""
    if RATE_LIMIT_ENABLED and not limiter.allow(key, count, seconds):
        raise HTTPException(429, message)


def current_user(request: Request, db: Session = Depends(get_db)) -> User:
    token = request.cookies.get(COOKIE_NAME)
    data = read_session(token) if token else None
    user = db.get(User, data["sub"]) if data else None
    if not user or user.is_banned or not session_matches(data, user.password_hash):
        raise HTTPException(401, "Sessione scaduta. Accedi di nuovo.")
    return user


def viewer(request: Request, db: Session = Depends(get_db)) -> User | None:
    """Chi sta guardando: l'utente se ha fatto l'accesso, altrimenti None (ospite).
    Gli ospiti possono solo leggere, con un limite di richieste per IP contro lo scraping."""
    token = request.cookies.get(COOKIE_NAME)
    data = read_session(token) if token else None
    user = db.get(User, data["sub"]) if data else None
    if user and (user.is_banned or not session_matches(data, user.password_hash)):
        user = None
    if user is None and RATE_LIMIT_ENABLED and not limiter.allow(f"guest:{client_ip(request)}", 240, 60):
        raise HTTPException(429, "Troppe richieste. Riprova tra qualche minuto.")
    return user


def admin_guard(request: Request, x_admin_key: str | None = Header(default=None), db: Session = Depends(get_db)) -> None:
    """Accesso alla moderazione: un utente amministratore che ha fatto l'accesso (dall'app),
    oppure la chiave ADMIN_KEY (da terminale, tools/moderate.py)."""
    if RATE_LIMIT_ENABLED and not limiter.allow(f"admin:{client_ip(request)}", 120, 60):
        raise HTTPException(429, "Troppe richieste.")
    if x_admin_key:
        if ADMIN_KEY and hmac.compare_digest(x_admin_key, ADMIN_KEY):
            return
        raise HTTPException(403, "Chiave admin non valida.")
    token = request.cookies.get(COOKIE_NAME)
    data = read_session(token) if token else None
    user = db.get(User, data["sub"]) if data else None
    if user and not user.is_banned and user.is_admin and session_matches(data, user.password_hash):
        return
    raise HTTPException(403, "Riservato agli amministratori.")
