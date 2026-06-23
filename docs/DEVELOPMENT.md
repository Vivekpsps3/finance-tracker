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
| http://127.0.0.1:8000/health | Health check |

Use **http://localhost:4200** in the browser so the dev proxy works (`environment.development.ts` uses `apiUrl: ''`).

## Make targets

See `make help`. Common:

- `make backend` / `make frontend` — run one side only
- `make test` — pytest + `ng test` (frontend needs Chrome)
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
  services/        # domain + market_data
  import_parsers/  # bank CSV parsers (wired via routers/imports.py)
  .env.example     # copy to .env (optional)
```

Local DB default: `backend/finance.db` (gitignored).

Wipe all local data and start fresh:

```bash
make reset-db   # stop the API first if it is running
make backend    # creates empty tables via init_database()
```

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