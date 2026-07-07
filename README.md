# Personal Finance Tracker

Personal finance app: balance-sheet net worth (assets & liabilities), portfolio with cached/live prices, transactions and bank CSV import, recurring cashflow (income / fixed expenses / subscriptions), planning Monte Carlo, and app-native multi-user auth—Angular 19 + FastAPI + SQLite.

## Quick start

```bash
make install   # Python venv + npm (first time only)
make dev       # Backend :8000 + frontend :4200
```

Open **http://localhost:4200** (dev proxy talks to the API). Create the first admin on `/login`, then create/unlock your vault. Finance plaintext stays in the browser; the backend stores encrypted records.

| Command | What it does |
|---------|----------------|
| `make help` | All targets |
| `make backend` | API only → http://127.0.0.1:8000/docs |
| `make frontend` | UI only |
| `make test` | pytest + frontend tests |
| `make docker-up` | Full website → http://127.0.0.1:8080 |
| `make clean` | Caches / dist (keeps your `finance.db`) |

Details: **[docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)**

## Features

- **Dashboard** — Current net worth, period-filtered insights/charts
- **Transactions** — Income & expenses, browser-side bank CSV import (Capital One, Chase, Amex, Citi, X Money; preview + dedupe)
- **Income / fixed expenses / subscriptions** — Recurring cashflow configuration (does not change net worth)
- **Balance sheet** — Manual assets & liabilities that drive net worth (`/balance-sheet`)
- **Portfolio** — Holdings CRUD and manual/imported prices; server-side Fidelity import is retired until it is moved client-side
- **Investment insights** — Client-side growth / withdrawal-rate views from portfolio value
- **Calendar** — Daily transaction summary
- **Monte Carlo** (`/planning`) — Net worth fan chart, tunable assumptions from your ledger (speculative; does not change net worth or ledger)
- **Auth / vault / admin** — Session login, encrypted vault setup/unlock/recovery, signup after first admin, `/admin/users` for admins

## Tech stack

| Layer | Stack |
|-------|--------|
| Frontend | Angular 19, Tailwind, Chart.js, RxJS |
| Backend | FastAPI, SQLAlchemy, SQLite, Alembic |
| Prices | Memory → Redis (optional) → SQLite EOD → yfinance |

## Project layout

```
finance-tracker/
  Makefile
  backend/          # FastAPI (routers/, services/, models.py)
  frontend/         # Angular app
  docs/             # Architecture, data model, frontend, deploy
```

Doc index: **[docs/README.md](docs/README.md)** · Agent handoff: **[AGENTS.md](AGENTS.md)**

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
| `API_KEY` / `FINANCE_API_KEY` | unset. Optional extra gate for non-browser clients; browser app uses session cookies |
| `SESSION_COOKIE_SECURE` | set `1` on HTTPS |
| `ALEMBIC_STRICT` | `1` (default): fail startup if Alembic upgrade fails on file DB |
| `PLAID_*` | **Not implemented** — reserved in `.env.example`; bank data via CSV import only |

## Data model

Adding banks: **[docs/ADDING_A_BANK_IMPORT.md](docs/ADDING_A_BANK_IMPORT.md)**. See **[docs/DATA_MODEL.md](docs/DATA_MODEL.md)** for table and formula details.

- **Net worth** = manual assets + portfolio market value − liabilities (computed client-side after vault unlock).
- **Transactions** — income, expenses, and browser-side card CSV imports for tracking; not part of net worth.
- **Recurring cashflow** — job income, fixed expenses, subscriptions; cashflow views only.
- **Planning** — speculative; does not mutate balance sheet or transactions.

Local database: `backend/finance.db` (not committed; see `.gitignore`). Docker default: `data/finance.db`.

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

See **[docs/DEPLOY.md](docs/DEPLOY.md)**. In short: TLS in front of the web container, create first admin at `/login`, set `CORS_ORIGINS` and `SESSION_COOKIE_SECURE=1`, back up the SQLite file.

## Troubleshooting

- If the UI shows API errors, confirm the backend is running on `127.0.0.1:8000`, restart `ng serve`, and check `frontend/proxy.conf.js`.
- If you are not logged in, open `/login` (bootstrap first admin on an empty DB).
