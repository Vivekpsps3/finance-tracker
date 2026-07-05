# AI Handoff: 2026-06-27

> **Historical / superseded.** Session notes from 2026-06-27. Do **not** treat this
> file as current architecture. Prefer [ARCHITECTURE.md](./ARCHITECTURE.md),
> [DATA_MODEL.md](./DATA_MODEL.md), [FRONTEND.md](./FRONTEND.md), and
> [../AGENTS.md](../AGENTS.md). Some items below (for example net-worth snapshot
> HTTP routes and dashboard snapshot UX) may no longer match the code.

Use this only as historical context for what was attempted in that pass.

## User Intent

The user wants a one-shot, self-hosted, AI-agent-friendly finance tracker with
first-class support for:

- net worth
- spending/transactions
- investments/portfolio
- planning
- official tax document storage and yearly tax summaries
- Docker one-command hosting on a Raspberry Pi or similar

Future agents should preserve the central invariant:

```
net worth = current manual assets + current portfolio market value - liabilities
```

Transactions, tax documents, and planning must stay separate data planes unless
a feature explicitly maps them.

## Implemented In This Pass

### Net Worth Snapshots

- Added `NetWorthSnapshot` ORM model.
- Added `GET /api/net-worth/snapshots`.
- Added `POST /api/net-worth/snapshots`.
- Dashboard can record and display snapshot context.
- Removed legacy startup behavior that dropped `net_worth_snapshots`.
- Snapshot response mapper now tolerates legacy/null rows defensively.

Important files:

- `backend/models.py`
- `backend/services/finance.py`
- `backend/routers/net_worth.py`
- `backend/alembic/versions/9a7d1c3e5f20_add_net_worth_snapshots.py`
- `frontend/src/app/dashboard/*`

### Tax Center

- Added first-class tax document table storing files as SQLite BLOBs.
- Added structured tax summary values via `summary_json`.
- Added upload/list/summary/download/delete APIs under `/api/taxes`.
- Added Tax Center UI route `/taxes`.
- UI displays yearly totals, missing recommended docs, upload form, and stored
  document values.
- Added duplicate hash rejection per tax year/type.
- Added tax upload rate limiting.
- Added safer download headers and basic PDF/PNG/JPEG magic validation.

Important files:

- `backend/models.py`
- `backend/services/taxes.py`
- `backend/routers/taxes.py`
- `backend/alembic/versions/b4e8f3a1c2d9_add_tax_documents.py`
- `frontend/src/app/taxes/*`
- `frontend/src/app/services/finance.service.ts`
- `frontend/src/app/models/transaction.model.ts`

### Dashboard / Charts

- Dashboard now computes:
  - period income
  - period spending
  - net cashflow
  - savings rate
  - average daily spend
  - largest expense category
  - investment percentage of assets
  - snapshot change vs prior snapshot
- Charts now include:
  - monthly cashflow
  - spending by category
  - portfolio allocation

Important files:

- `frontend/src/app/dashboard/*`
- `frontend/src/app/charts/*`

### Docker / Deployment

- Added full one-command Docker Compose stack:
  - `web`: Nginx serving Angular and proxying `/api`
  - `api`: FastAPI private on Compose network
- Docker default DB path: `data/finance.db`.
- Local dev DB path remains `backend/finance.db`.
- Added frontend Dockerfile and Nginx config.
- Backend Dockerfile now installs `requirements-prod.txt`.
- Added healthchecks and restart policies.
- Added Makefile Docker targets: `docker-up`, `docker-down`, `docker-build`,
  `docker-rebuild`, `docker-logs`, `docker-ps`, `docker-config`,
  `reset-docker-db`.

Important files:

- `docker-compose.yml`
- `frontend/Dockerfile`
- `frontend/nginx.conf`
- `backend/Dockerfile`
- `backend/requirements-prod.txt`
- `data/.gitkeep`

### Docs For Future Agents

- Recreated/updated `AGENTS.md`.
- Added `docs/DESIGN_GUIDE.md`.
- Updated architecture, data model, frontend, deploy, backup, development docs.

Start future work by reading:

1. `AGENTS.md`
2. `docs/DESIGN_GUIDE.md`
3. `docs/ARCHITECTURE.md`
4. `docs/DATA_MODEL.md`
5. this file

## Reviewer Findings Already Applied

Applied fixes from subagent review:

- Removed destructive snapshot-drop migration helper.
- Clarified auth deployment modes: do not bake API keys into static Angular.
- Added Docker DB path docs.
- Made health endpoint return `503` when DB check fails.
- Added Caddy domain recipe.
- Added production requirements file.
- Fixed dashboard average daily spend denominator.
- Fixed mobile nav overflow after adding Tax Center.
- Reset native tax file input after upload.
- Replaced native tax delete confirm with app confirm service.
- Fixed tax table action layout.
- Fixed snapshot delta to compare against prior snapshot.
- Removed negative letter spacing from key stat/nav styles.
- Updated stale frontend docs.

## Verification Performed

Passed:

```bash
docker compose config
cd frontend && npx ng build --configuration development
```

Frontend build output path confirmed:

```text
frontend/dist/finance-app/browser
```

Not fully verified:

- Backend pytest/TestClient commands hung in this environment, including a
  single tax test and a minimal TestClient smoke script.
- The hang occurred after test collection or TestClient setup, before route
  output. It may be related to the local Python 3.14 / FastAPI TestClient /
  environment combination rather than app logic, but it still needs follow-up.

Interrupted commands:

```bash
make test-backend
cd backend && ../backend/.venv/bin/python -m pytest -q tests/test_balance_sheet.py tests/test_taxes.py tests/test_migrations.py tests/test_openapi.py
cd backend && ../backend/.venv/bin/python -m pytest -vv -s tests/test_taxes.py::test_upload_tax_document_and_year_summary
```

## Recommended Next Agent Steps

1. Investigate backend TestClient hang first.
   - Try running with system `python3` or a fresh venv.
   - Try importing `app` without `TestClient`.
   - Try direct service tests without FastAPI.
   - Check whether startup/lifespan + in-memory SQLite + Python 3.14 is the
     blocker.

2. Run backend verification once fixed:

   ```bash
   make test-backend
   ```

3. Run full frontend verification:

   ```bash
   cd frontend && npm test -- --watch=false --browsers=ChromeHeadless
   cd frontend && npx ng build --configuration development
   ```

4. Optionally run Docker build if network/dependency access is available:

   ```bash
   docker compose up --build
   ```

5. Re-check migrations:
   - Fresh empty SQLite Alembic chain was flagged by review as fragile because
     the base revision assumes app startup runs `Base.metadata.create_all()`
     first. App startup should work, but direct `alembic upgrade head` on an
     empty DB needs hardening if pure Alembic bootstrap is required.

## Important Caveats

- Tax summaries are manually entered structured values from official documents.
  No OCR/LLM extraction is implemented yet.
- Tax documents are stored inside SQLite; this keeps one-file backup semantics
  but can grow the DB quickly.
- Domain exposure should use Caddy/Cloudflare Access/Tailscale/external auth.
  Do not put an API key in Angular static assets.
- The app has no household login yet.
