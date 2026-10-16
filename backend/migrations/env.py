from logging.config import fileConfig

from alembic import context
from sqlalchemy import create_engine, pool, text

from app import models  # noqa: F401  (registra i modelli sul metadata)
from app.config import DATABASE_URL, engine_kwargs
from app.db import Base

config = context.config
# Solo da riga di comando (alembic.ini presente): all'avvio dell'app non tocchiamo i log di uvicorn.
if config.config_file_name is not None:
    fileConfig(config.config_file_name, disable_existing_loggers=False)

url = config.attributes.get("url") or DATABASE_URL
is_sqlite = url.startswith("sqlite")
target_metadata = Base.metadata


def run_migrations_offline() -> None:
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        render_as_batch=is_sqlite,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    engine = create_engine(url, poolclass=pool.NullPool, **engine_kwargs(url))
    with engine.connect() as connection:
        if not is_sqlite:
            # Se due macchine partono insieme, una sola esegue le migrazioni (l'altra aspetta).
            connection.execute(text("select pg_advisory_lock(727315)"))
            connection.commit()
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            render_as_batch=is_sqlite,  # SQLite non supporta ALTER complessi: Alembic ricrea la tabella
            compare_type=True,
        )
        with context.begin_transaction():
            context.run_migrations()
    engine.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
