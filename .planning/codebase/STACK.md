# Technology Stack

**Analysis Date:** 2026-08-30

## Languages

**Primary:**
- TypeScript 5.7 (`frontend/tsconfig.json` target ES2022) — Angular 19 standalone UI, client finance math, vault crypto, CSV importers
- Python 3.12 (`.python-version`, `backend/Dockerfile` `python:3.12-slim`) — FastAPI API, SQLAlchemy models, Alembic, yfinance market lookup

**Secondary:**
- HTML/CSS — Angular templates plus `frontend/src/styles.css` and per-component CSS
- Bash — `Makefile`, `scripts/backup-db.sh`, `scripts/verify-backup.sh`, `scripts/check-doc-paths.sh`
- Nginx config — `frontend/nginx.conf` (static SPA + `/api` reverse proxy)
- SQL — Alembic revisions in `backend/alembic/versions/` and lightweight SQLite backfills in `backend/migrations.py`

## Runtime

**Environment:**
- Browser: Angular 19 + Zone.js 0.15, WebCrypto (AES-GCM, PBKDF2, ECDSA P-256) in `frontend/src/app/crypto/`
- Node.js 20 — CI (`actions/setup-node@v4` with `node-version: "20"`) and frontend Docker build (`node:20-bookworm-slim` in `frontend/Dockerfile`)
- Python 3.12 venv at `backend/.venv` (created by `make install-backend`)
- CPython in production API container (`python:3.12-slim`)

**Package Manager:**
- npm (frontend) — lockfile present: `frontend/package-lock.json`
- pip (backend) — no Poetry/uv lock; pins live in `backend/requirements-prod.txt` and `backend/requirements.txt`
- Python venv: `backend/.venv` via `Makefile`

## Frameworks

**Core:**
- FastAPI `>=0.115.0,<0.116.0` — HTTP API (`backend/app.py`, `backend/main.py`)
- Uvicorn `[standard] >=0.32.0,<0.33.0` — ASGI server (`make backend`, `backend/Dockerfile` CMD)
- SQLAlchemy `>=2.0.36,<2.1.0` — ORM (`backend/models.py`, `backend/database.py`)
- Pydantic `>=2.10.0,<3.0.0` — request/response schemas (`backend/schemas_auth.py`, `backend/schemas_vault.py`, `backend/schemas_market.py`)
- Alembic `>=1.14.0,<1.15.0` — versioned migrations (`backend/alembic.ini`, `backend/alembic/`)
- Angular 19.1 standalone — UI (`frontend/package.json`, `frontend/angular.json` application builder)
- RxJS 7.8 — frontend streams (`frontend/src/app/services/`)
- Tailwind CSS 3.4.17 — utility styling (`frontend/tailwind.config.js`, `frontend/postcss.config.js`)
- Chart.js 4.5.1 — dashboard / insights / planning charts (`frontend/src/app/investment-insights/`)

**Testing:**
- pytest `>=8.3.0,<9.0.0` — backend unit/API tests (`backend/pytest.ini`, `backend/tests/`)
- httpx `>=0.28.0,<0.29.0` — FastAPI TestClient stack
- Jasmine 5.5 + Karma 6.4 + ChromeHeadless — Angular unit tests (`frontend/karma.conf.js`)
- Playwright 1.51 — optional e2e (`frontend/playwright.config.ts`, `frontend/e2e/`)

**Build/Dev:**
- Angular CLI 19.1.8 + `@angular-devkit/build-angular` application builder (`frontend/angular.json`)
- TypeScript 5.7.2
- Autoprefixer 10.4 + PostCSS 8.4
- Make — local orchestration (`Makefile`)
- Docker Compose — `docker-compose.yml` + `docker-compose.prod.yml`
- Nginx 1.27-alpine — production static + proxy (`frontend/Dockerfile`)

## Key Dependencies

**Critical:**
- `yfinance >=0.2.48,<0.3.0` — Yahoo Finance quotes and Stock Lab research (`backend/services/market_data.py`)
- `argon2-cffi >=23.1.0,<24.0.0` — leftover password-hash verify for bounded legacy migration (`backend/auth.py`)
- `cryptography >=44.0.0,<45.0.0` — ECDSA P-256 challenge verify (`backend/services/challenge_auth.py`)
- `python-dotenv >=1.0.1,<2.0.0` — local `.env` load in `backend/app.py`
- WebCrypto (browser built-in) — vault DEK wrap + record encrypt (`frontend/src/app/crypto/vault-crypto.ts`) and login key wrap/sign (`frontend/src/app/crypto/auth-crypto.ts`)

**Infrastructure:**
- SQLite (stdlib + SQLAlchemy) — single-file DB; default `sqlite:///./finance.db` resolved against `backend/` in `backend/database.py`
- In-process rate limiter — `backend/rate_limit.py` (no Redis)
- Optional API-key middleware — `backend/api_auth.py`
- Cookie sessions + CSRF — `backend/auth.py` (`finance_session`, `finance_csrf`)

## Configuration

**Environment:**
- Copy `backend/.env.example` → `backend/.env` for local overrides. `load_dotenv()` in `backend/app.py`.
- `.env.production` is written by `.github/workflows/deploy.yml` on the host (do not commit secrets).
- Docker Compose injects runtime vars in `docker-compose.yml` / `docker-compose.prod.yml`.
- Frontend uses same-origin `/api` via `frontend/src/environments/environment*.ts` and `frontend/src/app/core/api-url.ts`. Dev proxy: `frontend/proxy.conf.js` (`API_PROXY_TARGET`, default `http://127.0.0.1:8000`).

**Key configs required:**

| Variable | Default | Where used |
|----------|---------|------------|
| `DATABASE_URL` | `sqlite:///./finance.db` | `backend/database.py` |
| `CORS_ORIGINS` | `http://localhost:4200,http://127.0.0.1:4200` | `backend/app.py` |
| `PRICE_CACHE_TTL` | `120` seconds | `backend/services/market_data.py` |
| `EOD_CACHE_HOURS` | `24` | `backend/services/market_data.py` |
| `LOG_LEVEL` | `INFO` | `backend/logging_config.py` |
| `LOG_SQL` | unset | `backend/database.py` |
| `LOG_HEALTH` | unset | `backend/logging_config.py` |
| `DISABLE_OPENAPI` | unset locally; `1` in Compose | `backend/app.py` |
| `ALEMBIC_STRICT` | `1` | `backend/database.py` |
| `RATE_LIMIT_PER_MIN` | unset locally; `60` in Compose | `backend/rate_limit.py` |
| `SESSION_DAYS` | `7` | `backend/auth.py` |
| `SESSION_COOKIE_SECURE` | `0` local / `1` prod | `backend/auth.py` |
| `SESSION_COOKIE_SAMESITE` | `lax` | `backend/auth.py` |
| `API_KEY` / `FINANCE_API_KEY` | unset | `backend/api_auth.py` |
| `API_HOST` / `PORT` / `API_PORT` | `127.0.0.1` / `8000` | `backend/main.py` |
| `DEBUG_HEALTH` | unset | `backend/routers/health.py` |
| `API_PROXY_TARGET` | `http://127.0.0.1:8000` | `frontend/proxy.conf.js` |
| `WEB_PORT` | `8080` local / `8085` prod | Compose + deploy workflow |
| `FINANCE_DATA_DIR` | `./data` | `scripts/backup-db.sh`, deploy |
| `FINANCE_BACKUP_DIR` | `data/backups` | `scripts/backup-db.sh` |

**Build:**
- `frontend/angular.json` — application builder, file replacements for `environment.development.ts` / `environment.production.ts`, budgets 650kB warn / 1MB error
- `frontend/tsconfig.json`, `frontend/tsconfig.app.json`, `frontend/tsconfig.spec.json`
- `frontend/tailwind.config.js`, `frontend/postcss.config.js`
- `backend/alembic.ini`
- `backend/pytest.ini`
- `Makefile` — `install`, `dev`, `test-*`, `docker-*`, `reset-db`

## Platform Requirements

**Development:**
- Python 3.12 + `python3 -m venv`
- Node.js 20 + npm (lockfile-driven `npm ci` / `npm install`)
- Chrome/Chromium for `ng test` (Karma ChromeHeadless); set `SKIP_FRONTEND_TESTS=1` if unavailable
- Optional: Docker + Compose for `make docker-up`
- First run: `make install && make dev` → UI `http://localhost:4200`, API `http://127.0.0.1:8000`

**Production:**
- Self-hosted Raspberry Pi (or similar) via Docker Compose
- Topology: public domain → host Nginx/Caddy TLS → loopback `127.0.0.1:8085` → `web` (Nginx + Angular) → private `api` (uvicorn) → SQLite at `/data/finance.db`
- Domain documented in `docs/DEPLOY.md`: `finance.vivekpanchagnula.com`
- Compose project name `finance_tracker`; data dir `/home/vivek/Deployments/finance-tracker/data`
- GitHub Actions: CI on `ubuntu-latest`; deploy on self-hosted runner labels `self-hosted`, `linux`, `finance-prod`
- Single SQLite writer; backups are file copies via `scripts/backup-db.sh`

---

*Stack analysis: 2026-08-30*
