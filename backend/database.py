import os

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from models import Base

SQLALCHEMY_DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./finance.db")
SQL_ECHO = os.getenv("LOG_SQL", "").lower() in ("1", "true", "yes")

_engine_kwargs = {"connect_args": {"check_same_thread": False}}
if SQLALCHEMY_DATABASE_URL.endswith(":memory:") or SQLALCHEMY_DATABASE_URL.rstrip("/").endswith(
    ":memory:"
):
    _engine_kwargs["poolclass"] = StaticPool

engine = create_engine(SQLALCHEMY_DATABASE_URL, echo=SQL_ECHO, **_engine_kwargs)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def init_database() -> None:
    Base.metadata.create_all(bind=engine)

    # Legacy SQLite migrations for very old column additions (transactions etc.)
    from migrations import run_sqlite_migrations
    run_sqlite_migrations(engine)

    # Automatic Alembic upgrade at startup (for new tables like brokerages, column adds, drops)
    # The migration uses inspector guards so it is safe even if create_all already created tables.
    if ":memory:" not in SQLALCHEMY_DATABASE_URL:
        try:
            from alembic.config import Config
            from alembic import command
            here = os.path.dirname(os.path.abspath(__file__))
            alembic_cfg = Config(os.path.join(here, "alembic.ini"))
            alembic_cfg.set_main_option("script_location", os.path.join(here, "alembic"))
            alembic_cfg.set_main_option("sqlalchemy.url", SQLALCHEMY_DATABASE_URL)
            command.upgrade(alembic_cfg, "head")
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning("Alembic upgrade skipped or failed: %s", e)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
