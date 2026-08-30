import os

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from models import Base


def _resolve_database_url(raw_url: str) -> str:
    """Keep relative SQLite files anchored to backend/, independent of process cwd."""
    if not raw_url.startswith("sqlite:///") or raw_url.startswith("sqlite:////") or ":memory:" in raw_url:
        return raw_url

    relative_path = raw_url.removeprefix("sqlite:///")
    if os.path.isabs(relative_path):
        return raw_url

    backend_dir = os.path.dirname(os.path.abspath(__file__))
    absolute_path = os.path.abspath(os.path.join(backend_dir, relative_path))
    return f"sqlite:///{absolute_path}"


SQLALCHEMY_DATABASE_URL = _resolve_database_url(os.getenv("DATABASE_URL", "sqlite:///./finance.db"))
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
        from alembic.config import Config
        from alembic import command
        import logging

        log = logging.getLogger(__name__)
        strict = os.getenv("ALEMBIC_STRICT", "1").lower() not in ("0", "false", "no")
        try:
            here = os.path.dirname(os.path.abspath(__file__))
            alembic_cfg = Config(os.path.join(here, "alembic.ini"))
            alembic_cfg.set_main_option("script_location", os.path.join(here, "alembic"))
            alembic_cfg.set_main_option("sqlalchemy.url", SQLALCHEMY_DATABASE_URL)
            command.upgrade(alembic_cfg, "head")
        except Exception as e:
            if strict:
                log.error("Alembic upgrade failed (ALEMBIC_STRICT=1): %s", e)
                raise
            log.warning("Alembic upgrade skipped or failed: %s", e)


def get_db():
    db = SessionLocal()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
