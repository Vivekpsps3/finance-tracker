# SQLite backup and restore

The ledger and uploaded tax documents live in SQLite. Paths:

| Mode | Default DB file |
|------|-----------------|
| Local dev (`make dev`) | `backend/finance.db` |
| Docker Compose | `data/finance.db` |

`DATABASE_URL` can point elsewhere. These files are gitignored; you are
responsible for backups.

## Backup (recommended before upgrades or imports)

**While the API is stopped** (avoids partial writes):

```bash
cp data/finance.db "data/finance.db.bak-$(date +%Y%m%d-%H%M%S)"
```

For local dev, replace `data/finance.db` with `backend/finance.db`.

Optional: copy WAL sidecar if present:

```bash
cp -a data/finance.db data/finance.db-wal data/finance.db-shm backup-dir/ 2>/dev/null || true
```

With the API running, SQLite online backup is possible but not scripted here; stopping `make dev` is simplest for a personal app.

## Restore

1. Stop the API (`Ctrl+C` on `make dev` or `make backend`).
2. Replace the database file:

```bash
mv data/finance.db data/finance.db.old   # optional safety rename
cp /path/to/finance.db.bak-YYYYMMDD data/finance.db
```

3. Start the API again. Schema is upgraded on startup via Alembic when using a file DB (`ALEMBIC_STRICT=1` by default).

## What to back up

| Item | Path |
|------|------|
| Dev ledger DB | `backend/finance.db` |
| Docker ledger DB | `data/finance.db` |
| Env secrets | `backend/.env` (not in git) |
| Planning runs & profiles | Inside `finance.db` (`planning_assumption_profiles`, `planning_scenario_runs`) — speculative MC results, not ledger truth (SEC-009) |
| Tax documents | Inside `finance.db` (`tax_documents.file_bytes`) |

## `make reset-db` vs backup

| Command | Effect |
|---------|--------|
| **`make reset-db`** | **Deletes** `backend/finance.db` (and only that path). All ledger, transactions, and planning runs are gone. Use for a fresh schema on next start—not for preserving data. |
| **Backup (`cp` above)** | **Copies** the DB file so you can restore later. Always back up before risky imports or schema experiments. |

There is no undo for `reset-db`. If you need an empty DB, prefer renaming the file (`mv finance.db finance.db.old`) instead of deleting when you might want the data back.

## Related

- Reset empty DB: `make reset-db` (destructive; see table above).
- Production: set `API_KEY` or `FINANCE_API_KEY` when the API is not localhost-only (see `README.md`).
