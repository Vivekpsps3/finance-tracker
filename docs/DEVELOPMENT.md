# Development guide

## Prerequisites

- **Python 3.11+** (3.12 OK)
- **Node.js 20+** and npm
- **make** (GNU Make)

Optional: Redis for shared EOD price cache (`REDIS_URL` in `backend/.env`).

## Quick start

From the repo root:

```bash
make install   # once
make dev       # API + UI
```

| URL | Purpose |
|-----|---------|
| http://localhost:4200 | Angular app (dev proxy → API) |
| http://127.0.0.1:8000/docs | OpenAPI / Swagger |
| http://127.0.0.1:8000/api/health | Health check |

The UI calls the API at **`/api/...`** (see `environment.development.ts` `apiUrl: '/api'`). `proxy.conf.js` forwards `/api/**` to the backend. **Restart `ng serve` after proxy changes** (a stale dev server keeps serving HTML for `/api/*`).

```bash
cd frontend && npm run verify:proxy   # expects ng serve on :4200
```

## Make targets

See `make help`. Common:

- `make backend` / `make frontend` — run one side only
- `make test` — pytest + `ng test` (frontend needs a browser; set `CHROME_BIN` if ChromeHeadless is missing)
- `make clean` — caches and `dist`; does **not** delete `finance.db` or `node_modules`
- `make build` — production frontend build

Override ports:

```bash
make dev API_PORT=8001 WEB_PORT=4300
```

## Backend layout

```
backend/
  main.py          # uvicorn entry
  app.py           # FastAPI app
  database.py      # engine, get_db
  models.py        # SQLAlchemy
  schemas.py       # Pydantic
  routers/         # HTTP routes
  services/        # domain + market_data + planning/analytics
  tax_rulesets/    # JSON tax bracket files for planning tools
  import_parsers/  # bank CSV parsers (wired via routers/imports.py)
  .env.example     # copy to .env (optional)
```

Local DB default: `backend/finance.db` (gitignored).

Wipe all local data and start fresh:

```bash
make reset-db   # stop the API first if it is running
make backend    # creates empty tables via init_database()
```

### Database initialization order (SQLite)

On API startup, `init_database()` in `database.py` runs in order:

1. **`Base.metadata.create_all`** — creates tables from current SQLAlchemy models.
2. **`migrations.run_sqlite_migrations`** — legacy idempotent column/table patches for older local DBs.
3. **Alembic `upgrade head`** — file-backed DBs only (`:memory:` skips Alembic). Revision scripts use inspector guards so reruns are safe if `create_all` already applied schema.

If Alembic fails, the API still starts but logs a warning; check logs after upgrading dependencies or pulling new revisions. Planning tables (`planning_*`) are ensured via `migrations.py`; newer Alembic revisions may add brokerage/planning columns on existing files.

## Frontend layout

```
frontend/
  src/app/         # features + shared/ui
  proxy.conf.js    # dev API proxy
  scripts/debug-ui.mjs
```

Debug UI (with `make frontend` running):

```bash
cd frontend && npm run debug:ui
```

## Environment

Copy `backend/.env.example` → `backend/.env` if you need custom CORS, Redis, log levels, or Plaid credentials.

### Plaid Integration

Plaid is used for secure bank account linking.

Required variables:

- `PLAID_CLIENT_ID`
- `PLAID_SECRET`
- `PLAID_ENV` (sandbox | development | production)
- `PLAID_PRODUCTS` (e.g. transactions)
- `PLAID_COUNTRY_CODES` (e.g. US)

See `backend/.env.example` for the full template. Never commit your real `.env` file.

## Tests

```bash
make test-backend
cd frontend && npx ng build --configuration development
```

## More docs

See [docs/README.md](./README.md) — frontend conventions, bank imports, debugging, backlog.

## Production note

This repo targets **local / single-user** use. Do not expose the API on the public internet without authentication. See README production checklist.