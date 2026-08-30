#!/usr/bin/env bash
set -euo pipefail

data_dir="${FINANCE_DATA_DIR:-./data}"
db_file="${data_dir}/finance.db"
backup_dir="${FINANCE_BACKUP_DIR:-${data_dir}/backups}"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"

mkdir -p "${backup_dir}"

if [[ ! -f "${db_file}" ]]; then
  echo "No SQLite database found at ${db_file}; skipping backup."
  exit 0
fi

backup_file="${backup_dir}/finance.db.${timestamp}.bak"

python3 - "${db_file}" "${backup_file}" <<'PY'
import sqlite3
import sys

src_path, dest_path = sys.argv[1:3]
src = sqlite3.connect(src_path)
try:
    dest = sqlite3.connect(dest_path)
    try:
        src.backup(dest)
    finally:
        dest.close()
finally:
    src.close()
PY

echo "Backed up ${db_file} to ${backup_file}"
