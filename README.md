# Personal Finance Tracker

Personal finance app: balance-sheet net worth (assets & liabilities), portfolio with cached/live prices, income logging, charts, and calendar—Angular 19 + FastAPI.

## Quick start

```bash
make install   # Python venv + npm (first time only)
make dev       # Backend :8000 + frontend :4200
```

Open **http://localhost:4200** (dev proxy talks to the API).

| Command | What it does |
|---------|----------------|
| `make help` | All targets |
| `make backend` | API only → http://127.0.0.1:8000/docs |
| `make frontend` | UI only |
| `make test` | pytest + frontend tests |
| `make clean` | Caches / dist (keeps your `finance.db`) |

Details: **[docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)**

## Features

- **Dashboard** — Current net worth, period-filtered insights/charts, coordinated loading
- **Net worth history** — Manual snapshots of current balance-sheet valuation
- **Transactions** — Income & expenses, **bank import** (Capital One CSV; preview + dedupe), monthly totals on the tab
- **Balance sheet** — Manual assets & liabilities that drive net worth (route: /balance-sheet)
- **Portfolio** — Holdings CRUD, **Fidelity positions CSV import** (per-account replace), refresh prices, check symbol before add
- **Calendar** — Daily transaction summary
- **Tax Center** — Store official W-2/1099/1040/etc. documents and view yearly summaries
- **Monte Carlo** (`/planning`) — Net worth fan chart, tunable assumptions from your ledger (speculative; does not change net worth or ledger)

## Tech stack

| Layer | Stack |
|-------|--------|
| Frontend | Angular 19, Tailwind, Chart.js, RxJS |
| Backend | FastAPI, SQLAlchemy, SQLite |
| Prices | Memory → Redis (optional) → SQLite EOD → yfinance |

## Project layout

```
finance-tracker/
  Makefile
  backend/          # FastAPI (routers/, services/, models.py)
  frontend/         # Angular app
  docs/             # Development, frontend conventions, imports
```

Doc index: **[docs/README.md](docs/README.md)**

## Configuration

Optional: `backend/.env` from **`backend/.env.example`**

| Variable | Default |
|----------|---------|
| `DATABASE_URL` | `sqlite:///./finance.db` |
| `CORS_ORIGINS` | `http://localhost:4200,http://127.0.0.1:4200` |
| `PRICE_CACHE_TTL` | `120` (seconds, in-memory) |
| `EOD_CACHE_HOURS` | `24` |
| `REDIS_URL` | unset (SQLite `ticker_quotes` still used) |
| `LOG_LEVEL` | `INFO` |
| `API_KEY` / `FINANCE_API_KEY` | unset (local dev). When set, all `/api` routes except `GET /api/health` require `X-API-Key` or `Authorization: Bearer <key>` |
| `ALEMBIC_STRICT` | `1` (default): fail startup if Alembic upgrade fails on file DB. Set `0` to log warning only |
| `PLAID_*` | **Not implemented** — reserved in `.env.example`; bank data via CSV import only |

## Data model

Adding banks: **[docs/ADDING_A_BANK_IMPORT.md](docs/ADDING_A_BANK_IMPORT.md)**. See **[docs/DATA_MODEL.md](docs/DATA_MODEL.md)** for table and formula details.

- **Net worth** = manual assets + portfolio market value − liabilities (always current).
- **Transactions** — income, expenses, and card imports for tracking; not part of net worth.
- **Net worth snapshots** — observed balance-sheet valuations over time; not transaction rollups.

Local database: `backend/finance.db` (not committed; see `.gitignore`).

## Tests & CI-style check

```bash
make test-backend
cd frontend && npx ng build --configuration development
```

## Docker website

```bash
docker compose up --build
```

Open http://127.0.0.1:8080. The `web` container serves Angular and proxies
`/api` to the private FastAPI container. Docker stores SQLite at
`data/finance.db`; local dev defaults to `backend/finance.db`. Override with
`DATABASE_URL` and a matching Compose volume when needed.

## Production checklist

- Set `CORS_ORIGINS` and `DATABASE_URL` for your host
- HTTPS in front of the API; set **`API_KEY`** or **`FINANCE_API_KEY`** if the API is reachable beyond localhost (middleware in `api_auth.py`)
- Consider PostgreSQL for multi-user deployments

## Troubleshooting

- If the UI shows API errors, confirm the backend is running on `127.0.0.1:8000`, restart `ng serve`, and check `frontend/proxy.conf.js`.
