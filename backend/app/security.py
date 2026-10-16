import hashlib
import os
import secrets
import threading
import time
from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError

from .config import SECRET_KEY, SESSION_DAYS

# Parametri Argon2id "OWASP minimum" (19 MiB): sicuri e leggeri anche su una VM da 256 MB.
_ph = PasswordHasher(time_cost=2, memory_cost=19456, parallelism=1)
DUMMY_HASH = _ph.hash("password-finta-per-pareggiare-i-tempi")


# Ogni hash Argon2 occupa ~19 MiB di RAM. FastAPI esegue gli endpoint sincroni su un pool di 40 thread:
# senza limite, 40 login simultanei = ~760 MiB → la VM da 256 MB va in crash (OOM).
# Il semaforo fa fare la fila agli hash in eccesso (al massimo ~4 × 19 MiB in uso).
HASH_CONCURRENCY = max(1, int(os.getenv("PULSE_HASH_CONCURRENCY", "4")))
_hash_slots = threading.BoundedSemaphore(HASH_CONCURRENCY)


def hash_secret(value: str) -> str:
    with _hash_slots:
        return _ph.hash(value)


def verify_secret(hashed: str, value: str) -> bool:
    with _hash_slots:
        try:
            return _ph.verify(hashed, value)
        except (VerificationError, InvalidHashError):
            return False


# --- Codice di recupero (l'unico modo di riprendere l'account senza email) -----------------

_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # niente 0/O, 1/I


def new_recovery_code() -> str:
    raw = "".join(secrets.choice(_ALPHABET) for _ in range(20))  # ~100 bit
    return "-".join(raw[i : i + 5] for i in range(0, 20, 5))


def normalize_code(code: str) -> str:
    return "".join(ch for ch in code.upper() if ch.isalnum())


# --- Sessione (JWT in cookie httpOnly) -----------------------------------------------------


def _stamp(password_hash: str) -> str:
    return hashlib.sha256(password_hash.encode()).hexdigest()[:12]


def create_session(user_id: str, password_hash: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user_id,
        "pv": _stamp(password_hash),  # cambia la password => le vecchie sessioni decadono
        "iat": now,
        "exp": now + timedelta(days=SESSION_DAYS),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm="HS256")


def read_session(token: str) -> dict | None:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
    except jwt.PyJWTError:
        return None


def session_matches(data: dict, password_hash: str) -> bool:
    return secrets.compare_digest(str(data.get("pv", "")), _stamp(password_hash))


# --- Rate limit in memoria (una sola istanza dell'app: vedi README) -----------------------


class RateLimiter:
    def __init__(self) -> None:
        self._hits: dict[str, deque] = defaultdict(deque)
        self._lock = threading.Lock()
        self._ops = 0

    def allow(self, key: str, limit: int, window: int) -> bool:
        now = time.monotonic()
        with self._lock:
            q = self._hits[key]
            while q and now - q[0] > window:
                q.popleft()
            if len(q) >= limit:
                return False
            q.append(now)
            self._ops += 1
            if self._ops % 2000 == 0:
                self._purge(now)
            return True

    def _purge(self, now: float) -> None:
        for k in [k for k, q in self._hits.items() if not q or now - q[-1] > 3600]:
            del self._hits[k]


limiter = RateLimiter()
