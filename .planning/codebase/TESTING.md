# Testing Patterns

**Analysis Date:** 2026-08-30

## Test Framework

**Runner:**
- Backend: pytest `>=8.3.0,<9.0.0` (`backend/requirements.txt`). Config: `backend/pytest.ini` (only filters the Starlette/httpx `TestClient` deprecation).
- Frontend unit: Karma `~6.4` + Jasmine `~5.5` via Angular 19 (`frontend/package.json`, `frontend/karma.conf.js`, `frontend/angular.json` `test` target). `tsconfig.spec.json` types: `jasmine`.
- Frontend e2e: Playwright `^1.51` (`frontend/playwright.config.ts`).

**Assertion Library:**
- Backend: pytest `assert` plus `res.status_code` / `res.json()` on `fastapi.testclient.TestClient`.
- Frontend: Jasmine (`expect`, `toBe`, `toEqual`, `toHaveBeenCalled`, `expectAsync`).
- E2E: Playwright `expect` locators.

**Run Commands:**
```bash
make test                      # Backend pytest + frontend Karma (ChromeHeadless)
make test-backend              # cd backend && python -m pytest -q
make test-frontend             # ng test --watch=false --browsers=ChromeHeadless
make test-finance              # migrations + client-finance/planning/format specs
make test-security             # vault/auth/openapi + detectors/client-finance/evidence-labels
make test-fast                 # ./scripts/check-doc-paths.sh only
make test-full                 # doc-paths + unit tests + ng build + docker build
make check                     # backend + frontend unit + production frontend build

cd backend && python -m pytest -q
cd backend && python -m pytest -q tests/test_vault_encryption.py
cd frontend && npm test -- --watch=false --browsers=ChromeHeadless
cd frontend && npx ng test --no-watch --browsers=ChromeHeadless --include='**/client-finance.spec.ts'
cd frontend && npm run e2e     # Playwright; needs API+UI or uses ng serve
```

`SKIP_FRONTEND_TESTS=1` skips Karma in Makefile targets. Frontend unit tests need Chrome. If Chrome is missing, say so — do not invent a Firefox/jsdom runner.

## Test File Organization

**Location:**
- Backend: separate tree `backend/tests/`. Shared fixtures in `backend/tests/conftest.py`.
- Frontend: colocated next to the unit under test (`finance.service.spec.ts` beside `finance.service.ts`).
- E2E: `frontend/e2e/smoke.spec.ts` only.
- Golden JSON: `backend/tests/planning/golden/fire_number_summary.json`.
- Doc-path smoke: `scripts/check-doc-paths.sh` (OPS-002), invoked by `make test-fast`.

**Naming:**
- Backend: `test_<area>.py` + functions `test_<behavior>`.
- Frontend: `<file>.spec.ts` with `describe('<module or ClassName>', ...)`.
- E2E: `<name>.spec.ts` under `frontend/e2e/`.

**Structure:**
```
backend/tests/
├── conftest.py                  # in-memory DB guard, seed_user, authenticated_client
├── test_api_auth.py             # session, CSRF, admin, isolation
├── test_auth_challenge.py       # passwordless enroll / challenge / verify
├── test_vault_encryption.py     # vault setup, revisions, retired plaintext 404s
├── test_openapi.py              # docs on/off, retired paths absent
├── test_market_data.py          # MarketDataService, no live yfinance
├── test_market_research.py      # /api/market/research* HTTP
├── test_migrations.py           # Alembic + SQLite migration smoke
└── planning/golden/             # fixture JSON

frontend/src/app/**/*.spec.ts    # colocated unit specs
frontend/e2e/smoke.spec.ts       # anonymous login page
```

## Test Structure

**Suite Organization:**
```python
# backend/tests/test_vault_encryption.py
import os
os.environ["DATABASE_URL"] = "sqlite:///:memory:"  # before importing app

import pytest
from sqlalchemy import delete
from conftest import authenticated_client
from main import Base, app, engine

@pytest.fixture(autouse=True)
def reset_db():
    Base.metadata.create_all(bind=engine)
    with engine.begin() as conn:
        for table in reversed(Base.metadata.sorted_tables):
            conn.execute(delete(table))

def test_vault_setup_and_record_roundtrip():
    client = authenticated_client(app, email="vault@example.com")
    setup = client.post("/api/vault/setup", json={...})
    assert setup.status_code == 200, setup.text
    assert setup.json()["exists"] is True
```

```typescript
// frontend/src/app/crypto/client-finance.spec.ts
describe('client-finance', () => {
  const asset = (value: number): Asset =>
    ({ id: 1, name: 'Cash', category: 'cash', current_value: value, as_of_date: '2026-01-01' }) as Asset;

  it('computes net worth from assets, holdings, and liabilities', () => {
    const nw = computeNetWorth([asset(1000)], [liability(200)], [holding(10, 20)]);
    expect(nw.total).toBe(1000 + 200 - 200);
  });
});
```

**Patterns:**
- Setup: every HTTP test file that imports `app` sets `os.environ["DATABASE_URL"] = "sqlite:///:memory:"` **before** the import. `conftest.py` also sets it and **raises** if `SQLALCHEMY_DATABASE_URL` is a file DB.
- Reset: prefer `@pytest.fixture(autouse=True) def reset_db` that `create_all` + `DELETE` all tables (`test_api_auth.py`, `test_vault_encryption.py`, `test_market_research.py`). `test_auth_challenge.py` uses pytest `setup_function()` for the same wipe. Also call `market_data.clear_memory_cache()` and, for challenge tests, clear `rate_limit._buckets`.
- Auth: use `authenticated_client(app, email=..., role=UserRole.admin)` from `backend/tests/conftest.py`. It logs in via `/api/auth/login/migrate`, flips `UserSession.migration_only` to `False`, and sets `X-CSRF-Token`.
- Unique emails per test (`vault@example.com`, `csrf@example.com`) so leftover rows cannot collide if a wipe is missed.
- Assertion: `assert res.status_code == 200, res.text` then assert JSON fields. Prefer exact `detail` strings for 400s (`"Invalid base64 payload"`).
- Frontend TestBed for services/interceptors/components that need DI. Manual `new Component(...)` with `jasmine.createSpyObj` for focused behavior (`portfolio.component.spec.ts`, `stock-lab.component.spec.ts`).
- OnPush components: spy on `cdr.markForCheck` after async work (`login.component.spec.ts`, `admin-users.component.spec.ts`).

## Mocking

**Framework:**
- Backend: `pytest.monkeypatch` (`setattr` on service methods or router singletons). Fake collaborators as small classes (`FakeMarketData` in `test_market_research.py`).
- Frontend: `jasmine.createSpyObj` + `HttpTestingController`. Newer specs use `provideHttpClient()` + `provideHttpClientTesting()` (`admin-users.component.spec.ts`); older ones still use `HttpClientTestingModule` (`finance.service.spec.ts`, `auth.service.spec.ts`). Either is fine; do not mix in one spec.

**Patterns:**
```python
# backend/tests/test_market_research.py — swap the router singleton
from routers import market as market_router
fake = FakeMarketData()
monkeypatch.setattr(market_router, "market_data", fake)
response = client.get("/api/market/research/voo", params={"period": "10y"})
assert fake.calls == [("VOO", "10y", False)]
```

```python
# backend/tests/test_market_data.py — no live yfinance
monkeypatch.setattr(svc, "_fetch_eod", lambda _s: (42.5, date.today(), "live_eod"))
```

```typescript
// frontend/src/app/services/finance.service.spec.ts
encStore = jasmine.createSpyObj<EncryptedStoreService>('EncryptedStoreService', [
  'getTransactions', 'addTransaction', 'getHoldings', 'getNetWorth',
]);
encStore.getTransactions.and.resolveTo([]);
http.expectNone(req => req.url.includes('/imports/'));
http.expectOne(r => r.url.endsWith('/market/price/AAPL')).flush({ symbol: 'AAPL', price: 200, valid: true });
```

**What to Mock:**
- `yfinance` / `MarketDataService._fetch_eod` / `market_data.get_research`. Never hit the network in unit tests.
- `EncryptedStoreService` and `VaultService` when testing `FinanceService`, `PlanningService`, `AuthService`, or page components.
- `HttpClient` via `HttpTestingController` for `/api/market/*` and `/api/auth/*`.
- `Router`, `ChangeDetectorRef`, `ToastService` with spy objects.
- Rate-limit buckets and in-memory price cache between tests.

**What NOT to Mock:**
- `computeNetWorth`, cashflow enrichment, import parsers, formatters — run the real functions (`client-finance.spec.ts`, `bank-import.util.spec.ts`, `format.util.spec.ts`).
- `vault-crypto` / `auth-crypto` WebCrypto — real `encryptJson` / `createSigningKey` with reduced PBKDF2 iterations (`120_000`).
- FastAPI + SQLAlchemy on in-memory SQLite for vault/auth/migration tests. These are API tests, not mocked handlers.
- Alembic upgrade path in `test_migrations.py` (temp file SQLite, real `command.upgrade`).

## Fixtures and Factories

**Test Data:**
```python
# backend/tests/conftest.py
TEST_PASSWORD = "correct-horse-battery-staple"

def seed_user(email: str = "user@example.com", role: UserRole = UserRole.user):
    ...

def authenticated_client(app, email: str = "user@example.com", role: UserRole = UserRole.user) -> TestClient:
    ...
```

```python
# local helpers inside the spec file, not a fixtures package
def _b64(n: int = 32) -> str:
    return base64.b64encode(b"x" * n).decode("ascii")
```

```typescript
const asset = (value: number): Asset => ({ ... } as Asset);
const file = new File([csv], 'capital.csv', { type: 'text/csv' });
```

**Location:**
- Shared backend only: `backend/tests/conftest.py`.
- Passwordless key material: `passwordless_material()` in `backend/tests/test_auth_challenge.py` (real P-256 key).
- Frontend: inline factory functions at the top of each `describe`. No `testing/` folder.
- Planning golden: `backend/tests/planning/golden/fire_number_summary.json` (`annual_spending` 40000 → `fire_target` 1000000).
- Crypto tests use the well-known passphrase `correct-horse-battery-staple` / `correct horse battery staple`.

## Coverage

**Requirements:**
- Frontend Karma gate in `frontend/karma.conf.js` (QA-012, intentionally low while specs grow):
  - statements `20`, branches `10`, functions `15`, lines `20`
- Reports: `frontend/coverage/finance-app/` (`html`, `text-summary`, `lcovonly`). `codeCoverage: true` in `frontend/angular.json`.
- Backend: no coverage package, no pytest `--cov` config. Not detected.

**View Coverage:**
```bash
cd frontend && npm test -- --watch=false --browsers=ChromeHeadless
# then open frontend/coverage/finance-app/index.html
```

Do not raise the Karma thresholds in a drive-by change. Add specs for the invariant you touch instead.

## Test Types

**Unit Tests:**
- Pure TS finance math: `frontend/src/app/crypto/client-finance.spec.ts` (net worth, monthly enrichment, period cashflow). **Required** when changing formulas.
- Parsers/utils: `bank-import.util.spec.ts`, `fidelity-import.util.spec.ts`, `date.util.spec.ts`, `format.util.spec.ts`, `portfolio.util.spec.ts`, `stock-lab.util.spec.ts`, `evidence-labels.util.spec.ts`.
- Local detectors: `frontend/src/app/signals/detectors.spec.ts` (cash-sweep overlap, stale prices, duplicate expenses).
- Crypto: `vault-crypto.spec.ts` (AES-GCM + AAD identity), `auth-crypto.spec.ts` (passphrase-wrapped signing key).
- Market cache: `backend/tests/test_market_data.py` (non-ticker short-circuit, memory hit, failed-symbol backoff, naive UTC `fetched_at`).

**Integration Tests:**
- Vault HTTP + SQLite: `test_vault_encryption.py` (setup, upsert, revision `409`, retired plaintext `404`, migration complete-after-verify).
- Auth/session/CSRF/admin isolation: `test_api_auth.py`, `test_auth_challenge.py`.
- OpenAPI surface: `test_openapi.py` (`DISABLE_OPENAPI=1` hides docs; plaintext finance paths must not appear).
- Market research HTTP: `test_market_research.py` (symbol normalize, invalid `400`, batch cap `422`).
- Schema upgrades: `test_migrations.py` (legacy holdings → head, vault tables idempotent after `create_all`, tax documents / net-worth snapshots stay gone).
- Frontend service + HTTP: `finance.service.spec.ts` (CSV import must **not** call `/imports/`; ticker refresh hits `/market/price/SYMBOL?refresh=true`).
- Planning: `planning.service.spec.ts` (client Monte Carlo shape, seed `0`, spend source `active-recurring-schedules`, `run.id` is `null`).
- Encrypted store: `encrypted-store.service.spec.ts` (occurrence-based cashflow, schema-v1 → v2 rewrite before deleting legacy).

**E2E Tests:**
- Playwright smoke only: `frontend/e2e/smoke.spec.ts` checks `/login` heading `Finance` and button `Sign in`.
- Config: `testDir: 'e2e'`, `baseURL` `E2E_BASE_URL` or `http://localhost:4200`, `webServer` runs `npm run start` unless `E2E_SKIP_WEB_SERVER` is set, `reuseExistingServer: true`.
- Not wired into `make test`. Run with `cd frontend && npm run e2e` after `make dev` if you need the API.

## Common Patterns

**Async Testing:**
```typescript
// Observables — done/done.fail
service.createRun({ tool_id: MC_TOOL_ID, n_paths: 100, horizon_years: 3, seed: 7 }).subscribe({
  next: run => {
    expect(run.id).toBeNull();
    done();
  },
  error: done.fail,
});

// Promises / WebCrypto
await expectAsync(decryptJson(dek, ct, recordAad('liabilities', 'asset-001', 2, 1))).toBeRejected();

// HttpTestingController after an async subscribe
setTimeout(() => {
  http.expectOne(r => r.url.endsWith('/market/price/AAPL')).flush({ symbol: 'AAPL', price: 200, valid: true });
});
```

```python
# Temp-file SQLite for Alembic (never the developer finance.db)
with tempfile.TemporaryDirectory() as tmp:
    url = f"sqlite:///{Path(tmp) / 'legacy_alembic.db'}"
    os.environ["DATABASE_URL"] = url
    command.upgrade(cfg, "head")
```

**Error Testing:**
```python
assert client.get("/api/vault/status").status_code == 401
assert client.post("/api/auth/reset-data", json={"confirm": "CLEAR"}).status_code == 422
assert conflict.status_code == 409
assert client.get("/api/assets/").status_code == 404  # retired plaintext finance
```

```typescript
http.expectNone(req => req.url.includes('/imports/'));
await expectAsync(loginPromise).toBeRejected();
expect(auth.clearLocalSession).not.toHaveBeenCalled(); // passwordless 401 must stay on /login
```

**Financial invariants to cover when you touch the math:**
- Net worth ignores transactions and recurring rows (`client-finance.spec.ts`).
- Bank/Fidelity import writes encrypted records, not `/api/imports/*` (`finance.service.spec.ts`).
- Planning runs are client-side and do not persist a server `id` (`planning.service.spec.ts`).
- Schema-v1 ciphertext is rewritten to authenticated-record AAD before legacy delete (`encrypted-store.service.spec.ts`, `vault-crypto.spec.ts`).
- Lost-passphrase / no recovery wrap: `recovery_wrapped_dek_b64` / `recovery_wrapped_private_key_b64` stay `''`.

**Component test styles in this repo:**
1. **TestBed + real standalone component** — `app.component.spec.ts`, `login.component.spec.ts`, `admin-users.component.spec.ts`, `ui-dialog.component.spec.ts` (host wrapper for focus trap).
2. **Manual construct + spies** — `portfolio.component.spec.ts`, `stock-lab.component.spec.ts`, `investment-insights.component.spec.ts`. Use this for one behavior (stale response ignored, default growth rate) without compiling templates.

**Pages without specs (add a spec if you change behavior):**
- `dashboard`, `transactions`, `income`, `fixed-expenses`, `subscriptions`, `calendar`, `planning`, `vault-setup`, `vault-unlock`, `signup`, `main-layout`, most `ui-*` except `ui-dialog`.

**Safety rails every backend test must keep:**
1. `DATABASE_URL=sqlite:///:memory:` before importing `main`/`app`.
2. Do not point tests at `backend/finance.db`.
3. Wipe tables (or use a throwaway file DB) per test.
4. Authenticate through `authenticated_client` rather than forging cookies.
5. Do not reintroduce assertions against plaintext finance HTTP except to prove `404`.

---

*Testing analysis: 2026-08-30*
