# External Integrations

**Analysis Date:** 2026-08-30

## APIs & External Services

**Market data:**
- Yahoo Finance via `yfinance` — live EOD quotes and Stock Lab research
  - SDK/Client: `yfinance` (`backend/services/market_data.py`)
  - Auth: none (unofficial public Yahoo endpoints; no API key)
  - Surfaces: `GET /api/market/price/{symbol}`, `GET /api/market/research/{symbol}`, `POST /api/market/research/batch` in `backend/routers/market.py`
  - Frontend callers: `frontend/src/app/services/finance.service.ts` (portfolio refresh), `frontend/src/app/services/market-research.service.ts` (Stock Lab)
  - Cache path: in-memory TTL (`PRICE_CACHE_TTL`) → SQLite `ticker_quotes` / `market_research_cache` (`EOD_CACHE_HOURS`) → yfinance on miss
  - Disclosure: explicit refresh/research sends **ticker symbols only**. Shares, values, accounts, and scenarios stay encrypted. Do not describe symbols as server-blind after use.
  - README still mentions “Memory → Redis (optional) → SQLite EOD → yfinance”. Redis is **not implemented** — only a stale comment in `backend/app.py` and UI label leftovers in `frontend/src/app/portfolio/portfolio.component.ts`.

**Bank / brokerage CSV (client-side, no live bank API):**
- Capital One, Chase, Amex, Citi, X Money transaction CSVs — `frontend/src/app/utils/bank-import.util.ts`
- Fidelity positions CSV — `frontend/src/app/utils/fidelity-import.util.ts`
- Parse/preview/dedupe/commit happens in the browser; rows land in encrypted vault collections via `frontend/src/app/services/finance.service.ts`
- Adding a bank: `docs/ADDING_A_BANK_IMPORT.md`

**Not integrated (do not add without an explicit product change):**
- Plaid — not desired; no SDK
- SimpleFIN — planned later; no client yet
- Stripe / payment processors — none
- Cloud object storage (S3, GCS) — none
- Tax document / BLOB vault — intentionally removed

## Data Storage

**Databases:**
- SQLite (single file)
  - Connection: `DATABASE_URL` (default `sqlite:///./finance.db`, resolved to `backend/finance.db` in `backend/database.py`)
  - Docker: `sqlite:////data/finance.db` bind-mounted from `./data` (`docker-compose.yml`)
  - Production: `FINANCE_DATA_DIR` → `/home/vivek/Deployments/finance-tracker/data` (`.github/workflows/deploy.yml`)
  - Client: SQLAlchemy 2.x engine + `SessionLocal` (`backend/database.py`)
  - Migrations: `Base.metadata.create_all` → `backend/migrations.py` → Alembic `upgrade head` at startup
  - ORM: `backend/models.py`

**What SQLite actually stores:**
- Account plane (plaintext): `users`, `user_sessions`, `auth_challenges`, `auth_enrollments`, `audit_events`
- Vault plane (ciphertext + wraps): `user_vaults`, `encrypted_records`, `encrypted_record_indexes`, `user_crypto_migrations`
- Public market cache: `ticker_quotes`, `market_research_cache`
- Legacy plaintext finance tables remain for in-browser schema-v1→v2 migration (`docs/LIFECYCLE.md`); product HTTP for those tables is unmounted

**Encrypted collections** (`backend/services/encrypted_storage.py` `ALLOWED_COLLECTIONS`):
`transactions`, `bank_accounts`, `import_batches`, `assets`, `liabilities`, `holdings`, `brokerage_accounts`, `job_incomes`, `fixed_expenses`, `subscriptions`, `planning_profiles`, `stock_lab_scenarios`

**File Storage:**
- Local filesystem only. SQLite file + timestamped backups from `scripts/backup-db.sh` (`sqlite3.Connection.backup`)
- No object store, no document BLOB table
- Angular static assets baked into the `web` image (`frontend/Dockerfile`)

**Caching:**
- Process-local dict in `MarketDataService` (`backend/services/market_data.py`)
- SQLite EOD / research rows
- Failed-symbol cooldown (5 minutes) to avoid yfinance hammering
- No Redis, no Memcached

## Authentication & Identity

**Auth Provider:**
- Custom app-native auth (no Auth0, Cognito, OIDC, or SSO)

**Passwordless login (active path):**
1. Browser unwraps an ECDSA P-256 signing key with the vault passphrase (`frontend/src/app/crypto/auth-crypto.ts`, PBKDF2 + AES-GCM)
2. Server issues a 5-minute single-use challenge (`backend/services/challenge_auth.py`, protocol `vault-auth-v1`)
3. Browser signs; server verifies with stored SPKI public key
4. Session cookie `finance_session` (HttpOnly) + readable CSRF cookie `finance_csrf` (`backend/auth.py`)
5. Mutating requests send `X-CSRF-Token`

**Routes:** `backend/routers/auth_routes.py` — bootstrap, signup, passwordless lookup/challenge/verify, enroll, admin user CRUD, self data reset

**Roles:** `admin` / `user` (`backend/models.py` `UserRole`). Admin UI: `/admin/users`.

**Legacy:**
- Argon2 password hashes survive only for bounded migration (`backend/auth.py` `verify_password`)
- Admins cannot reset vault access or recover keys
- Lost passphrase = lost vault data (no recovery-key path)

**Optional extra gate:**
- If `API_KEY` or `FINANCE_API_KEY` is set, all `/api/*` except `GET /api/health` and `OPTIONS` require `X-API-Key` or `Authorization: Bearer` (`backend/api_auth.py`)
- Browser app uses cookies; this gate is for non-browser clients

**Vault crypto (not an identity provider):**
- Browser-owned DEK; backend stores wraps only (`/api/vault/*` in `backend/routers/vault.py`)
- KDF: PBKDF2-SHA256, 310_000 iterations (`frontend/src/app/crypto/vault-crypto.ts`)
- Records: AES-GCM with authenticated AAD (schema-v2)

## Monitoring & Observability

**Error Tracking:**
- None (no Sentry, Datadog, OpenTelemetry exporter)

**Logs:**
- Stdout structured-ish lines via `backend/logging_config.py` (`asctime | LEVEL | name | message`)
- Access log middleware: `backend/request_logging.py` (skips `/api/health` unless `LOG_HEALTH=true`; redacts transaction search query)
- HTTPException + unhandled exception handlers in `backend/app.py`
- `yfinance` logger forced to CRITICAL to cut bad-symbol noise
- Docker: `make docker-logs` → `docker compose logs -f`
- Deploy health: `curl http://127.0.0.1:${WEB_PORT}/api/health` in `.github/workflows/deploy.yml`

**Health:**
- `GET /api/health` (`backend/routers/health.py`) — SQLite `SELECT 1`; returns 503 when DB is down
- Compose healthchecks: API hits `/api/health`; web `wget` on `/`

## CI/CD & Deployment

**Hosting:**
- Self-hosted Docker Compose on the production machine
- Public TLS terminates at host Nginx (`docs/DEPLOY.md` references `/home/vivek/Deployments/nginx/conf/conf.d/finance.vivekpanchagnula.com.conf` → `127.0.0.1:8085`)
- In-compose Nginx (`frontend/nginx.conf`) serves the SPA and proxies `/api/` to `http://api:8000/api/`

**CI Pipeline:**
- `.github/workflows/ci.yml` on PR + push to `main`/`master`
  - Backend: Python 3.12, `pip install -r backend/requirements.txt`, `pytest`, `scripts/check-doc-paths.sh`
  - Frontend: Node 20, `npm ci`, Karma ChromeHeadless, `ng build --configuration development`
  - Docker: `docker compose build`
- `.github/workflows/deploy.yml` after successful CI on `main`, or `workflow_dispatch`
  - Self-hosted runner `self-hosted` + `linux` + `finance-prod`
  - GitHub Environment `production` requires `vars.CORS_ORIGINS`
  - Writes `.env.production`, runs `scripts/backup-db.sh`, then `docker compose -f docker-compose.yml -f docker-compose.prod.yml up --build -d`

**Local prod-like:**
- `make docker-up` → `http://127.0.0.1:8080`

## Environment Configuration

**Required env vars (production):**
- `CORS_ORIGINS` — exact UI origin, never `*` (`docker-compose.prod.yml` fails if unset)
- `SESSION_COOKIE_SECURE=1`
- `DISABLE_OPENAPI=1`
- `ALEMBIC_STRICT=1`
- `DATABASE_URL` (Compose default `sqlite:////data/finance.db`)
- `FINANCE_DATA_DIR` / `FINANCE_BACKUP_DIR` on the deploy runner

**Optional:**
- `API_KEY` / `FINANCE_API_KEY`
- `RATE_LIMIT_PER_MIN` (Compose default `60`; limits passwordless POSTs and `/api/market/research*`)
- `PRICE_CACHE_TTL`, `EOD_CACHE_HOURS`
- `LOG_LEVEL`, `LOG_SQL`, `LOG_HEALTH`, `DEBUG_HEALTH`

**Secrets location:**
- Local: `backend/.env` (gitignored; template `backend/.env.example`)
- Production: GitHub Environment vars + generated `.env.production` on the runner (exists in repo workspace as a deploy artifact — do not quote contents)
- Vault passphrases, private keys, and finance plaintext never leave the browser

## Webhooks & Callbacks

**Incoming:**
- None. No webhook routers, no signed callback endpoints.

**Outgoing:**
- None except yfinance HTTPS fetches initiated by authenticated market routes.

**Rate-limited inbound HTTP** (`backend/rate_limit.py`):
- All `/api/market/research*` 
- POST `/api/auth/passwordless/lookup`, `/challenge`, `/verify`

## Internal HTTP contract (browser ↔ API)

Same-origin `/api` (`frontend/src/environments/`). Active routers mounted in `backend/app.py`:

| Prefix | Module | Purpose |
|--------|--------|---------|
| `/api/health` | `backend/routers/health.py` | Liveness + DB ping |
| `/api/auth/*` | `backend/routers/auth_routes.py` | Bootstrap, passwordless, admin |
| `/api/vault/*` | `backend/routers/vault.py` | Ciphertext CRUD, wraps, migration |
| `/api/market/*` | `backend/routers/market.py` | Quotes + research |

Plaintext finance HTTP (transactions, assets, holdings, imports, planning, cashflow) is unmounted. Monte Carlo and CSV import run in the browser after vault unlock (`frontend/src/app/services/planning.service.ts`, `frontend/src/app/crypto/encrypted-store.service.ts`).

---

*Integration audit: 2026-08-30*
