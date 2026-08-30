<!-- refreshed: 2026-08-30 -->
# Architecture

**Analysis Date:** 2026-08-30

## System Overview

```text
┌──────────────────────────────────────────────────────────────────────────┐
│  Angular 19 SPA  (`frontend/src/`)                                       │
│  Routes in `app.routes.ts` · shell `core/layout/main-layout.component.ts`│
├──────────────┬──────────────┬──────────────┬──────────────┬──────────────┤
│ Feature pages│ Auth / vault │ Finance API  │ Planning MC  │ Stock Lab    │
│ `dashboard/` │ `auth/`      │ facade       │ `planning/`  │ `stock-lab/` │
│ `transactions/` `vault/`    │ `services/`  │ `planning.   │ research +   │
│ `portfolio/` …              │              │  service.ts` │ scenarios    │
└──────┬───────┴──────┬───────┴──────┬───────┴──────┬───────┴──────┬───────┘
       │              │              │              │              │
       ▼              ▼              ▼              ▼              ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  Client crypto + finance math                                            │
│  `crypto/vault.service.ts`  `crypto/encrypted-store.service.ts`          │
│  `crypto/client-finance.ts` `crypto/vault-crypto.ts` `crypto/auth-crypto.ts` │
│  In-memory decrypted bags · WebCrypto AES-GCM + PBKDF2 · ECDSA login     │
└──────┬───────────────────────────────┬───────────────────┬───────────────┘
       │ HTTPS cookie + CSRF           │ ticker symbols    │
       │ ciphertext only               │ only (explicit)   │
       ▼                               ▼                   │
┌──────────────────────────────────────┬───────────────────┴───────────────┐
│  FastAPI  (`backend/app.py`)         │  yfinance (public quotes)         │
│  Mounted: health, auth, vault, market│  `services/market_data.py`        │
│  Unmounted: plaintext finance HTTP   │                                   │
└──────┬───────────────────────────────┴───────────────────────────────────┘
       ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  SQLite  (`DATABASE_URL`, default `backend/finance.db`)                  │
│  Ciphertext: `encrypted_records` + wraps in `user_vaults`                │
│  Auth: `users`, `user_sessions`, `auth_challenges`, `audit_events`       │
│  Public: `ticker_quotes`, `market_research_cache`                        │
│  Reserved/legacy plaintext tables kept until per-user VACUUM             │
└──────────────────────────────────────────────────────────────────────────┘
```

Production topology (`docker-compose.yml`): browser → Nginx (`frontend/nginx.conf`) static + `/api` reverse proxy → FastAPI on private Compose network → SQLite volume at `/data/finance.db`.

Dev topology (`Makefile`): Angular `:4200` + `frontend/proxy.conf.js` → uvicorn `main:app` on `:8000`.

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| App factory | CORS, rate limit, optional API key, request logging, router mount | `backend/app.py` |
| ASGI entry | Re-export `app`; `uvicorn main:app` | `backend/main.py` |
| Auth / admin HTTP | Passwordless challenge, bootstrap, invitations, sessions, admin CRUD | `backend/routers/auth_routes.py` |
| Vault HTTP | Wraps, ciphertext upsert/list/delete, blind-index lookup, legacy export | `backend/routers/vault.py` |
| Market HTTP | Quote + research by ticker (intentional symbol disclosure) | `backend/routers/market.py` |
| Health HTTP | DB ping; no auth | `backend/routers/health.py` |
| Session / CSRF | Cookie session, CSRF header, password hash (legacy only) | `backend/auth.py` |
| Challenge verify | Issue/consume ECDSA login challenges | `backend/services/challenge_auth.py` |
| Ciphertext store | Collection allowlist, revision upsert, legacy export/delete | `backend/services/encrypted_storage.py` |
| Market cache | In-memory TTL + SQLite EOD + yfinance | `backend/services/market_data.py` |
| ORM | Active + reserved + legacy tables | `backend/models.py` |
| DB init | `create_all` → lightweight SQLite → Alembic head | `backend/database.py` |
| Route table | Lazy standalone routes + guards | `frontend/src/app/app.routes.ts` |
| Shell | Grouped nav, account menu, API health banner | `frontend/src/app/core/layout/main-layout.component.ts` |
| Auth facade | Bootstrap, passwordless login, CSRF cookie, session | `frontend/src/app/auth/auth.service.ts` |
| Finance facade | RxJS subjects over encrypted store; explicit price refresh | `frontend/src/app/services/finance.service.ts` |
| Encrypted store | Decrypt bags, CRUD, schema-v1→v2 rewrite, plaintext migrate | `frontend/src/app/crypto/encrypted-store.service.ts` |
| Vault session | DEK unlock, encrypt/decrypt, `/api/vault/*` | `frontend/src/app/crypto/vault.service.ts` |
| Finance math | Net worth, cashflow, enrichers | `frontend/src/app/crypto/client-finance.ts` |
| Planning | Client Monte Carlo; profiles in vault collection `planning_profiles` | `frontend/src/app/services/planning.service.ts` |
| Stock Lab | Encrypted scenarios + public research | `frontend/src/app/services/stock-lab-scenario.service.ts`, `frontend/src/app/services/market-research.service.ts` |
| Bank / Fidelity import | Browser CSV parse + encrypted commit | `frontend/src/app/utils/bank-import.util.ts`, `frontend/src/app/utils/fidelity-import.util.ts` |

## Pattern Overview

**Overall:** Server-blind encrypted SPA. The browser is the finance application. The backend is an auth + ciphertext sync + public-market cache.

**Key Characteristics:**
- Four data planes must not mix: balance sheet, transaction ledger, recurring cashflow, speculative planning.
- Finance plaintext never crosses `/api/*`. Backend stores wraps, ciphertext, revisions, and optional HMAC blind indexes only.
- Net worth is current-only and computed in the browser from assets + holdings − liabilities. It is not a transaction rollup and is not stored as history.
- Planning and Stock Lab are speculative. They must not mutate assets, liabilities, holdings, or transactions.
- Ticker symbols are disclosed only on explicit Portfolio refresh or Stock Lab/typed lookup. Shares, values, accounts, and scenarios stay encrypted.

## Layers

**UI (Angular standalone):**
- Purpose: Operational finance surfaces, no marketing pages.
- Location: `frontend/src/app/{feature}/`
- Contains: One folder per route; `*.component.ts` + optional `*.html`/`*.css`; OnPush on new work.
- Depends on: `services/`, `crypto/`, `shared/ui/`, `models/`
- Used by: Router via `frontend/src/app/app.routes.ts`

**Frontend application services:**
- Purpose: Session-scoped state and API contract for pages.
- Location: `frontend/src/app/services/`
- Contains: `FinanceService`, `PlanningService`, `MarketResearchService`, `StockLabScenarioService`, `ToastService`, `ConfirmService`, `ApiHealthService`
- Depends on: `EncryptedStoreService`, `VaultService`, `HttpClient` via `frontend/src/app/core/api-url.ts`
- Used by: Feature components and `MainLayoutComponent`

**Client crypto / domain:**
- Purpose: Unlock DEK, encrypt records, compute net worth and cashflow, sign login challenges.
- Location: `frontend/src/app/crypto/`
- Contains: `vault-crypto.ts`, `auth-crypto.ts`, `vault.service.ts`, `encrypted-store.service.ts`, `client-finance.ts`, `vault.guard.ts`
- Depends on: WebCrypto, `VaultService` HTTP to `/api/vault/*`
- Used by: All finance services after unlock

**HTTP API (mounted):**
- Purpose: Auth, vault ciphertext, public market, health.
- Location: `backend/routers/` — only `health.py`, `auth_routes.py`, `vault.py`, `market.py`
- Contains: FastAPI routers included in `backend/app.py` under `/api`
- Depends on: `backend/auth.py`, `backend/services/*`, `backend/schemas_*.py`
- Used by: Browser interceptors (`frontend/src/app/auth/auth.interceptor.ts`)

**Backend services:**
- Purpose: Ciphertext persistence, challenge auth, yfinance + cache.
- Location: `backend/services/`
- Contains: `encrypted_storage.py`, `challenge_auth.py`, `market_data.py`
- Depends on: `backend/models.py`, `backend/database.py`
- Used by: Routers only

**Persistence:**
- Purpose: SQLite via SQLAlchemy. Three schema authorities: ORM `create_all`, `backend/migrations.py`, Alembic `backend/alembic/versions/`.
- Location: `backend/database.py`, `backend/models.py`, `backend/alembic/`
- Contains: Auth tables, vault tables, public market cache, reserved/legacy plaintext finance tables
- Depends on: `DATABASE_URL` (relative SQLite paths resolve to `backend/`)
- Used by: All backend services

## Data Flow

### Primary Request Path (encrypted finance write)

1. Feature page calls `FinanceService` (`frontend/src/app/services/finance.service.ts`).
2. `EncryptedStoreService.upsert` encrypts the row with schema-v2 AAD (`frontend/src/app/crypto/encrypted-store.service.ts:119`).
3. `VaultService.upsertRecords` POSTs ciphertext to `/api/vault/records/upsert` (`frontend/src/app/crypto/vault.service.ts`).
4. `authInterceptor` adds `withCredentials` and `X-CSRF-Token` on mutating requests (`frontend/src/app/auth/auth.interceptor.ts:10`).
5. `vault.upsert_encrypted_records` requires a session + existing vault (`backend/routers/vault.py:120`).
6. `encrypted_storage.upsert_records` validates collection, client_id, revision, ciphertext size (`backend/services/encrypted_storage.py`).
7. SQLite commits via `get_db()` (`backend/database.py:66`). Backend never decrypts.

### Dashboard / net worth read

1. `vaultGuard` requires session + unlocked DEK (`frontend/src/app/crypto/vault.guard.ts:12`).
2. `FinanceService.loadDashboard` forks encrypted-store reads (`frontend/src/app/services/finance.service.ts:107`).
3. `EncryptedStoreService.ensureLoaded` lists `/api/vault/records` and decrypts into in-memory bags (`frontend/src/app/crypto/encrypted-store.service.ts:76`).
4. `computeNetWorth(assets, liabilities, holdings)` runs locally (`frontend/src/app/crypto/client-finance.ts:13`).
5. There is no mounted `GET /api/net-worth/`. Do not add one.

### Passwordless login

1. User enters username + vault passphrase on `frontend/src/app/auth/login.component.ts`.
2. Browser unwraps the signing key (`frontend/src/app/crypto/auth-crypto.ts`) and requests `POST /api/auth/passwordless/challenge`.
3. `challenge_auth.issue_challenge` stores only a hash (`backend/services/challenge_auth.py:23`).
4. Browser signs; `POST /api/auth/passwordless/verify` sets HttpOnly `finance_session` + readable `finance_csrf` (`backend/auth.py`).
5. If no vault → `/vault/setup`. If vault locked → `/vault/unlock`. Else shell routes.

### Explicit market refresh (ticker disclosure)

1. Portfolio or Stock Lab user action calls `FinanceService` / `MarketResearchService`.
2. Only the symbol hits `GET /api/market/price/{symbol}` or `/api/market/research/{symbol}` (`backend/routers/market.py:20`).
3. `market_data` module singleton checks memory → SQLite → yfinance (`backend/services/market_data.py:425`).
4. Shares, cost, accounts, and scenario inputs stay in the encrypted store.

### Client CSV import

1. Transactions page reads a file in the browser.
2. `bank-import.util.ts` or `fidelity-import.util.ts` parses and builds preview rows.
3. Commit writes encrypted `transactions` / `holdings` / `brokerage_accounts` via the store.
4. CSV bytes are not uploaded. Bank import does not change net worth.

### Planning (speculative)

1. `PlanningService.clientInputs` snapshots decrypted balance sheet + recurring cashflow (`frontend/src/app/services/planning.service.ts:97`).
2. `clientMonteCarlo` runs in-process (`frontend/src/app/services/planning.service.ts:145`). Runs are ephemeral (`id` is not persisted).
3. Named presets save to vault collection `planning_profiles`. Collection `planning_runs` is not allowed (`backend/services/encrypted_storage.py:32`).

**State Management:**
- Session: HttpOnly cookie + CSRF cookie; `AuthService` `BehaviorSubject`.
- Vault DEK: in-memory only on `VaultService` after unlock. Lost on refresh until unlock again.
- Finance: `EncryptedStoreService` Maps per collection; `FinanceService` `BehaviorSubject`s for pages.
- Market: process-local `_memory` + SQLite `ticker_quotes` / `market_research_cache`.
- Rate limit: process-local `_buckets` in `backend/rate_limit.py`.

## Key Abstractions

**Encrypted collection:**
- Purpose: Named bag of ciphertext records (`client_id` + `revision` + `schema_version`).
- Examples: `backend/services/encrypted_storage.py` `ALLOWED_COLLECTIONS`; `frontend/src/app/crypto/encrypted-store.service.ts` `CollectionName`
- Pattern: Allowlist both sides. Add the name in both files or the record is dropped on load.

**Data plane:**
- Purpose: Separate current net worth, spending ledger, recurring cashflow, and speculation.
- Examples: `frontend/src/app/crypto/client-finance.ts`, `docs/DATA_MODEL.md`
- Pattern: Writes stay inside one plane. Planning and imports must not update the other planes.

**Vault wrap:**
- Purpose: Server-stored PBKDF2 salt + wrapped DEK. Backend cannot unwrap.
- Examples: `backend/models.py` `UserVault`; `frontend/src/app/crypto/vault-crypto.ts`
- Pattern: Passphrase never leaves the browser. No admin reset. No recovery-key product path.

**Auth challenge:**
- Purpose: Single-use hashed challenge; browser signs with passphrase-unwrapped ECDSA key.
- Examples: `backend/services/challenge_auth.py`, `frontend/src/app/crypto/auth-crypto.ts`
- Pattern: Store hashes only. Password login exists only for bounded migration (`POST /api/auth/login/migrate`).

**Shared UI kit:**
- Purpose: Dense operational controls with `ui-` selectors.
- Examples: `frontend/src/app/shared/ui/index.ts`
- Pattern: Import from the barrel. Cards only for real grouped surfaces.

## Entry Points

**Angular bootstrap:**
- Location: `frontend/src/main.ts`
- Triggers: Browser load of the SPA
- Responsibilities: `bootstrapApplication(AppComponent, appConfig)` with router + HTTP interceptors

**FastAPI process:**
- Location: `backend/main.py` → `backend/app.py` `create_app()`
- Triggers: `uvicorn main:app` (`Makefile` `backend` target) or Docker `api` service
- Responsibilities: Lifespan `init_database()`, mount four routers, middleware stack

**Docker website:**
- Location: `docker-compose.yml` + `frontend/nginx.conf`
- Triggers: `make docker-up`
- Responsibilities: Nginx serves `frontend/dist` and proxies `/api/` to `api:8000`

**CLI / ops:**
- Location: `Makefile`, `scripts/backup-db.sh`, `scripts/verify-backup.sh`, `backend/admin_tools.py`
- Triggers: Operator
- Responsibilities: Dev servers, tests, DB backup. Admin destructive actions go through `/api/admin/*`, not a SQL console.

## Architectural Constraints

- **Threading:** Uvicorn event loop. SQLAlchemy sessions are sync. `yfinance` calls in `market_data.get_price` / `get_research` block the worker. SQLite uses `check_same_thread=False` (`backend/database.py:27`).
- **Global state:** `market_data` singleton (`backend/services/market_data.py:425`); rate-limit `_buckets` (`backend/rate_limit.py:16`); per-tab `VaultService.dek` and `EncryptedStoreService` bags.
- **Circular imports:** `backend/main.py` re-exports `app`, `engine`, `Base`, `market_data` for tests. Routers import `auth` + `database` + `services`. Do not import routers from `models.py`.
- **Mounted API only:** Do not remount plaintext finance routers. `__pycache__` leftovers for `transactions`, `assets`, `holdings`, `planning`, `imports`, `cashflow`, `net_worth`, `taxes` are not source of truth.
- **Schema authorities:** Startup order is `create_all` → `run_sqlite_migrations` → Alembic `upgrade head` (`backend/database.py:37`). Head revision is `f1a2b3c4d5e6`. Do not delete Alembic history.
- **Plaintext tables:** Legacy finance tables remain until encrypted replacement is verified per user, then WAL checkpoint + `VACUUM`. See `docs/LIFECYCLE.md`.
- **No tax BLOB storage:** Tax document vault was removed. Do not reintroduce.
- **No service worker** that caches decrypted finance plaintext.

## Anti-Patterns

### Derive net worth from transactions

**What happens:** Sum income/expense or cashflow into a “net worth” number.
**Why it's wrong:** Invariant 2–3. Transactions are a card ledger. Net worth is current assets + portfolio − liabilities only (`frontend/src/app/crypto/client-finance.ts:13`).
**Do this instead:** Call `computeNetWorth` / `EncryptedStoreService.getNetWorth`. Update the balance sheet when cash actually moves.

### Remount plaintext finance HTTP

**What happens:** Re-add `/api/transactions`, `/api/net-worth/`, `/api/planning/v1`, or import upload endpoints.
**Why it's wrong:** Product path is server-blind. Those routers are unmounted on purpose (`backend/app.py:95`).
**Do this instead:** Add a vault collection + client math. Keep HTTP limited to auth, vault, market, health.

### Persist Monte Carlo runs or mutate the ledger from planning

**What happens:** Insert `planning_scenario_runs` or write assets/holdings from a simulation.
**Why it's wrong:** Planning is speculative. `planning_runs` is not an allowed collection. Current `createRun` is ephemeral (`frontend/src/app/services/planning.service.ts:93`).
**Do this instead:** Save named `planning_profiles` or `stock_lab_scenarios` only. Leave runs in memory.

### Send finance plaintext or CSV to the backend

**What happens:** Upload bank CSV, holdings rows, or decrypted payloads to FastAPI.
**Why it's wrong:** Breaks server-blind storage (`docs/SECURITY_MODEL.md`).
**Do this instead:** Parse in `frontend/src/app/utils/bank-import.util.ts` / `fidelity-import.util.ts` and upsert ciphertext.

### Treat ticker symbols as server-blind after refresh

**What happens:** Docs or UI claim holdings are fully private after Portfolio refresh or Stock Lab research.
**Why it's wrong:** Those calls disclose symbols to `/api/market/*` and yfinance (`backend/routers/market.py`).
**Do this instead:** Disclose the leak in the UI. Keep shares, values, accounts, and scenarios encrypted.

### Double-count cash sweeps and manual cash

**What happens:** Manual checking asset plus imported SPAXX/SWVXX/VMFXX holding for the same dollars.
**Why it's wrong:** `computeNetWorth` adds both with no dedupe (`frontend/src/app/crypto/client-finance.ts:18`).
**Do this instead:** Leave the choice to the user; document it. Do not silently merge planes.

## Error Handling

**Strategy:** HTTP exceptions logged in `backend/app.py`; unhandled errors return generic 500. Browser maps 401 to login and shows toasts.

**Patterns:**
- FastAPI `HTTPException` → `{"detail": ...}` (`backend/app.py:72`).
- Unhandled → `{"error": "Internal server error", "code": 500}` (`backend/app.py:85`).
- `httpErrorInterceptor` (`frontend/src/app/core/http-error.interceptor.ts`) + `ToastService`.
- Vault revision conflicts surface from `encrypted_storage` as 409-style HTTP errors; client must reload bags.
- Market fetch failures stay on that symbol; holdings fall back to `purchase_price` (`frontend/src/app/crypto/client-finance.ts:23`).

## Cross-Cutting Concerns

**Logging:** `backend/logging_config.py` + `backend/request_logging.py`. Redact `DATABASE_URL`. Do not log ciphertext contents or passphrases.

**Validation:** Pydantic schemas in `backend/schemas_auth.py`, `backend/schemas_vault.py`, `backend/schemas_market.py`. Collection/client_id/ciphertext limits in `encrypted_storage.py`. Ticker shape in `backend/constants.py` `SYMBOL_PATTERN`.

**Authentication:** Passwordless challenge sessions (`backend/auth.py` + `backend/services/challenge_auth.py`). Optional `API_KEY` / `FINANCE_API_KEY` middleware (`backend/api_auth.py`) gates `/api/*` except health. Mutating browser calls require `X-CSRF-Token`. Roles: `admin` / `user`. `adminGuard` for `/admin/users`.

**Rate limiting:** Optional `RATE_LIMIT_PER_MIN` on selected POSTs and `/api/market/research*` (`backend/rate_limit.py`).

---

*Architecture analysis: 2026-08-30*
