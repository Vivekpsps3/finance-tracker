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
    from migrations import run_sqlite_migrations

    run_sqlite_migrations(engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


init_database()