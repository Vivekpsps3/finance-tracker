import os
import sqlite3
from pathlib import Path

SCHEMA = """
CREATE TABLE IF NOT EXISTS notes (
  id INTEGER PRIMARY KEY,
  path TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  type TEXT,
  frontmatter TEXT NOT NULL,
  body TEXT NOT NULL,
  dates TEXT NOT NULL,
  mtime_ms INTEGER NOT NULL
);
CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
  title,
  body,
  path UNINDEXED,
  content='notes',
  content_rowid='id',
  tokenize='unicode61 remove_diacritics 2'
);
CREATE TABLE IF NOT EXISTS links (
  src_path TEXT NOT NULL,
  target TEXT NOT NULL,
  alias TEXT,
  heading TEXT,
  embed INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS index_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
"""

_db: sqlite3.Connection | None = None


def sqlite_path() -> str:
    path = os.environ.get("SQLITE_PATH", "data/app.db")
    if path != ":memory:":
        Path(path).parent.mkdir(parents=True, exist_ok=True)
    return path


def open_db() -> sqlite3.Connection:
    global _db
    if _db is None:
        path = sqlite_path()
        _db = sqlite3.connect(path, check_same_thread=False)
        _db.row_factory = sqlite3.Row
        if path != ":memory:":
            _db.execute("PRAGMA journal_mode=WAL")
        _db.execute("PRAGMA foreign_keys=ON")
        _db.execute("PRAGMA busy_timeout=5000")
        _db.executescript(SCHEMA)
    return _db


def close_db() -> None:
    global _db
    if _db is not None:
        _db.close()
        _db = None


def meta_get(key: str) -> str | None:
    row = open_db().execute("SELECT value FROM index_meta WHERE key = ?", (key,)).fetchone()
    return None if row is None else row["value"]


def meta_set(key: str, value: str) -> None:
    open_db().execute(
        "INSERT INTO index_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        (key, value),
    )
    open_db().commit()


def meta_del(key: str) -> None:
    open_db().execute("DELETE FROM index_meta WHERE key = ?", (key,))
    open_db().commit()
