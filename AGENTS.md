# Agent onboarding (read this first)

All coding agents must read this file **before** changing the repo. **Code is the source of truth**; docs explain intent and conventions.

## What this project is

Personal finance tracker (single-user, local-first): Angular 19 frontend, FastAPI + SQLite backend. Not production-multi-tenant without adding auth.

## Doc map

| Read when | Path |
|-----------|------|
| Setup & commands | [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md), root [README.md](README.md) |
| Doc index | [docs/README.md](docs/README.md) |
| Balance sheet rules | [docs/DATA_MODEL.md](docs/DATA_MODEL.md) |
| UI polish notes | [design-review/README.md](design-review/README.md) |
| Angular UI rules | [docs/FRONTEND.md](docs/FRONTEND.md) |
| UI debugging | [docs/UI_DEBUG_REPORT.md](docs/UI_DEBUG_REPORT.md) |
| Backlog (non-blocking) | [docs/ENGINEERING_BACKLOG.md](docs/ENGINEERING_BACKLOG.md) |
| Planning lab (speculative) | [docs/SPECULATIVE_ANALYTICS.md](docs/SPECULATIVE_ANALYTICS.md) |

## Repo layout

```
backend/     main.py, app.py, models.py, schemas.py, routers/, services/, migrations.py
frontend/    src/app/{dashboard,transactions,portfolio,calendar,assets-liabilities (balance-sheet route),...}
docs/        Human-oriented guides (keep in sync when behavior changes)
```

## Domain rules (critical)

### Net worth (balance sheet)

- **Net worth = (manual assets + portfolio market value) − liabilities.**
- **Do not** derive net worth from income/expense transactions or bank/card imports.
- **Portfolio** (`holdings` + market prices) is the investment asset slice; do not double-count brokerage cash as both a holding and a manual asset without user intent.
- Net worth is always **current** (computed on demand from assets + portfolio market value − liabilities). No history/snapshots (feature removed for simplicity).

### Transactions (income & expenses)

- Full **income and expense** ledger plus **bank CSV import** (`/api/imports/`, registry in `import_registry.py`).
- Used for calendar, dashboard period charts, and **monthly totals on the Transactions page**.
- **Does not** affect net worth or `record_net_worth_snapshot`.
- Period filters on the dashboard apply to **insights/charts**, not the net worth hero (always current).

## Speculative analytics & planning (implemented)

**What-if lab** is a single **Monte Carlo net worth** simulator (`mc_net_worth_paths`). Outputs are **not** ledger truth.

**Design reference:** [docs/SPECULATIVE_ANALYTICS.md](docs/SPECULATIVE_ANALYTICS.md). **Tables:** [docs/DATA_MODEL.md](docs/DATA_MODEL.md#planning-lab-speculative).

### Purpose

- Let the user explore uncertainty (markets, inflation, spending, tax brackets) and long horizons (FI/retirement, runway, depletion) using **current** balance sheet, portfolio, liabilities, and transaction history as **inputs**.
- Persist **assumption profiles** and **scenario runs** (seed, parameters, results) for reproducibility and comparison — separate from the ledger.

### Hard rules (same as production domain)

- Simulations **must not** write to `assets`, `liabilities`, `holdings`, or `transactions`, and **must not** change how `GET /api/net-worth/` is computed.
- Transaction aggregates are allowed only as **inputs** (e.g. average monthly spend, seasonality); they never become net worth.
- Do **not** reintroduce net-worth snapshots/history as a by-product of planning runs.
- Every planning/analytics API response should be clearly **speculative** (disclaimer + `as_of` for inputs). Tax outputs are **educational**, not filing advice; require user-configured jurisdiction/year rulesets.

### Architecture (as built)

| Layer | Location |
|-------|----------|
| REST | `backend/routers/planning.py` — `/api/planning/v1` (`GET /inputs`, `POST /runs`, profiles CRUD optional) |
| Snapshot | `backend/services/planning/snapshot.py`, `runner.py`, `tools_registry.py` (one tool) |
| Engine | `backend/services/analytics/monte_carlo.py` |
| UI | `frontend/src/app/planning/` — `/planning` Monte Carlo page + fan chart |
| Client API | `PlanningService` (alongside `FinanceService`) |

Read-only snapshots: `build_planning_snapshot()` + `snapshot_hash()` from `services/finance.compute_net_worth`, transactions summary, liabilities list. Runs persist in `planning_scenario_runs` with `input_snapshot_hash` and `input_as_of`.

### Tool inventory

Single registered tool: **`mc_net_worth_paths`** (`tools_registry.py`).

### Agent checklist when changing planning

1. Preserve ledger/net-worth invariants above.
2. Keep `tools_registry.py` and `runner.py` in sync; test in `backend/tests/test_planning.py`.
3. Run `make test-backend` and `npx ng build --configuration development`.

## Engineering conventions

### Backend

- Routers in `backend/routers/`; domain logic in `backend/services/finance.py` and `services/market_data.py`.
- Pydantic models in `schemas.py`; SQLAlchemy in `models.py`.
- SQLite schema drift: extend `backend/migrations.py` for existing DBs.
- Run tests: `make test-backend` from repo root.

### Frontend

- Standalone components, **OnPush**, shared primitives under `shared/ui` (`ui-*` selectors).
- Central HTTP/state: `FinanceService`; dashboard uses `loadDashboard()` for coordinated fetch.
- Design tokens: `frontend/src/theme/tokens.css`, `tailwind.config.js`.
- Dev proxy: `frontend/proxy.conf.js` (`/api/**`); `apiUrl: '/api'` in `environment.development.ts`.

## Safe change checklist

1. Read affected router, service, and Angular feature component.
2. Update API schema + `FinanceService` + models together (avoid half-migrated `cash` vs `other_assets`).
3. Update **README.md** data model section and **docs/FRONTEND.md** routes table when adding pages.
4. Run `make test-backend` and `cd frontend && npx ng build --configuration development`.

## Commands

```bash
make install   # once
make dev       # API :8000 + UI :4200
make test-backend
```

## Do not

- Expose the API publicly without authentication.
- Commit `backend/finance.db` or secrets.
- Break `FinanceService` method signatures without updating all callers and docs.