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
- Snapshots (`NetWorthSnapshot`, `record_net_worth_snapshot`) run on **asset, liability, and holding** mutations—not on transaction or import changes.

### Transactions (income & expenses)

- Full **income and expense** ledger plus **bank CSV import** (`/imports/`, registry in `import_registry.py`).
- Used for calendar, dashboard period charts, and **monthly totals on the Transactions page**.
- **Does not** affect net worth or `record_net_worth_snapshot`.
- Period filters on the dashboard apply to **insights/charts**, not the net worth hero (always current).

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
- Dev proxy: `frontend/proxy.conf.js` (empty `apiUrl` in development).

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