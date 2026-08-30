# Coding Conventions

**Analysis Date:** 2026-08-30

## Naming Patterns

**Files:**
- Backend Python modules: `snake_case.py`. Routers live in `backend/routers/` (`auth_routes.py`, `vault.py`, `market.py`, `health.py`). Pydantic contracts are top-level `schemas_*.py` (`backend/schemas_auth.py`, `backend/schemas_vault.py`, `backend/schemas_market.py`). Domain logic lives in `backend/services/` (`encrypted_storage.py`, `market_data.py`, `challenge_auth.py`).
- Backend tests: `backend/tests/test_<area>.py` (`test_vault_encryption.py`, `test_api_auth.py`, `test_auth_challenge.py`, `test_market_data.py`).
- Frontend feature pages: folder + three-file component — `portfolio/portfolio.component.ts|html|css`.
- Frontend shared UI: `shared/ui/ui-<name>/ui-<name>.component.ts` with selector `ui-<name>`.
- Frontend utilities: `<topic>.util.ts` next to `<topic>.util.spec.ts` (`utils/format.util.ts`, `utils/bank-import.util.ts`).
- Frontend services: `<name>.service.ts` in `services/` or feature folders (`services/finance.service.ts`, `crypto/encrypted-store.service.ts`).
- Frontend models: `<domain>.model.ts` (`models/transaction.model.ts`, `models/planning.model.ts`, `models/stock-lab.model.ts`, `auth/auth.models.ts`).
- Frontend tests: colocated `*.spec.ts` (never a separate `__tests__` tree).
- Alembic revisions: `backend/alembic/versions/<rev>_<snake_description>.py`.

**Functions:**
- Python: `snake_case`. Private helpers start with `_` (`_iso`, `_vault_response`, `_require_p256_public_key`, `_hash_secret`). FastAPI handlers are verb-first (`vault_setup`, `list_encrypted_records`, `get_market_research`).
- TypeScript: `camelCase`. Exported math/helpers are verb-first (`computeNetWorth`, `formatMoney`, `buildBankImportPreview`). Angular event handlers use `on*` only on UI primitives (`UiButtonComponent.onClick`); feature pages use domain verbs (`refreshAllPrices`, `loadUsers`, `submit`).
- RxJS streams: public `name$`, private backing `_name` `BehaviorSubject` (`transactions$` / `_transactions` in `frontend/src/app/services/finance.service.ts`).
- Guards and interceptors: functional, camelCase (`authGuard`, `vaultGuard`, `authInterceptor`, `httpErrorInterceptor`).

**Variables:**
- Python locals and columns: `snake_case`. Env-backed constants are `UPPER_SNAKE` (`SESSION_COOKIE_NAME`, `CSRF_HEADER_NAME`, `ALLOWED_COLLECTIONS`, `MAX_BATCH`).
- TypeScript locals: `camelCase`. Persisted finance fields stay **snake_case** to match vault/API payloads (`current_value`, `balance_owed`, `dedupe_key`, `kdf_salt_b64`, `primary_symbol`). Do not camelCase those when adding model fields.
- Local-only view models may use camelCase (`currentValue`, `priceSource` in `frontend/src/app/signals/financial-signal.ts`). Map at the snapshot boundary (`build-local-snapshot.ts`); do not leak that shape into vault records.
- Boolean flags: `is_*` / `is*` (`is_active`, `isLoading`, `usersLoading`). UI step unions are string literals (`'upload' | 'preview'`).

**Types:**
- Python ORM: PascalCase classes, plural snake table names (`User` → `users`, `EncryptedRecord` → implied table). Str-enums use lowercase members (`UserRole.admin`, `AssetCategory.cash`) in `backend/models.py`.
- Pydantic: PascalCase with role suffix — `*Request`, `*Response`, `*Input` (`VaultCreateRequest`, `EncryptedRecordResponse`, `LoginRequest` in `backend/schemas_vault.py` / `backend/schemas_auth.py`).
- TypeScript: PascalCase interfaces (`Transaction`, `NetWorth`, `StockLabScenario`). Union string literals for closed sets (`'income' | 'expense'`, `'manual' | 'import'`). Shared UI variant types are exported (`UiButtonVariant`, `UiSourceKind`).
- Constants that are domain IDs: `UPPER_SNAKE` (`MC_TOOL_ID`, `CASH_SWEEP_SYMBOLS`, `PLANNING_DISCLAIMER`).

## Code Style

**Formatting:**
- Frontend: EditorConfig in `frontend/.editorconfig` — UTF-8, 2-space indent, final newline, trim trailing whitespace, **single quotes** for TypeScript.
- Backend: no EditorConfig / Black / Ruff / isort config. Follow surrounding files: 4-space indent, double-quoted strings, trailing commas in multi-line calls, blank line between top-level defs.
- TypeScript compiler is strict (`frontend/tsconfig.json`): `strict`, `noImplicitOverride`, `noImplicitReturns`, `noFallthroughCasesInSwitch`, `strictTemplates`, `strictInjectionParameters`. Do not add `any` except at test seams (`as any` on spies/fixtures).
- Prefer `from __future__ import annotations` on new backend modules (`backend/routers/vault.py`, `backend/services/encrypted_storage.py`). Use `X | None` on those files; older modules may still use `Optional[X]` (`backend/schemas_auth.py`).
- Numeric literals may use underscores (`120_000`, `100_000`) in tests and TS.
- No path aliases. Always relative imports (`../crypto/vault.service`, `../shared/ui`).

**Linting:**
- Not detected. No ESLint, Prettier, Biome, Ruff, Black, or mypy config in the repo.
- Gate is `make check` / `make test-backend` plus `npx ng build --configuration development` (see `AGENTS.md`). Angular production budgets live in `frontend/angular.json` (initial 650kB warn / 1MB error).
- Do not add a formatter/linter unless the phase asks for it. Match neighboring style instead.

## Import Organization

**Order:**
1. Future/stdlib (`from __future__ import annotations`, `os`, `json`, `datetime`).
2. Third-party (`fastapi`, `sqlalchemy`, `pydantic`, `@angular/*`, `rxjs`).
3. Local app modules (`auth`, `database`, `models`, `schemas_*`, `services.*`).
4. Relative frontend feature imports, then shared UI, then utils.

Group with a blank line between those bands when the file already does. Named imports are preferred over `import *`.

**Path Aliases:**
- Not used. `frontend/tsconfig.json` has no `paths`. Import `apiUrl` from `frontend/src/app/core/api-url.ts`. Import shared UI from `frontend/src/app/shared/ui` (barrel `index.ts`).

**Backend import style:**
- Flat package: `backend/` is on `sys.path` (tests insert it in `backend/tests/conftest.py`). Write `from models import User`, not `from backend.models import User`.
- Import the app under test from `main` (`from main import Base, app, engine, market_data`) so tests share the same ASGI object uvicorn uses (`backend/main.py`).
- Empty `backend/services/__init__.py` — import submodules explicitly (`from services import encrypted_storage as store`).

## Error Handling

**Patterns:**
- Raise `HTTPException` with a **string** `detail` at the trust boundary. Status codes:
  - `400` validation / missing vault / bad symbol (`backend/services/encrypted_storage.py`, `backend/routers/market.py`)
  - `401` login / challenge / invitation (`backend/auth.py`, `backend/routers/auth_routes.py`)
  - `403` CSRF, admin, migration-only session (`backend/auth.py`)
  - `404` missing user/vault resource
  - `409` conflicts (vault exists, revision / migration mismatch)
  - `422` Pydantic / confirm-phrase failures
  - `502` upstream market-data failure (`backend/routers/market.py`)
- Chain with `from exc` when wrapping decode errors (`_require_p256_public_key` in `backend/routers/auth_routes.py`).
- Do not leak internals: unhandled exceptions become `{"error": "Internal server error", "code": 500}` in `backend/app.py`. HTTPExceptions are logged then returned as `{"detail": ...}`.
- Auth failures for unknown users must look like success on lookup/challenge (decoy material in `backend/routers/auth_routes.py`) so tests and new code do not “helpfully” return 404 for missing usernames.
- Frontend HTTP errors: `httpErrorInterceptor` in `frontend/src/app/core/http-error.interceptor.ts` toasts `error.detail` or `error.error`, except `/health`. `authInterceptor` in `frontend/src/app/auth/auth.interceptor.ts` attaches CSRF on mutating requests and redirects to `/login` on 401 **except** auth-attempt URLs.
- Feature pages set `error: string | null` and call `this.cdr.markForCheck()` on both success and failure. Tests in `login.component.spec.ts` and `admin-users.component.spec.ts` assert that.
- Crypto/unlock failures stay in the browser; do not POST passphrases or plaintext finance.

## Logging

**Framework:** stdlib `logging` via `backend/logging_config.py`. Logger name `finance_api` (access logs: `finance_api.access`).

**Patterns:**
- Call `setup_logging()` once at process start (`backend/app.py`). Get a logger with `get_logger()`.
- Message format is `event_name key=%s key=%s` (see startup log and `http_error` in `backend/app.py`). Do not log finance plaintext, passphrases, cookies, or raw `DATABASE_URL` — use `redact_database_url()`.
- Access middleware (`backend/request_logging.py`) redacts `search=` on `/api/transactions` (SEC-007). Skip `/api/health` unless `LOG_HEALTH` is set. Skip `OPTIONS`.
- 4xx → WARNING, 5xx / unhandled → ERROR + `logger.exception`.
- Frontend: no `console.log` logging framework. User-visible feedback is `ToastService` (`frontend/src/app/services/toast.service.ts`).

## Comments

**When to Comment:**
- Document a financial or security invariant next to the code (`PLANNING_DISCLAIMER` in `frontend/src/app/models/planning.model.ts`; cash-sweep double-count in detectors; “recovery-key path removed” on wrap fields).
- Ticket/requirement IDs in short notes are fine: `QA-012`, `SEC-007`, `PLAT-002`, `P2-BE-3`.
- Explain non-obvious protocol details (browser packed recovery wrap, schema-v1 vs v2 AAD, decoy passwordless material).
- Do not narrate what the next line does. Do not add changelog comments.

**JSDoc/TSDoc:**
- Sparse one-liners on exported helpers (`format.util.ts`, `api-url.ts`, `planning.model.ts`). Not required on every function.
- Python module/class docstrings on services and tests that need a contract (`MarketDataService`, `test_market_data.py`, `test_migrations.py`). FastAPI handlers usually have no docstring; the path + `response_model` is the contract.

## Function Design

**Size:**
- Keep HTTP handlers thin: validate, call `services.*`, `db.commit()`, map a response model (`backend/routers/vault.py`).
- Put ciphertext rules, collection allow-lists, and revision checks in `backend/services/encrypted_storage.py`.
- Put net worth / cashflow / enrichment math in `frontend/src/app/crypto/client-finance.ts`, not in components.
- Feature components may be large (dashboard/portfolio/transactions) but new behavior should land in a util/service first.

**Parameters:**
- FastAPI: typed body models + `Depends(get_current_user)` + `Depends(get_db)`. Unused auth deps are explicitly discarded (`del current_user` in `backend/routers/market.py`) so the route still requires login.
- TypeScript services: prefer explicit argument objects already used by the API (`HoldingCreate`, `TransactionCreate`). Do not invent a parallel DTO layer.
- Default KDF iterations are `310000`. Tests may pass `120_000` to keep WebCrypto fast (`vault-crypto.spec.ts`).

**Return Values:**
- Routers return Pydantic models, never raw ORM on vault/auth/market.
- Encrypted-store methods return decrypted domain objects (`Asset`, `Transaction`) to the rest of the UI.
- Observables for HTTP/service APIs (`FinanceService`, `PlanningService`); `async`/`Promise` for WebCrypto and vault record I/O (`VaultService`, `EncryptedStoreService`, `AuthService.loginWithVault`).
- Net worth formula is fixed: `other_assets + portfolio - liabilities`. Do not derive it from transactions.

## Module Design

**Exports:**
- Angular: standalone components, `providedIn: 'root'` services. Feature routes lazy-load via `loadComponent` in `frontend/src/app/app.routes.ts`.
- Shared UI is the only barrel: `frontend/src/app/shared/ui/index.ts`. Import from `shared/ui`, not deep paths, for UI primitives.
- Backend `main.py` re-exports `app`, `engine`, `Base`, `market_data`, `get_db` for tests and uvicorn. Prefer `create_app()` from `backend/app.py` when a test needs a fresh app (OpenAPI env).

**Barrel Files:**
- Use only `shared/ui/index.ts`. Do not add `index.ts` barrels under `services/`, `utils/`, or `crypto/`.

**Angular UI rules (prescriptive):**
- New components: `standalone: true`, `changeDetection: ChangeDetectionStrategy.OnPush`, selector `app-<feature>` or `ui-<name>`.
- After every manual subscribe/promise mutation — including loading finalization and error paths — call `this.cdr.markForCheck()` (`docs/FRONTEND.md`).
- Shared primitives use `input()` / `output()` / `model()` (`frontend/src/app/shared/ui/ui-button/ui-button.component.ts`, `ui-input.component.ts`). Feature pages still use constructor DI + fields; newer shells use `inject()` (`AuthService`, `MainLayoutComponent`, `AdminUsersComponent`). Either is acceptable; do not mix both styles in one class.
- Destroy subscriptions with `takeUntil(this.destroy$)` (`portfolio.component.ts`).
- Use existing `ui-*` components and design tokens (`docs/FRONTEND.md`, `docs/DESIGN_GUIDE.md`). Cards are for real grouped surfaces, not decoration.
- API calls go through `apiUrl('/path')` and `environment.apiUrl`. Dev proxy is `frontend/proxy.conf.js`.

**Data-plane rules (do not blur):**
1. Net worth = current manual assets + portfolio market value − liabilities (`computeNetWorth` in `client-finance.ts`).
2. Transactions are a spending ledger and do not change net worth.
3. Recurring cashflow (job income, fixed expenses, subscriptions) may feed summaries/planning only.
4. Planning and Stock Lab are speculative and must not mutate holdings or net worth.
5. Backend vault stores ciphertext only. Finance plaintext stays in the browser.

---

*Convention analysis: 2026-08-30*
