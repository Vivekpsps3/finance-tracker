# Codebase Structure

**Analysis Date:** 2026-08-30

## Directory Layout

```
finance-tracker/
├── AGENTS.md                 # Agent handoff + invariants
├── README.md                 # Human setup
├── Makefile                  # install / dev / test / docker
├── docker-compose.yml        # api + nginx web
├── docker-compose.prod.yml   # production volume/CORS override
├── backend/                  # FastAPI + SQLAlchemy
│   ├── main.py               # uvicorn entry: main:app
│   ├── app.py                # create_app, middleware, mounted routers
│   ├── database.py           # engine, init_database, get_db
│   ├── models.py             # ORM (active + reserved + legacy)
│   ├── auth.py               # sessions, CSRF, current user
│   ├── api_auth.py           # optional API_KEY middleware
│   ├── rate_limit.py         # optional per-IP limiter
│   ├── request_logging.py
│   ├── logging_config.py
│   ├── migrations.py         # lightweight SQLite column backfills
│   ├── admin_tools.py        # delete/reset user contents
│   ├── constants.py          # SYMBOL_PATTERN
│   ├── schemas_auth.py
│   ├── schemas_vault.py
│   ├── schemas_market.py
│   ├── routers/              # mounted HTTP only
│   │   ├── health.py
│   │   ├── auth_routes.py
│   │   ├── vault.py
│   │   └── market.py
│   ├── services/
│   │   ├── encrypted_storage.py
│   │   ├── challenge_auth.py
│   │   └── market_data.py
│   ├── alembic/versions/     # versioned schema; do not delete
│   ├── tests/                # pytest
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/                 # Angular 19 standalone
│   ├── src/
│   │   ├── main.ts
│   │   ├── app/
│   │   │   ├── app.routes.ts
│   │   │   ├── app.config.ts
│   │   │   ├── auth/
│   │   │   ├── vault/
│   │   │   ├── crypto/
│   │   │   ├── core/
│   │   │   ├── services/
│   │   │   ├── models/
│   │   │   ├── utils/
│   │   │   ├── signals/
│   │   │   ├── shared/ui/
│   │   │   └── {feature}/    # one folder per product page
│   │   ├── theme/
│   │   └── environments/
│   ├── proxy.conf.js         # /api → :8000
│   ├── nginx.conf            # Docker static + /api proxy
│   ├── e2e/                  # Playwright smoke
│   └── Dockerfile
├── docs/                     # Architecture, security, deploy
├── scripts/                  # backup + doc-path checks
├── data/                     # Docker SQLite volume (not app source)
├── backups/                  # Operator backups
└── .planning/codebase/       # This map
```

## Directory Purposes

**`backend/`:**
- Purpose: Auth, vault ciphertext API, public market cache, SQLite.
- Contains: Flat Python modules plus `routers/`, `services/`, `alembic/`, `tests/`.
- Key files: `app.py`, `models.py`, `database.py`, `routers/vault.py`, `services/encrypted_storage.py`

**`backend/routers/`:**
- Purpose: Mounted HTTP only. Four source files.
- Contains: `health.py`, `auth_routes.py`, `vault.py`, `market.py`.
- Key files: Do not add plaintext finance routers here unless product direction changes.

**`backend/services/`:**
- Purpose: Non-HTTP domain logic used by routers.
- Contains: Ciphertext store, challenge auth, yfinance cache.
- Key files: `encrypted_storage.py`, `challenge_auth.py`, `market_data.py`

**`backend/alembic/`:**
- Purpose: Versioned schema. Head `f1a2b3c4d5e6`.
- Contains: `env.py`, `versions/*.py`.
- Key files: Preserve every revision, including add/drop tax documents and vault tables.

**`backend/tests/`:**
- Purpose: Pytest for auth, vault, market, migrations, OpenAPI.
- Contains: `test_*.py`, `conftest.py`, `planning/golden/` leftover fixture.
- Key files: `test_vault_encryption.py`, `test_auth_challenge.py`, `test_migrations.py`

**`frontend/src/app/`:**
- Purpose: Entire SPA. Feature folders, not NgModules.
- Contains: Route components, services, crypto, shared UI.
- Key files: `app.routes.ts`, `services/finance.service.ts`, `crypto/encrypted-store.service.ts`

**`frontend/src/app/crypto/`:**
- Purpose: Vault unlock, record crypto, client finance math, vault route guard.
- Contains: `vault-crypto.ts`, `auth-crypto.ts`, `vault.service.ts`, `encrypted-store.service.ts`, `client-finance.ts`, `vault.guard.ts`
- Key files: `encrypted-store.service.ts`, `client-finance.ts`

**`frontend/src/app/services/`:**
- Purpose: Injectable facades used by pages.
- Contains: Finance, planning, market research, stock-lab scenarios, toast, confirm, API health.
- Key files: `finance.service.ts`, `planning.service.ts`

**`frontend/src/app/shared/ui/`:**
- Purpose: Reusable `ui-*` controls. Barrel at `index.ts`.
- Contains: button, card, badge, source-badge, input, select, skeleton, empty-state, page-header, data-table, dialog, icon.
- Key files: `frontend/src/app/shared/ui/index.ts`

**`frontend/src/app/utils/`:**
- Purpose: Pure helpers: bank/Fidelity CSV, dates, format, portfolio, export, Stock Lab math.
- Contains: `*.util.ts` + colocated `*.util.spec.ts`.
- Key files: `bank-import.util.ts`, `fidelity-import.util.ts`

**`frontend/src/app/signals/`:**
- Purpose: Local (in-browser) dashboard detectors. Must not call the backend with finance plaintext.
- Contains: `financial-signal.ts`, `detectors.ts`, `build-local-snapshot.ts`
- Key files: `detectors.ts`

**`frontend/src/theme/`:**
- Purpose: CSS tokens and Chart.js colors.
- Contains: `tokens.css` (via Tailwind), `chart-colors.ts`, `index.ts`
- Key files: `frontend/src/theme/chart-colors.ts`, `frontend/tailwind.config.js`

**`docs/`:**
- Purpose: Human + agent architecture. Prefer code when docs drift.
- Contains: `ARCHITECTURE.md`, `DATA_MODEL.md`, `LIFECYCLE.md`, `SECURITY_MODEL.md`, `FRONTEND.md`, `DEPLOY.md`
- Key files: `docs/LIFECYCLE.md` for mounted vs reserved surfaces

**`scripts/`:**
- Purpose: Operator helpers.
- Contains: `backup-db.sh`, `verify-backup.sh`, `check-doc-paths.sh`

## Key File Locations

**Entry Points:**
- `frontend/src/main.ts`: SPA bootstrap
- `frontend/src/app/app.config.ts`: Router + HTTP interceptors
- `frontend/src/app/app.routes.ts`: All routes and guards
- `backend/main.py`: `uvicorn main:app`
- `backend/app.py`: App factory and mounted routers

**Configuration:**
- `backend/database.py`: `DATABASE_URL` (default `sqlite:///./finance.db` under `backend/`)
- `frontend/src/environments/environment*.ts`: `apiUrl`
- `frontend/proxy.conf.js`: Dev `/api` proxy
- `frontend/nginx.conf`: Production `/api` proxy
- `docker-compose.yml` / `docker-compose.prod.yml`: Runtime env
- `Makefile`: Dev and test commands
- `backend/alembic.ini`: Alembic config

**Core Logic:**
- `frontend/src/app/crypto/client-finance.ts`: Net worth + cashflow formulas
- `frontend/src/app/crypto/encrypted-store.service.ts`: Collection CRUD + migration
- `frontend/src/app/services/finance.service.ts`: Page-facing finance API
- `frontend/src/app/services/planning.service.ts`: Client Monte Carlo
- `backend/services/encrypted_storage.py`: Ciphertext allowlist + revisions
- `backend/services/challenge_auth.py`: Passwordless verify
- `backend/services/market_data.py`: Quotes + research cache
- `backend/models.py`: Tables

**Auth / vault UI:**
- `frontend/src/app/auth/login.component.ts`
- `frontend/src/app/auth/signup.component.ts`
- `frontend/src/app/vault/vault-setup.component.ts`
- `frontend/src/app/vault/vault-unlock.component.ts`
- `frontend/src/app/auth/auth.guard.ts`
- `frontend/src/app/crypto/vault.guard.ts`

**Testing:**
- `backend/tests/`: Pytest
- `frontend/src/app/**/*.spec.ts`: Karma/Jasmine colocated
- `frontend/e2e/smoke.spec.ts`: Playwright
- `scripts/check-doc-paths.sh`: Doc path CI

## Naming Conventions

**Files:**
- Backend modules: `snake_case.py` (`auth_routes.py`, `encrypted_storage.py`)
- Backend tests: `test_<area>.py` in `backend/tests/`
- Angular features: kebab folder + `*.component.ts` (`fixed-expenses/fixed-expenses.component.ts`)
- Services: `*.service.ts` in `frontend/src/app/services/` or `crypto/`
- Utils: `*.util.ts` in `frontend/src/app/utils/`
- Models: `*.model.ts` in `frontend/src/app/models/`
- Shared UI: `ui-<name>/ui-<name>.component.ts`, selector `ui-<name>`
- Specs: colocated `*.spec.ts` next to the source file

**Directories:**
- One product route → one kebab-case folder under `frontend/src/app/`
- Backend stays flat except `routers/`, `services/`, `alembic/`, `tests/`
- Do not introduce `backend/routers/analytics.py` or a new finance-plaintext package

**Symbols:**
- Python: `snake_case` functions, `PascalCase` ORM/Pydantic
- TypeScript: `camelCase` functions, `PascalCase` types/components
- Vault collections: `snake_case` strings matching `ALLOWED_COLLECTIONS`

## Where to Add New Code

**New finance entity (asset-like row the user CRUD's):**
- Collection name: add to `ALLOWED_COLLECTIONS` in `backend/services/encrypted_storage.py` and `CollectionName` / `bags` in `frontend/src/app/crypto/encrypted-store.service.ts`
- Types: `frontend/src/app/models/transaction.model.ts` (or a new `*.model.ts` if it is large)
- Store methods: `EncryptedStoreService`
- Facade: `frontend/src/app/services/finance.service.ts`
- Page: new folder `frontend/src/app/<feature>/`
- Route: `frontend/src/app/app.routes.ts` under the shell (`authGuard` + `vaultGuard`)
- Nav: `frontend/src/app/core/layout/main-layout.component.ts` `navGroups`
- Tests: colocated `*.spec.ts` plus any formula tests in `client-finance.spec.ts`
- Do **not** add a plaintext SQL table or a new FastAPI CRUD router

**New bank CSV importer:**
- Parser + slug: `frontend/src/app/utils/bank-import.util.ts`
- Tests: `frontend/src/app/utils/bank-import.util.spec.ts`
- Docs: `docs/ADDING_A_BANK_IMPORT.md`
- Must emit `dedupe_key` and expense rows only. Must not change net worth.

**New brokerage CSV importer:**
- Follow `frontend/src/app/utils/fidelity-import.util.ts` (replace-per-account holdings)
- Wire through `FinanceService` preview/commit helpers
- Keep parse client-side

**New speculative planner (Stock Lab–like):**
- Page: `frontend/src/app/<name>/`
- Encrypted inputs: new allowed collection (see finance entity) or reuse `stock_lab_scenarios`
- Public research only via `frontend/src/app/services/market-research.service.ts` → `/api/market/research/*`
- Must not write holdings, assets, liabilities, or transactions
- Must not persist run artifacts (`planning_runs` is forbidden)

**New mounted API (non-finance):**
- Router: `backend/routers/<name>.py`
- Include in `backend/app.py` `create_app()` with `/api` prefix
- Schemas: `backend/schemas_<name>.py`
- Tests: `backend/tests/test_<name>.py`
- Auth: `Depends(get_current_user)` unless it is health-like
- Allowed plaintext: account identity, public market, ciphertext metadata. Not finance fields.

**New shared control:**
- `frontend/src/app/shared/ui/ui-<name>/`
- Export from `frontend/src/app/shared/ui/index.ts`
- Selector prefix `ui-`. Prefer OnPush.

**Utilities:**
- Pure functions: `frontend/src/app/utils/`
- Theme/chart tokens: `frontend/src/theme/`
- Local dashboard insights: `frontend/src/app/signals/` (browser-only)

**Admin-only page:**
- Route under shell with `canActivate: [adminGuard]`
- Component in `frontend/src/app/admin/`
- Backend in `backend/routers/auth_routes.py` `/admin/*` using `get_current_admin`
- Admins cannot reset vault passphrases or decrypt records

## Special Directories

**`backend/.venv/`:**
- Purpose: Local Python env
- Generated: Yes
- Committed: No

**`frontend/node_modules/`, `frontend/dist/`, `frontend/.angular/`:**
- Purpose: npm deps, build output, CLI cache
- Generated: Yes
- Committed: No

**`data/`:**
- Purpose: Docker SQLite file (`/data/finance.db`)
- Generated: Yes at runtime
- Committed: Directory only; not the live DB

**`backups/`:**
- Purpose: Operator-managed DB copies
- Generated: Via `scripts/backup-db.sh`
- Committed: No live dumps

**`backend/routers/__pycache__/` and `backend/tests/__pycache__/`:**
- Purpose: Stale bytecode from unmounted plaintext routers/tests (`transactions`, `planning`, `imports`, `taxes`, …)
- Generated: Yes
- Committed: No. Not an API surface. Do not resurrect those modules from pyc.

**`.planning/codebase/`:**
- Purpose: GSD codebase map consumed by plan/execute
- Generated: By `/gsd-map-codebase`
- Committed: Yes when the orchestrator commits

**`docs/superpowers/specs/`:**
- Purpose: Historical design specs (Stock Lab, passwordless, repairs)
- Generated: No
- Committed: Yes. Implementation in `frontend/` + `backend/` wins if they disagree.

---

*Structure analysis: 2026-08-30*
