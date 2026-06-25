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
- **Transactions** — Income & expenses, **bank import** (Capital One CSV; preview + dedupe), monthly totals on the tab
- **Balance sheet** — Manual assets & liabilities that drive net worth (route: /balance-sheet)
- **Portfolio** — Holdings CRUD, **Fidelity positions CSV import** (per-account replace), refresh prices, check symbol before add
- **Calendar** — Daily transaction summary
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
| `PLAID_CLIENT_ID` | (required for Plaid) |
| `PLAID_SECRET` | (required for Plaid) |
| `PLAID_ENV` | `sandbox` |

## Data model

Adding banks: **[docs/ADDING_A_BANK_IMPORT.md](docs/ADDING_A_BANK_IMPORT.md)**. See **[docs/DATA_MODEL.md](docs/DATA_MODEL.md)** and **[AGENTS.md](AGENTS.md)** for agents.

- **Net worth** = manual assets + portfolio market value − liabilities (always current).
- **Transactions** — income, expenses, and card imports for tracking; not part of net worth.
- (Net worth history/snapshots removed for simplicity.)

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