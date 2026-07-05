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

cp -a "${db_file}" "${backup_file}"

for suffix in wal shm journal; do
  sidecar="${db_file}-${suffix}"
  if [[ -f "${sidecar}" ]]; then
    cp -a "${sidecar}" "${backup_file}-${suffix}"
  fi
done

echo "Backed up ${db_file} to ${backup_file}"
