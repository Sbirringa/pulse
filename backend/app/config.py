"""Configurazione di Pulse.

Tutto arriva da variabili d'ambiente, con default pensati per lo sviluppo locale:
- senza DATABASE_URL usa SQLite (un file in backend/data/pulse.db)
- con DATABASE_URL (es. Neon) usa PostgreSQL
"""
import os
import secrets
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
ENV = os.getenv("PULSE_ENV", "development")
IS_PROD = ENV == "production"
DATA_DIR = Path(os.getenv("PULSE_DATA_DIR", str(BASE_DIR / "data")))


def normalize_url(url: str) -> str:
    """Neon/Heroku danno "postgres://" o "postgresql://": SQLAlchemy vuole il driver psycopg 3."""
    if url.startswith("postgres://"):
        return "postgresql+psycopg://" + url[len("postgres://"):]
    if url.startswith("postgresql://"):
        return "postgresql+psycopg://" + url[len("postgresql://"):]
    return url


def engine_kwargs(url: str) -> dict:
    """Opzioni di connessione comuni (app e migrazioni)."""
    if url.startswith("sqlite"):
        return {"connect_args": {"check_same_thread": False}}
    # compatibile anche con l'endpoint "pooled" di Neon (PgBouncer): niente prepared statement lato server
    return {"connect_args": {"prepare_threshold": None}}


def _database_url() -> str:
    url = os.getenv("DATABASE_URL", "").strip()
    if not url:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        return f"sqlite:///{(DATA_DIR / 'pulse.db').as_posix()}"
    return normalize_url(url)


def _secret_key() -> str:
    key = os.getenv("SECRET_KEY", "").strip()
    if key:
        return key
    if IS_PROD:
        raise RuntimeError("SECRET_KEY è obbligatoria in produzione (fly secrets set SECRET_KEY=...)")
    # In locale: genera una chiave una volta sola e la riusa, così le sessioni sopravvivono ai riavvii.
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    path = DATA_DIR / ".secret"
    if path.exists():
        return path.read_text().strip()
    key = secrets.token_urlsafe(48)
    path.write_text(key)
    return key


def _static_dir() -> Path:
    env = os.getenv("PULSE_STATIC_DIR")
    if env:
        return Path(env)
    for candidate in (BASE_DIR / "static", BASE_DIR.parent / "frontend" / "dist"):
        if candidate.exists():
            return candidate
    return BASE_DIR.parent / "frontend" / "dist"


def _data_key() -> bytes:
    """Chiave di cifratura dei dati (nomi, testi, foto). NON è nel database: sta in un secret separato.
    Se la perdi, nomi, testi e foto non sono più leggibili: conservane una copia sicura."""
    import base64

    raw = os.getenv("PULSE_DATA_KEY", "").strip()
    if not raw:
        if IS_PROD:
            raise RuntimeError("PULSE_DATA_KEY è obbligatoria in produzione (fly secrets set PULSE_DATA_KEY=...). "
                               "Generala con: python -c \"import secrets;print(secrets.token_urlsafe(32))\"")
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        path = DATA_DIR / ".datakey"
        if not path.exists():
            path.write_text(secrets.token_urlsafe(32))
        raw = path.read_text().strip()
    try:
        key = base64.urlsafe_b64decode(raw + "=" * (-len(raw) % 4))
    except Exception:
        key = b""
    if len(key) != 32:
        raise RuntimeError("PULSE_DATA_KEY non valida: deve essere 32 byte in base64 (usa secrets.token_urlsafe(32)).")
    return key


DATABASE_URL = _database_url()
DATA_KEY = _data_key()
IS_SQLITE = DATABASE_URL.startswith("sqlite")
SECRET_KEY = _secret_key()
ADMIN_KEY = os.getenv("ADMIN_KEY", "").strip()
STATIC_DIR = _static_dir()

# Soglie di trasparenza: sotto queste soglie i numeri sono segnalati come "provvisori"
# e il dato per città non viene mostrato (protegge i piccoli gruppi).
MIN_RESULTS = int(os.getenv("PULSE_MIN_RESULTS", "5"))
MIN_CITY_RESULTS = int(os.getenv("PULSE_MIN_CITY_RESULTS", "5"))

RATE_LIMIT_ENABLED = os.getenv("PULSE_RATE_LIMIT", "on").lower() != "off"

# --- Foto ------------------------------------------------------------------------------------
# "local": file in backend/data/media (sviluppo). "s3": storage compatibile S3, es. Tigris su Fly.io
# (`fly storage create` imposta da solo BUCKET_NAME, AWS_ENDPOINT_URL_S3, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY).
STORAGE_BACKEND = (os.getenv("PULSE_STORAGE", "").strip().lower()
                   or ("s3" if os.getenv("BUCKET_NAME") else "local"))
MEDIA_DIR = Path(os.getenv("PULSE_MEDIA_DIR", str(DATA_DIR / "media")))
S3_BUCKET = os.getenv("BUCKET_NAME", "").strip()
S3_ENDPOINT = os.getenv("AWS_ENDPOINT_URL_S3", "").strip() or None
S3_REGION = os.getenv("AWS_REGION", "auto").strip() or "auto"
if STORAGE_BACKEND not in ("local", "s3"):
    raise RuntimeError("PULSE_STORAGE deve essere 'local' oppure 's3'.")
if STORAGE_BACKEND == "s3" and not S3_BUCKET:
    raise RuntimeError("Storage S3 senza BUCKET_NAME: esegui `fly storage create` o imposta BUCKET_NAME.")
if IS_PROD and STORAGE_BACKEND == "local" and not os.getenv("PULSE_MEDIA_DIR"):
    # Sul disco di una macchina Fly i file spariscono a ogni deploy: le foto andrebbero perse.
    raise RuntimeError("In produzione le foto vanno su storage S3 (fly storage create) "
                       "oppure su un volume persistente indicato con PULSE_MEDIA_DIR.")

MAX_UPLOAD_MB = int(os.getenv("PULSE_MAX_UPLOAD_MB", "10"))       # per singola foto
MAX_POST_IMAGES = 4
MAX_IMAGE_PIXELS = 40_000_000                                      # es. 8000x5000: oltre si rifiuta
IMAGE_CONCURRENCY = max(1, int(os.getenv("PULSE_IMAGE_CONCURRENCY", "1")))  # elaborazioni simultanee (RAM)
POSTS_PER_DAY = int(os.getenv("PULSE_POSTS_PER_DAY", "5"))
# sostenitori che servono perché una proposta diventi un sondaggio per tutti
PROPOSAL_GOAL = max(2, int(os.getenv("PULSE_PROPOSAL_GOAL", "20")))
REPORT_HIDE_THRESHOLD = int(os.getenv("PULSE_REPORT_HIDE_THRESHOLD", "3"))  # segnalazioni → nascosto
# Registrazioni: in un'aula o su una rete universitaria centinaia di persone hanno lo stesso IP,
# quindi il limite per IP è largo; il tetto globale ferma comunque un'ondata di bot.
REGISTER_PER_IP_HOUR = int(os.getenv("PULSE_REGISTER_PER_IP_HOUR", "60"))
REGISTER_GLOBAL_HOUR = int(os.getenv("PULSE_REGISTER_GLOBAL_HOUR", "1000"))

# GDPR: titolare del trattamento e contatto, mostrati nell'informativa (/privacy).
# In produzione sono obbligatori: l'app non parte senza.
CONTROLLER_NAME = os.getenv("PULSE_CONTROLLER_NAME", "").strip()
CONTACT_EMAIL = os.getenv("PULSE_CONTACT_EMAIL", "").strip()
if IS_PROD and not (CONTROLLER_NAME and CONTACT_EMAIL):
    raise RuntimeError(
        "In produzione servono PULSE_CONTROLLER_NAME e PULSE_CONTACT_EMAIL (titolare e contatto privacy)."
    )
PRIVACY_VERSION = "2026-10-16f"  # cambiala quando modifichi l'informativa (16/10: ragioni sotto i sondaggi)
MIN_AGE = int(os.getenv("PULSE_MIN_AGE", "14"))
# Indirizzo pubblico del codice (es. https://github.com/tuonome/pulse). Vuoto = nell'app compare "In arrivo".
_src = os.getenv("PULSE_SOURCE_URL", "").strip()
SOURCE_URL = _src if _src.startswith("https://") else ""
# Indirizzo ufficiale del sito (es. openpulse.it). Se impostato, chi apre l'app da NOME.fly.dev o da www.
# viene portato lì in automatico. Vuoto = nessun reindirizzamento (in locale).
CANONICAL_HOST = (os.getenv("PULSE_CANONICAL_HOST", "").strip().lower()
                  .removeprefix("https://").removeprefix("http://").strip("/"))
TERMS_VERSION = "2026-10-16"  # cambiala quando modifichi i Termini di utilizzo
COOKIE_NAME = "pulse_session"
COOKIE_SECURE = IS_PROD
SESSION_DAYS = 30
