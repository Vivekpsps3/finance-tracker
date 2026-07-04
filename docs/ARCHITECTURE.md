# Architecture (one page)

Local-first personal finance: **Angular 19** UI, **FastAPI** API, **SQLite** persistence, and app-native user accounts.

## Three data planes (do not mix)

| Plane | What it is | Writes | Reads for |
|-------|------------|--------|-----------|
| **Balance sheet** | per-user `assets`, `liabilities`, `holdings` + market prices | CRUD + Fidelity CSV (holdings per brokerage account), manual net worth snapshots | **Net worth** (`GET /api/net-worth/`) and observed history |
| **Transactions ledger** | per-user `transactions` (income/expense, `source=import` from bank CSV) | Manual CRUD + bank import preview/commit | Dashboard period charts, calendar, planning **inputs** (averages) |
| **Tax documents** | per-user `tax_documents` official document vault + structured values | Upload/download/delete docs, yearly summary | Tax Center (`/taxes`) |
| **Planning (speculative)** | `planning_assumption_profiles`, `planning_scenario_runs` | Profiles + run results only | Monte Carlo UI at `/planning` |

**Invariant:** Net worth is always balance-sheet based: manual assets + portfolio market value − liabilities. Transactions and simulations **never** update net worth.

`net_worth_snapshots` records observed balance-sheet valuations over time. It is
not a transaction rollup and should not be used to infer that spending directly
changes wealth.

Tax documents are also separate. W-2s, 1099s, tax returns, and related files are
stored for review and yearly tax summaries; they do not mutate net worth,
transactions, or planning inputs unless a future feature explicitly maps values.

## Request flow

```
Browser (:4200 dev proxy, or :8080 Docker web)
  -> login page / session cookie / CSRF token
  -> /api/*  ->  FastAPI app.py
       → routers: health, imports, transactions, assets, liabilities,
                  market, holdings, net_worth, planning (/planning/v1)
                  taxes
       → services/finance.py, market_data.py
       → services/planning/{snapshot,runner,tools_registry}
       → services/analytics/monte_carlo.py  (only MC tool wired)
  → SQLite finance.db
```

Docker production-like topology:

```
Browser/domain proxy
  -> web (Nginx static Angular + /api reverse proxy)
  -> api (FastAPI, private Compose network)
  -> SQLite finance.db
```

## Auth And Users

- Login is app-native: `POST /api/auth/login` sets an HttpOnly session cookie and readable CSRF cookie.
- First-run setup is app-native: if no users exist, `/login` creates the first admin account.
- After first-run setup, `/login` also offers signup for normal user accounts. Admins can still create accounts directly.
- All non-health finance APIs require a valid session. Mutating requests require `X-CSRF-Token`.
- `users`, `user_sessions`, and `audit_events` live in the same SQLite database as finance data.
- Admin UI route: `/admin/users`. Admins create, disable, reset, delete, and manage users; view all users and system metrics; and run guarded SQLite maintenance SQL. Self-delete and deleting or disabling the final active admin are blocked.
- User-owned finance tables include `user_id`; market quote cache and provider registries stay global.

There is **no** `routers/analytics.py`. Planning currently uses the Monte Carlo module only.

## Planning (as built)

- **One tool:** `mc_net_worth_paths` — snapshot from ledger → MC paths (ephemeral; **not** stored).
- **Saved inputs:** `planning_assumption_profiles` only (named presets).
- API prefix: `/api/planning/v1` (`tools`, `inputs`, `profiles`, `POST /runs`).
- Responses include a **speculative disclaimer** (Pydantic defaults in `schemas_planning.py`).
- UI: `frontend/src/app/planning/` + `PlanningService`; route `/planning`.

## Imports

- **Banks:** registry in `import_registry.py` → `POST /api/imports/{slug}/preview|commit` (Capital One + extensible slugs).
- **Brokerage:** Fidelity positions CSV → replace holdings for accounts in file; `POST /api/imports/fidelity/*`.

**SimpleFIN later:** the user wants SimpleFIN eventually. **Plaid is not the intended integration** even if placeholder env vars exist. CSV only today.

## Taxes

- API prefix: `/api/taxes`.
- UI route: `/taxes`.
- Uploaded files are stored in SQLite BLOBs for repo-local portability.
- Metadata includes tax year, document type, issuer, taxpayer, file hash, notes,
  and structured summary values.
- Yearly summaries aggregate structured values such as wages, withholding,
  dividends, AGI, taxable income, total tax, and refund/owed.
- Current implementation does not extract values from PDFs automatically; users
  enter important values from official documents during upload.

## Frontend

- Shell: `MainLayoutComponent`; lazy feature routes in `app.routes.ts`; `authGuard` protects the app shell.
- State: `FinanceService` (ledger + balance sheet); `PlanningService` (MC).
- Prices: memory → optional Redis → SQLite EOD → yfinance (`market_data`).

## Where to read more

| Topic | Doc |
|-------|-----|
| Tables & formulas | [DATA_MODEL.md](./DATA_MODEL.md) |
| Routes & UI tokens | [FRONTEND.md](./FRONTEND.md) |
| Setup | [DEVELOPMENT.md](./DEVELOPMENT.md) |
