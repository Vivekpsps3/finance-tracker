# Architecture (one page)

Local-first personal finance: **Angular 19** UI, **FastAPI** API, **SQLite** persistence, app-native user accounts, and a browser-owned encrypted finance vault.

## Active API surface

- Active browser finance storage is `/api/vault/*`: the backend stores ciphertext, sync revisions, and blind indexes only.
- Active non-finance plaintext surfaces are auth/admin account management, health, and public market quote/research cache.
- Retired plaintext finance routers still exist behind `ALLOW_LEGACY_FINANCE=1` for backend regression tests and old DB service coverage. Normal deployments return `410` and these routes are hidden from OpenAPI.

## Data planes (do not mix)

| Plane | What it is | Writes | Reads for |
|-------|------------|--------|-----------|
| **Balance sheet** | per-user `assets`, `liabilities`, `holdings` + market prices | CRUD + Fidelity CSV (holdings per brokerage account) | **Net worth** (`GET /api/net-worth/`) |
| **Transactions ledger** | encrypted per-user transactions (income/expense, `source=import` from browser-side bank CSV) | Browser CRUD + client CSV preview/commit | Dashboard period charts, calendar, planning **inputs** (averages) |
| **Recurring cashflow** | per-user `job_incomes`, `fixed_expenses`, `subscriptions` | CRUD on those tables only | Income / fixed-expense / subscription pages; `GET /api/cashflow/summary`; planning spending inputs |
| **Planning (speculative)** | MC profiles + encrypted `stock_lab_scenarios`; public market research cache | MC profiles; Stock Lab scenarios via vault; market research by symbol | Monte Carlo `/planning`, Stock Lab `/stock-lab` |

**Invariant:** Net worth is always balance-sheet based: manual assets + portfolio market value − liabilities. Transactions, recurring cashflow rows, and simulations **never** update net worth.

`net_worth_snapshots` is an ORM/table for observed balance-sheet valuations (same formula). As of the current code, **only** live `GET /api/net-worth/` is wired; list/create snapshot HTTP routes and dashboard “record snapshot” UI are **not** exposed (model + migration exist; some tests still expect the routes).

Tax document storage was removed. Do not add document vault/BLOB storage back without a fresh product/security decision.

Recurring cashflow (job income, rent/utilities-style fixed expenses, subscriptions) is a budget/plan plane. It can appear in cashflow summaries and planning inputs but does **not** change assets, liabilities, holdings, or net worth.

## Request flow

```
Browser (:4200 dev proxy, or :8080 Docker web)
  -> login page / session cookie / CSRF token
  -> /api/*  ->  FastAPI app.py
        → routers: health, auth/admin, vault, market
        → encrypted_records ciphertext in SQLite
        → browser decrypts and computes finance views/imports/planning
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

- Login is passwordless: the browser uses a username and vault passphrase to unwrap a browser-held signing key, then signs a server-issued single-use challenge. Successful verification sets an HttpOnly session cookie and readable CSRF cookie.
- First-run setup generates the first admin's browser-held auth key and vault (`/api/auth/bootstrap-status`, `/api/auth/bootstrap/passwordless`). Admins create invitation/enrollment records for later users; there is no self-service password signup.
- Legacy password login exists only for a bounded, unenrolled-account migration endpoint. Enrollment registers the public key, stores only encrypted wraps, and clears the password hash.
- All non-health finance APIs require a valid session. Mutating requests require `X-CSRF-Token`.
- Optional legacy `API_KEY` / `FINANCE_API_KEY` middleware can also gate `/api/*` (except health) for non-browser clients.
- `users`, `user_sessions`, and `audit_events` live in the same SQLite database as finance data.
- Admin UI route: `/admin/users`. Admins create invitations, disable, reset contents, delete, and manage users, and view metrics. They cannot reset a vault passphrase or recover a user's keys. The raw SQL console is disabled. Self-delete and deleting or disabling the final active admin are blocked.
- User-owned finance tables include `user_id`; market quote cache and provider registries stay global.

There is **no** `routers/analytics.py`. Net-worth Monte Carlo still lives under `/api/planning/v1`; Stock Lab market research is under `/api/market/research/*`.

## Planning (as built)

- **Monte Carlo tool:** `mc_net_worth_paths` — read-only ledger snapshot → MC paths (ephemeral; **not** written to `planning_scenario_runs`).
- **MC saved inputs:** `planning_assumption_profiles` (named presets).
- API prefix: `/api/planning/v1` (`tools`, `inputs`, `profiles`, `POST /runs`).
- Responses include a **speculative disclaimer** (Pydantic defaults in `schemas_planning.py`).
- UI: `frontend/src/app/planning/` + `PlanningService`; route `/planning`.
- **Stock Lab:** `/stock-lab` is a speculative stock/ETF planning page. It saves encrypted scenario inputs in the vault and uses `/api/market/research/*` for public ticker research. Ticker symbols, including selected owned symbols, are intentionally disclosed for this feature; purchase assumptions remain encrypted client data.

## Imports

- **Banks:** browser-side parsers in `frontend/src/app/utils/bank-import.util.ts` preview and commit CSV rows into encrypted transaction records. Backend parsers remain for regression tests only.
- **Brokerage:** server-side Fidelity plaintext import is retired in normal encrypted mode and will need a client-side replacement before use.

**SimpleFIN later:** the user wants SimpleFIN eventually. **Plaid is not the intended integration** even if placeholder env vars exist. CSV only today.

## Frontend

- Shell: `MainLayoutComponent` (grouped nav by user intent: Overview, Activity, Cashflow, Net Worth, Planning; admin/user actions in the account menu); lazy feature routes in `app.routes.ts`; `authGuard` + `vaultGuard` protect the app shell; `adminGuard` for `/admin/users`.
- Vault routes (auth only, outside shell): `/vault/setup`, `/vault/unlock`.
- State: `FinanceService` / `PlanningService` use the encrypted client store after vault unlock; `VaultService` / `EncryptedStoreService`; `AuthService`.
- Prices: manual/imported prices remain local. An explicit Portfolio refresh and Stock Lab/typed lookup disclose only ticker symbols to `/api/market` and yfinance; shares, values, account details, and other holding fields remain encrypted.
- Server-blind storage: `/api/vault/*` stores wraps + ciphertext only; backend never decrypts. Legacy plaintext finance routes always return `410`.

## Where to read more

| Topic | Doc |
|-------|-----|
| Tables & formulas | [DATA_MODEL.md](./DATA_MODEL.md) |
| Routes & UI tokens | [FRONTEND.md](./FRONTEND.md) |
| Setup | [DEVELOPMENT.md](./DEVELOPMENT.md) |
| Deploy | [DEPLOY.md](./DEPLOY.md) |
| Agent handoff | [../AGENTS.md](../AGENTS.md) |
