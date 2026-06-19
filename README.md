# Personal Finance Tracker

Personal finance app: transactions, bank import, portfolio with cached/live prices, net worth, charts, and calendar—Angular 19 + FastAPI.

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
- **Transactions** — CRUD, **bank import** (Capital One CSV; preview + dedupe), search/export
- **Portfolio** — Holdings CRUD, refresh prices, check symbol before add
- **Calendar** — Daily transaction summary

Adding banks: **[docs/ADDING_A_BANK_IMPORT.md](docs/ADDING_A_BANK_IMPORT.md)**

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

## Data model

- **Cash** = income − expenses from transactions (not auto-adjusted when you add holdings).
- **Net worth** = cash + current portfolio market value.
- **History** — snapshots on transaction/holding changes; charts can filter by period on the client.

Local database: `backend/finance.db` (not committed; see `.gitignore`).

## Tests & CI-style check

```bash
make test-backend
cd frontend && npx ng build --configuration development
```

## Production checklist

- Set `CORS_ORIGINS` and `DATABASE_URL` for your host
- HTTPS in front of the API; **add auth** if not localhost-only
- Consider PostgreSQL for multi-user deployments

## Troubleshooting

- UI blank / API errors: **[docs/UI_DEBUG_REPORT.md](docs/UI_DEBUG_REPORT.md)** (CORS, proxy, `ng serve`)
- UI smoke test: `cd frontend && npm run debug:ui` (with dev server running)