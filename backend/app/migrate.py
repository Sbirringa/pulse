"""Migrazioni dello schema con Alembic.

All'avvio l'app esegue `upgrade head`: un database vuoto viene creato da zero, uno esistente viene
aggiornato all'ultima versione senza perdere dati.

Un database creato dalla prima versione di PULSE (tabelle fatte con create_all, senza tabella
`alembic_version`) viene riconosciuto e "adottato" come revisione 0001, poi aggiornato.

Per creare una nuova migrazione dopo aver modificato app/models.py (dalla cartella backend):
    .venv\\Scripts\\alembic revision --autogenerate -m "descrizione"
poi RILEGGI il file generato in migrations/versions prima di usarlo.
"""
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect
from sqlalchemy.pool import NullPool

from .config import BASE_DIR, DATABASE_URL, engine_kwargs, normalize_url

MIGRATIONS_DIR = BASE_DIR / "migrations"
LEGACY_REVISION = "0001"  # schema della v1 (create_all)


def alembic_config(url: str | None = None) -> Config:
    cfg = Config()
    cfg.set_main_option("script_location", str(MIGRATIONS_DIR))
    # L'URL passa negli attributi e non nelle opzioni: le password con "%" romperebbero l'interpolazione.
    cfg.attributes["url"] = normalize_url(url) if url else DATABASE_URL
    return cfg


def run_migrations(url: str | None = None) -> None:
    cfg = alembic_config(url)
    target = cfg.attributes["url"]
    probe = create_engine(target, poolclass=NullPool, **engine_kwargs(target))
    try:
        tables = set(inspect(probe).get_table_names())
    finally:
        probe.dispose()
    if "users" in tables and "alembic_version" not in tables:
        command.stamp(cfg, LEGACY_REVISION)
    command.upgrade(cfg, "head")
