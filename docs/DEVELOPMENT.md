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

On first launch with an empty DB, open `/login`, create the first admin account,
then create a vault at `/vault/setup`. Normal finance routes require vault unlock.

### Optional API key (non-browser clients)

If `API_KEY` or `FINANCE_API_KEY` is set in `backend/.env`, every `/api/*` route except **`GET /api/health`** also requires `X-API-Key: <key>` or `Authorization: Bearer <key>`. Leave both unset for normal local browser dev (`make dev`). The web app uses **session cookies + CSRF**, not a baked-in frontend API key.

The UI calls the API at **`/api/...`** (see `environment.development.ts` `apiUrl: '/api'`). `proxy.conf.js` forwards `/api/**` to the backend. **Restart `ng serve` after proxy changes** (a stale dev server keeps serving HTML for `/api/*`).

## Make targets

See `make help`. Common:

- `make backend` / `make frontend` — run one side only
- `make test` — pytest + `ng test` (frontend needs a browser; set `CHROME_BIN` if ChromeHeadless is missing)
- `cd frontend && npm run e2e` — Playwright smoke (start `make dev` first, or let Playwright reuse an existing dev server on :4200)
- `make docker-up` — full website on http://127.0.0.1:8080 with API private behind the web proxy (see [DEPLOY.md](./DEPLOY.md))
- `make docker-down` / `make docker-logs` / `make docker-config` — common Docker operations
- `make reset-db` — delete `backend/finance.db` only
- `make reset-docker-db` — delete `data/finance.db` for Docker
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
  schemas.py       # Pydantic (finance)
  schemas_auth.py / schemas_planning.py
  auth.py / api_auth.py
  routers/         # active HTTP routes (auth/admin, vault, health, market) plus
                   # retired plaintext finance routers gated for regression tests
  services/        # encrypted storage, market_data, legacy finance/cashflow/planning helpers
  import_parsers/  # legacy bank + Fidelity CSV parsers; active bank import is client-side
  .env.example     # copy to .env (optional)
```

Local DB default: `backend/finance.db` (gitignored). Override with `DATABASE_URL`.

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

If Alembic fails, the API fails startup by default (`ALEMBIC_STRICT=1`). Set
`ALEMBIC_STRICT=0` only for local recovery/debugging when you understand the
schema risk.

## Frontend layout

```
frontend/
  src/app/         # features + shared/ui + auth + services
  proxy.conf.js    # dev API proxy
```

Feature folders include dashboard, transactions, income, fixed-expenses,
subscriptions, assets-liabilities, portfolio, investment-insights, calendar,
taxes, planning, admin.

## Environment

Copy `backend/.env.example` → `backend/.env` if you need custom CORS, Redis, log levels, session cookie flags, or optional `API_KEY`.

**SEC-006:** Do not set `LOG_SQL=1` in production or on shared machines. SQL echo logs can include transaction amounts, categories, and account labels from the ledger.

### Plaid (not implemented)

There are **no** Plaid routes or SDK usage in the app today. Bank transactions come from **CSV import** ([ADDING_A_BANK_IMPORT.md](./ADDING_A_BANK_IMPORT.md)). Variables in `.env.example` are placeholders only; safe to omit for local dev. SimpleFIN is the intended future aggregation path.

See `backend/.env.example` for the full template. Never commit your real `.env` file.

## Tests

```bash
make test-backend
cd frontend && npx ng build --configuration development
```

## More docs

See [docs/README.md](./README.md) — frontend conventions, bank imports, deployment, and data model notes.

## Production note

This repo targets **self-hosted** use (often a single household on one host). The app has multi-user accounts with session auth; still do not expose the API without TLS and proper cookie settings. See [DEPLOY.md](./DEPLOY.md).
