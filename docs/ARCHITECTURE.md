# Architecture (one page)

Local-first personal finance: **Angular 19** UI, **FastAPI** API, **SQLite** persistence, and app-native user accounts.

## Data planes (do not mix)

| Plane | What it is | Writes | Reads for |
|-------|------------|--------|-----------|
| **Balance sheet** | per-user `assets`, `liabilities`, `holdings` + market prices | CRUD + Fidelity CSV (holdings per brokerage account) | **Net worth** (`GET /api/net-worth/`) |
| **Transactions ledger** | per-user `transactions` (income/expense, `source=import` from bank CSV) | Manual CRUD + bank import preview/commit | Dashboard period charts, calendar, planning **inputs** (averages) |
| **Recurring cashflow** | per-user `job_incomes`, `fixed_expenses`, `subscriptions` | CRUD on those tables only | Income / fixed-expense / subscription pages; `GET /api/cashflow/summary`; planning spending inputs |
| **Planning (speculative)** | `planning_assumption_profiles` (+ unused `planning_scenario_runs` table) | Profiles only; MC run results are **ephemeral** (not stored) | Monte Carlo UI at `/planning` |

**Invariant:** Net worth is always balance-sheet based: manual assets + portfolio market value − liabilities. Transactions, recurring cashflow rows, and simulations **never** update net worth.

`net_worth_snapshots` is an ORM/table for observed balance-sheet valuations (same formula). As of the current code, **only** live `GET /api/net-worth/` is wired; list/create snapshot HTTP routes and dashboard “record snapshot” UI are **not** exposed (model + migration exist; some tests still expect the routes).

Tax document storage was removed. Do not add document vault/BLOB storage back without a fresh product/security decision.

Recurring cashflow (job income, rent/utilities-style fixed expenses, subscriptions) is a budget/plan plane. It can appear in cashflow summaries and planning inputs but does **not** change assets, liabilities, holdings, or net worth.

## Request flow

```
Browser (:4200 dev proxy, or :8080 Docker web)
  -> login page / session cookie / CSRF token
  -> /api/*  ->  FastAPI app.py
       → routers: health, auth (+ admin users/metrics/sql), imports,
                  transactions, cashflow, income, fixed_expenses,
                  subscriptions, assets, liabilities, market, holdings,
                   net_worth, planning (/planning/v1)
        → services/finance.py, cashflow.py, market_data.py
       → services/planning/{snapshot,runner,tools_registry,assumptions}
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
- First-run setup: if no users exist, `/login` bootstraps the first admin (`/api/auth/bootstrap-status`, `/api/auth/bootstrap`).
- After first-run setup, `/login` also offers signup (`POST /api/auth/signup`) for normal user accounts. Admins can still create accounts directly.
- All non-health finance APIs require a valid session. Mutating requests require `X-CSRF-Token`.
- Optional legacy `API_KEY` / `FINANCE_API_KEY` middleware can also gate `/api/*` (except health) for non-browser clients.
- `users`, `user_sessions`, and `audit_events` live in the same SQLite database as finance data.
- Admin UI route: `/admin/users`. Admins create, disable, reset password, reset contents, delete, and manage users; view metrics; and run guarded SQLite maintenance SQL. Self-delete and deleting or disabling the final active admin are blocked.
- User-owned finance tables include `user_id`; market quote cache and provider registries stay global.

There is **no** `routers/analytics.py`. Planning currently uses the Monte Carlo module only.

## Planning (as built)

- **One tool:** `mc_net_worth_paths` — read-only ledger snapshot → MC paths (ephemeral; **not** written to `planning_scenario_runs`).
- **Saved inputs:** `planning_assumption_profiles` only (named presets).
- API prefix: `/api/planning/v1` (`tools`, `inputs`, `profiles`, `POST /runs`).
- Responses include a **speculative disclaimer** (Pydantic defaults in `schemas_planning.py`).
- UI: `frontend/src/app/planning/` + `PlanningService`; route `/planning`.

## Imports

- **Banks:** registry in `import_registry.py` → `POST /api/imports/{slug}/preview|commit` (Capital One, Chase, Amex + extensible slugs). Legacy Capital One-specific paths still exist.
- **Brokerage:** Fidelity positions CSV → replace holdings for accounts in file; `POST /api/imports/fidelity/*`.

**SimpleFIN later:** the user wants SimpleFIN eventually. **Plaid is not the intended integration** even if placeholder env vars exist. CSV only today.

## Frontend

- Shell: `MainLayoutComponent` (grouped nav by user intent: Overview, Activity, Cashflow, Net Worth, Planning; admin/user actions in the account menu); lazy feature routes in `app.routes.ts`; `authGuard` + `vaultGuard` protect the app shell; `adminGuard` for `/admin/users`.
- Vault routes (auth only, outside shell): `/vault/setup`, `/vault/unlock`, `/vault/migrate`.
- State: `FinanceService` (ledger, balance sheet, recurring cashflow; dual-mode legacy HTTP vs encrypted client store); `PlanningService` (MC; client-side for migrated users); `VaultService` / `EncryptedStoreService`; `AuthService`.
- Prices: legacy mode uses memory → optional Redis → SQLite EOD → yfinance. Migrated/encrypted mode keeps symbols client-side and uses manual/imported prices (no per-user symbol disclosure).
- Server-blind storage: `/api/vault/*` stores wraps + ciphertext only; backend never decrypts.

## Where to read more

| Topic | Doc |
|-------|-----|
| Tables & formulas | [DATA_MODEL.md](./DATA_MODEL.md) |
| Routes & UI tokens | [FRONTEND.md](./FRONTEND.md) |
| Setup | [DEVELOPMENT.md](./DEVELOPMENT.md) |
| Deploy | [DEPLOY.md](./DEPLOY.md) |
| Agent handoff | [../AGENTS.md](../AGENTS.md) |
