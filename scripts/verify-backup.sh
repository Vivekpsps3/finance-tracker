#!/usr/bin/env bash
# OPS-001: integrity-check a SQLite backup produced by backup-db.sh
set -euo pipefail

backup_file="${1:-}"
if [[ -z "${backup_file}" ]]; then
  echo "Usage: $0 /path/to/finance.db.TIMESTAMP.bak"
  exit 2
fi
if [[ ! -f "${backup_file}" ]]; then
  echo "Backup file not found: ${backup_file}"
  exit 1
fi

python3 - "${backup_file}" <<'PY'
import sqlite3
import sys

path = sys.argv[1]
conn = sqlite3.connect(path)
try:
    result = conn.execute("PRAGMA integrity_check").fetchone()
    if not result or result[0] != "ok":
        raise SystemExit(f"integrity_check failed: {result}")
    tables = {
        row[0]
        for row in conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
        )
    }
    print(f"integrity_check=ok tables={len(tables)}")
    for required in ("users", "encrypted_records", "alembic_version"):
        if required in tables:
            print(f"has_table:{required}")
finally:
    conn.close()
print(f"verify-backup: OK {path}")
PY
