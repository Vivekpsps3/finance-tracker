<!-- refreshed: 2026-08-30 -->
# Codebase Concerns

**Analysis Date:** 2026-08-30

## Tech Debt

**Legacy plaintext finance schema still created on every startup:**
- Issue: `Base.metadata.create_all` still materializes retired ledger tables (`transactions`, `assets`, `liabilities`, `holdings`, `job_incomes`, `fixed_expenses`, `subscriptions`, `bank_accounts`, `import_batches`, `brokerage_accounts`, `planning_assumption_profiles`, `planning_scenario_runs`) even though plaintext finance HTTP is unmounted. `migrations.py` continues to backfill those same tables. Encrypted product data lives in `encrypted_records`.
- Files: `backend/models.py`, `backend/database.py`, `backend/migrations.py`, `backend/services/encrypted_storage.py`
- Impact: Every new DB still has a second, unused finance schema. Operators can mistake leftover rows for product data. `GET /api/vault/migration/export` still serializes those rows as plaintext when `user_crypto_migrations.status == vault_ready`.
- Fix approach: Keep Alembic history. After fixtures prove no live user has leftover plaintext, add a drop migration for the retired tables and delete `LEGACY_COLLECTIONS` / `export_legacy_records()`. Until then do not add columns to the plaintext models.

**Three schema authorities on startup:**
- Issue: Startup always runs `create_all` → `run_sqlite_migrations` → Alembic `upgrade head` (`backend/database.py`). Lightweight SQL in `backend/migrations.py` duplicates Alembic/ORM work (job income, fixed expenses, subscriptions, planning, market research cache).
- Files: `backend/database.py`, `backend/migrations.py`, `backend/alembic/versions/`
- Impact: New columns can be applied by the wrong layer, producing inspector-guard drift. `ALEMBIC_STRICT=0` can leave a running API on a half-migrated file DB.
- Fix approach: Put new schema only in Alembic. Do not add more `_ensure_*` helpers in `migrations.py`. Leave `ALEMBIC_STRICT=1` in Docker/prod.

**Recovery-wrap columns survive a removed product path:**
- Issue: Product path is passphrase-only (`AGENTS.md`, `docs/SECURITY_MODEL.md`). Schema and APIs still carry `recovery_wrapped_dek_b64` (NOT NULL) and `auth_recovery_wrapped_private_key_b64`. Clients send empty strings. Historical docs still describe a recovery key.
- Files: `backend/models.py`, `backend/schemas_vault.py`, `backend/schemas_auth.py`, `backend/routers/vault.py`, `backend/routers/auth_routes.py`, `frontend/src/app/crypto/vault-crypto.ts`, `frontend/src/app/crypto/auth-crypto.ts`, `docs/MIGRATION_TO_SERVER_BLIND_ENCRYPTION.md`
- Impact: New agents reintroduce a recovery-key UI from stale docs. Empty NOT NULL wraps stay in every vault row.
- Fix approach: Treat empty recovery fields as unused. Do not build recovery UX. Update `docs/MIGRATION_TO_SERVER_BLIND_ENCRYPTION.md` to match passphrase-only. Drop columns only after a dedicated Alembic revision.

**Password-era auth leftovers:**
- Issue: Argon2 password verify, `/api/auth/login/migrate`, `must_change_password`, `password_hash`, and `migration_only` sessions remain for bounded enrollment. `create_user()` still defaults `must_change_password=True` and still hashes optional passwords. Users are stored with synthetic `{username}@pending.local` emails.
- Files: `backend/auth.py`, `backend/routers/auth_routes.py`, `backend/models.py`
- Impact: Extra attack surface and admin confusion (`must_change_password` on passwordless users). Fake emails leak into admin confirm strings (`RESET {email}` in `auth_routes.py`).
- Fix approach: Keep migrate endpoints until no password-hash rows remain. Do not add new password login. Prefer username in admin confirm copy.

**Stale documentation vs mounted API:**
- Issue: `docs/ARCHITECTURE.md` and `docs/DATA_MODEL.md` still describe `GET /api/net-worth/`, `GET /api/cashflow/summary`, `/api/planning/v1`, admin SQL console, and server-side Monte Carlo. `app.py` mounts only health, auth, vault, and market. Planning and net worth are browser-only (`frontend/src/app/crypto/client-finance.ts`, `frontend/src/app/services/planning.service.ts`).
- Files: `docs/ARCHITECTURE.md`, `docs/DATA_MODEL.md`, `docs/DEPLOY.md`, `docs/DEVELOPMENT.md`, `docs/MIGRATION_TO_SERVER_BLIND_ENCRYPTION.md`, `backend/app.py`
- Impact: Planners/executors will re-add unmounted routers or call dead endpoints.
- Fix approach: Edit those docs to match `docs/LIFECYCLE.md` and `backend/app.py` before any API/planning work. Do not remount plaintext finance HTTP.

**Deleted router bytecode still on disk:**
- Issue: `__pycache__` still has `transactions`, `holdings`, `assets`, `planning`, `imports`, `taxes`, `net_worth`, `cashflow`, and related modules under `backend/routers/`. Source files are gone.
- Files: `backend/routers/__pycache__/*.cpython-312.pyc`
- Impact: Search/tools can imply those routers still exist.
- Fix approach: Delete the stale pycache; do not restore those modules.

**Large feature components with mixed responsibilities:**
- Issue: Page components own load, mutate, import, and chart wiring. Largest: `frontend/src/app/planning/monte-carlo-fan-chart.component.ts` (763), `planning.component.ts` (694) + HTML (685), `transactions.component.ts` (679), `finance.service.ts` (587), `dashboard.component.ts` (566), `portfolio.component.ts` (559), `encrypted-store.service.ts` (527).
- Files: those paths
- Impact: Easy to break an invariant when adding a field. Hard to test.
- Fix approach: Keep new math in `client-finance.ts` / `*.util.ts`. Do not grow these components with more inline formulas.

## Known Bugs

**Idle lock is documented but not implemented:**
- Symptoms: Unlocked DEK stays in `VaultService` memory until explicit Lock or logout. No idle timer, visibility handler, or `beforeunload` wipe.
- Files: `frontend/src/app/crypto/vault.service.ts`, `frontend/src/app/core/layout/main-layout.component.ts`, `docs/MIGRATION_TO_SERVER_BLIND_ENCRYPTION.md`
- Trigger: Leave an unlocked session idle on a shared machine.
- Workaround: Use the Lock vault action in `main-layout.component.html`.

**Rate limiter misses signup and bootstrap:**
- Symptoms: `RATE_LIMIT_PER_MIN` only applies to passwordless lookup/challenge/verify and `/api/market/research`. Open signup and first-admin bootstrap are unlimited even when the env var is set. Systemic-repairs spec says they should be bounded.
- Files: `backend/rate_limit.py`, `backend/routers/auth_routes.py`, `docs/superpowers/specs/2026-07-10-systemic-repairs-design.md`
- Trigger: `POST /api/auth/signup/passwordless` or `/api/auth/bootstrap/passwordless` in a loop.
- Workaround: Put a reverse-proxy limit in front of `/api/auth/signup` and `/api/auth/bootstrap`.

**Access-log redaction targets a retired path:**
- Symptoms: `request_logging.py` only redacts `search=` on `/api/transactions`. That router is unmounted. Vault/auth query strings are logged whole.
- Files: `backend/request_logging.py`, `docs/DEPLOY.md`
- Trigger: Any logged query on live routes.
- Workaround: Do not put secrets in query strings. Keep finance identifiers in POST bodies.

**Dashboard/transaction views cap at 5000 rows:**
- Symptoms: `FinanceService.loadDashboard()` and import refresh call `getDashboardTransactions({ limit: 5000 })`. Extra imported history is omitted from dashboard/period charts without an overflow warning.
- Files: `frontend/src/app/services/finance.service.ts`
- Trigger: Import more than 5000 transactions.
- Workaround: Filter in the Transactions page (full `getTransactions()` still loads the in-memory bag; confirm the page does not also slice). If charts look short, check the 5000 cap first.

**Two tabs can desync encrypted revisions:**
- Symptoms: `EncryptedStoreService` is an in-memory singleton per tab. Each tab loads revisions once. Concurrent upserts from a second tab return 409 (`expected_revision`). There is no `BroadcastChannel` / focus reload.
- Files: `frontend/src/app/crypto/encrypted-store.service.ts`, `backend/services/encrypted_storage.py`
- Trigger: Edit the same collection in two browser tabs.
- Workaround: Use one tab. On 409, lock/unlock or reload to resync.

## Security Considerations

**Open self-signup on a domain-hosted personal app:**
- Risk: Anyone who can reach the origin can `POST /api/auth/signup/passwordless` and create a user (`auth_routes.py`). First user becomes admin. Later users are role `user` but still get a vault on the shared SQLite file.
- Files: `backend/routers/auth_routes.py`, `frontend/src/app/auth/signup.component.ts`, `frontend/src/app/app.routes.ts`
- Current mitigation: Invitation flow exists (`/admin/users` → `/signup?token=`). First-run bootstrap is gated on empty `users`. No signup feature flag.
- Recommendations: For a private household deploy, disable or gate open signup (invite-only env flag). Rate-limit signup/bootstrap. Do not assume `/signup` is admin-only.

**Passwordless lookup returns wraps to anyone who knows a username:**
- Risk: `POST /api/auth/passwordless/lookup` is unauthenticated and returns KDF salt, iterations, and wrapped DEK/signing key (or a decoy). Stolen wraps enable offline passphrase guessing (PBKDF2 310k).
- Files: `backend/routers/auth_routes.py`
- Current mitigation: Decoy material for unknown/disabled users. Optional in-process IP rate limit. 310k PBKDF2.
- Recommendations: Keep decoys. Always set `RATE_LIMIT_PER_MIN` in prod. Do not log lookup bodies.

**Session cookies default to insecure in the base Compose file:**
- Risk: `SESSION_COOKIE_SECURE` defaults to `0` in `backend/auth.py` and `docker-compose.yml`. A non-prod Compose deploy over HTTP will set the session cookie without Secure.
- Files: `backend/auth.py`, `docker-compose.yml`, `docker-compose.prod.yml`
- Current mitigation: `docker-compose.prod.yml` defaults Secure to `1`. `docs/DEPLOY.md` requires it for HTTPS.
- Recommendations: Never deploy the base compose file to a domain without the prod override. Fail startup if `CORS_ORIGINS` is HTTPS and Secure is off.

**Optional shared API key is a second auth plane:**
- Risk: `API_KEY` / `FINANCE_API_KEY` gates all `/api/*` except health when set (`backend/api_auth.py`). It is a single static secret, compared with `compare_digest`, but shared across all clients.
- Files: `backend/api_auth.py`, `backend/.env.example`
- Current mitigation: Unset for the browser app. Health is excluded.
- Recommendations: Leave unset for cookie-auth deploys. Do not add finance plaintext clients that depend on it.

**Legacy plaintext export is still a live endpoint:**
- Risk: Authenticated `GET /api/vault/migration/export` returns finance plaintext while migration status is `vault_ready` (`encrypted_storage.export_legacy_records`).
- Files: `backend/routers/vault.py`, `backend/services/encrypted_storage.py`
- Current mitigation: 409 unless status is `vault_ready`. New passwordless users are marked `completed` when legacy counts are empty.
- Recommendations: Do not call this except during leftover-row migration. After all users are `completed` and VACUUM'd, remove the endpoint.

**Server-blind model does not protect against a malicious JS bundle:**
- Risk: Operator or compromised static host can ship JS that captures the vault passphrase. Acknowledged non-goal in `docs/SECURITY_MODEL.md`.
- Files: `docs/SECURITY_MODEL.md`, frontend vault/auth crypto
- Current mitigation: Ciphertext-only DB; no server decrypt.
- Recommendations: Do not claim the host cannot read finance data if it also serves the Angular bundle.

**Ticker symbols leave the browser on purpose:**
- Risk: Portfolio refresh and Stock Lab send symbols to `/api/market/*` and yfinance. Cache tables `ticker_quotes` and `market_research_cache` store public symbol-level data.
- Files: `backend/routers/market.py`, `backend/services/market_data.py`, `frontend/src/app/portfolio/portfolio.component.ts`, `frontend/src/app/stock-lab/`
- Current mitigation: Shares, cost, accounts, and scenarios stay encrypted. UI/docs disclose the leak.
- Recommendations: Never describe tickers as server-blind after a refresh/research call.

**`LOG_SQL` can log leftover plaintext rows:**
- Risk: `LOG_SQL=1` echoes SQL. Retired tables still exist; any leftover row would appear in logs.
- Files: `backend/database.py`, `docs/DEVELOPMENT.md`
- Current mitigation: Documented as SEC-006. Default off.
- Recommendations: Keep unset in prod. Do not add SQL echo for debugging live finance DBs.

**Dev UI binds `0.0.0.0`:**
- Risk: `make frontend` uses `WEB_HOST ?= 0.0.0.0`, so an unlocked vault is reachable on the LAN.
- Files: `Makefile`
- Current mitigation: API default is `127.0.0.1:8000`. Comment in Makefile (SEC-011).
- Recommendations: Use `WEB_HOST=127.0.0.1` on untrusted networks.

## Performance Bottlenecks

**Full vault decrypt on first page load:**
- Problem: `EncryptedStoreService.ensureLoaded()` downloads every ciphertext row and decrypts in the browser. No collection pagination. Then it may rewrite every schema-v1 row (`rewriteLegacyRecords`).
- Files: `frontend/src/app/crypto/encrypted-store.service.ts`, `backend/routers/vault.py`
- Cause: Server-blind store cannot query/filter plaintext. Dashboard also fan-outs eight parallel reads (`finance.service.ts`).
- Improvement path: Fine for typical personal ledgers. If imports grow large, load by collection and skip dashboard `limit: 5000` slicing that hides rows. Do not add server-side finance search.

**yfinance research pulls multi-year history synchronously:**
- Problem: `MarketDataService._fetch_research` calls `ticker.info`, `history(period)`, dividends, and splits on the API request thread. Cold `10y`/`max` can stall Stock Lab. `ticker.info` is a known slow yfinance path.
- Files: `backend/services/market_data.py`, `backend/routers/market.py`
- Cause: No worker queue; SQLite cache only after a successful fetch. In-memory rate limit is optional.
- Improvement path: Keep the SQLite research cache. Avoid `force_refresh` in loops. Do not add pandas-level processing in the request path.

**Fidelity account nickname rewrite updates every holding:**
- Problem: `setBrokerageAccountNickname` upserts the account then `updateHolding` for each matching row (each an encrypt + vault upsert).
- Files: `frontend/src/app/crypto/encrypted-store.service.ts`
- Cause: `account_display` is denormalized onto holdings.
- Improvement path: Accept the N upserts for small portfolios. If accounts get large, derive display at read time only (already partially done in `getHoldings()`).

**Category bulk rename is N sequential upserts:**
- Problem: `bulkRenameTransactionCategories` updates matching transactions one-by-one.
- Files: `frontend/src/app/crypto/encrypted-store.service.ts`
- Cause: Vault API max batch is 200 (`MAX_BATCH`) but the client does not batch renames.
- Improvement path: Batch upserts up to 200 if rename-all becomes slow.

**In-process rate-limit map never expires keys:**
- Problem: `_buckets` in `rate_limit.py` grows by client IP for the process lifetime.
- Files: `backend/rate_limit.py`
- Cause: Simple dict, no GC.
- Improvement path: Acceptable for a single-user Pi. Evict idle keys if the host is public.

## Fragile Areas

**Financial data-plane invariants live only in the browser:**
- Files: `frontend/src/app/crypto/client-finance.ts`, `frontend/src/app/services/planning.service.ts`, `frontend/src/app/crypto/encrypted-store.service.ts`, `AGENTS.md`
- Why fragile: Net worth must stay `assets + holdings − liabilities`. Transactions, recurring cashflow, and planning must not write the balance sheet. Combined cashflow `net_cashflow` **adds** observed transactions and scheduled job/fixed/subscription amounts (`possible_*_overlap` flags only warn). Cash sweeps (SPAXX and similar) plus manual cash assets double-count by design.
- Safe modification: Change formulas only in `client-finance.ts` and add a case to `client-finance.spec.ts`. Do not make planning or imports update assets/holdings/liabilities except the explicit Fidelity replace path.
- Test coverage: `frontend/src/app/crypto/client-finance.spec.ts` and `encrypted-store.service.spec.ts` cover core math and migration. Page components that display the numbers mostly lack specs.

**Fidelity import replaces account positions:**
- Files: `frontend/src/app/utils/fidelity-import.util.ts`
- Why fragile: Commit deletes existing holdings for masks in the file, then inserts parsed rows. Wrong file or partial CSV wipes those positions. Matching also uses `account_display` when IDs diverge.
- Safe modification: Keep preview + confirm. Add a fixture in `fidelity-import.util.spec.ts` for any matcher change. Do not add a server-side Fidelity importer.
- Test coverage: Good unit specs; no e2e of the replace confirm.

**Schema-v1 → v2 rewrite plus leftover plaintext migration:**
- Files: `frontend/src/app/crypto/encrypted-store.service.ts`, `backend/services/encrypted_storage.py`
- Why fragile: `rewriteLegacyRecords` re-encrypts v1 rows with AAD, then may call `completeLegacyMigration` when status is not `vault_ready`. `migrateLegacyPlaintext` exports server plaintext, encrypts, then deletes legacy SQL rows. Wrong status/count pairing 409s and can leave a half-migrated user.
- Safe modification: Do not change `CURRENT_RECORD_SCHEMA_VERSION` or AAD fields without a paired client/server test. Do not delete plaintext tables until WAL checkpoint + `VACUUM` (not automated — see below).
- Test coverage: `encrypted-store.service.spec.ts`, `backend/tests/test_vault_encryption.py`, `backend/tests/test_migrations.py`.

**Alembic vs `create_all` vs leftover ORM:**
- Files: `backend/database.py`, `backend/models.py`, `backend/alembic/versions/`
- Why fragile: Adding a column to a retired model recreates a plaintext finance table as if it were live. Adding an encrypted-only collection requires `ALLOWED_COLLECTIONS` in `encrypted_storage.py` **and** the frontend `CollectionName` union.
- Safe modification: New finance entities go in vault collections, not new SQL tables. New SQL is for auth/vault/market only.
- Test coverage: `backend/tests/test_migrations.py` named generations in `docs/LIFECYCLE.md`.

**Challenge message origin is caller-supplied:**
- Files: `backend/routers/auth_routes.py`, `backend/services/challenge_auth.py`
- Why fragile: Origin comes from the `Origin` header (or `base_url`). Verify checks the signed message, not that origin is in `CORS_ORIGINS`.
- Safe modification: Do not drop origin from the signed message. If tightening, compare against `CORS_ORIGINS` in `verify_challenge`.
- Test coverage: `backend/tests/test_auth_challenge.py`.

**Local detectors lack the documented versioning contract:**
- Files: `frontend/src/app/signals/detectors.ts`, `docs/SECURITY_MODEL.md`
- Why fragile: SEC-001 asks for stable `detectorId` + version. Current signals use `id` strings only (`cash-sweep-overlap`, etc.) and have no version field.
- Safe modification: Keep detectors pure (no `HttpClient`). Add `detectorId`/`version` if you persist signals.
- Test coverage: `frontend/src/app/signals/detectors.spec.ts`.

## Scaling Limits

**SQLite single writer, no WAL pragma:**
- Current capacity: One uvicorn process (`backend/Dockerfile` CMD has no `--workers`). Suitable for a household on a Pi.
- Limit: A second API replica or extra workers will hit SQLite write locks. Default journal mode is DELETE; nothing sets `PRAGMA journal_mode=WAL`.
- Scaling path: Stay on one API container. If concurrency hurts, enable WAL in `database.py` connect args, then consider LiteFS/a single writer. Do not put Postgres under this app unless product direction changes.

**Vault ciphertext and in-memory bags:**
- Current capacity: Personal transaction history + holdings. `MAX_CIPHERTEXT_BYTES = 512_000` per record; `MAX_BATCH = 200`.
- Limit: `listRecords` returns the user's entire vault. Browser RAM and first-unlock decrypt time grow linearly. Dashboard silently uses 5000 transactions.
- Scaling path: Collection-scoped loads. Do not add server-side plaintext indexes beyond existing blind-index exact match.

**No automated backup or VACUUM:**
- Current capacity: `scripts/backup-db.sh` (online backup API) + `scripts/verify-backup.sh`. Deploy workflow can back up; there is no cron in-repo. WAL checkpoint + `VACUUM` after plaintext delete is documented (`docs/SECURITY_MODEL.md`, `docs/LIFECYCLE.md`) and not implemented in code.
- Limit: Deleted plaintext can remain in unused SQLite pages and old backups until someone vacuums and rotates files.
- Scaling path: Run backup before upgrades. After the last user hits `completed`, checkpoint/VACUUM once, then rotate pre-migration backups. Keep backups user-managed unless an ops phase adds a job.

**Market cache is global and public:**
- Current capacity: One row per symbol in `ticker_quotes`; `(symbol, period)` in `market_research_cache`.
- Limit: Any logged-in user can fill the cache (and disclose that symbol on the host). yfinance can rate-limit or break unofficially.
- Scaling path: Keep `RATE_LIMIT_PER_MIN` on research. Do not cache user-specific fields.

## Dependencies at Risk

**yfinance (unofficial Yahoo scrape):**
- Risk: Breaks without a semver API. Pulls heavy transitive deps (pandas/numpy) into the slim image. `ticker.info` is slow and frequently changes.
- Impact: Portfolio refresh and Stock Lab research return `valid=false` / 502. Net worth then falls back to `purchase_price` (`client-finance.ts`).
- Migration plan: Keep purchase/import prices as the fallback. Do not treat live quotes as required for net worth. SimpleFIN is the intended later bank path; do not add Plaid.

**Karma + ChromeHeadless for all frontend tests:**
- Risk: `make test-frontend` and CI require Chrome. Headless Chrome missing on a Pi or minimal agent host fails the suite (`AGENTS.md` already calls this out).
- Impact: Agents skip frontend tests (`SKIP_FRONTEND_TESTS=1`) and ship UI without the invariant specs.
- Migration plan: Keep CI on GitHub-hosted Ubuntu (has Chrome). On hosts without Chrome, say so and still run `npx ng build --configuration development`.

**Alembic pin `<1.15` and FastAPI `<0.116`:**
- Risk: `backend/requirements-prod.txt` uses tight upper bounds. Fine for reproducibility; upgrades need a deliberate bump.
- Impact: Security patches above the cap will not install.
- Migration plan: Bump pins in a dedicated change with `make test-backend`.

**Redis / Plaid leftovers in docs only:**
- Risk: `docs/DEVELOPMENT.md` mentions Redis env and Plaid placeholders. `backend/.env.example` has neither. `portfolio.component.ts` still labels `redis*` price sources. No Redis/Plaid code.
- Impact: Agents may add Redis or Plaid "because docs say so."
- Migration plan: Ignore those docs. CSV now; SimpleFIN later; no Plaid.

## Missing Critical Features

**No passphrase recovery (intentional):**
- Problem: Lost vault passphrase permanently loses ciphertext. Admins can only wipe contents (`reset_user_contents` in `backend/admin_tools.py`).
- Blocks: User support / "reset my password." Do not add an admin unwrap. Document this in UX copy before adding household users.

**No idle vault lock:**
- Problem: Documented in the migration security writeup; not built (`vault.service.ts`).
- Blocks: Shared-workstation safety without relying on the user to click Lock.

**No WAL checkpoint + VACUUM after plaintext delete:**
- Problem: Required by `docs/SECURITY_MODEL.md` and `docs/LIFECYCLE.md` so DB files stop containing leftover plaintext pages.
- Blocks: Claiming a migrated DB dump has no finance plaintext.

**No household sharing:**
- Problem: Multi-user accounts exist; there is no shared ledger, shared vault, or joint net worth (`AGENTS.md`).
- Blocks: Partners seeing one combined balance sheet. Do not share a vault passphrase across users as a workaround.

**No stored net worth history:**
- Problem: Invariant: net worth is current-only. `f1a2b3c4d5e6` dropped `net_worth_snapshots`. Charts cannot show a true historical NW series.
- Blocks: "How did net worth change last year?" Do not reconstruct it from transactions.

**No SimpleFIN (planned) and no extra broker importers:**
- Problem: Banks: Capital One, Chase, Amex, Citi, X Money CSVs (`bank-import.util.ts`). Brokerage: Fidelity only. SimpleFIN is later; Plaid is out of scope.
- Blocks: Automatic account sync. Add banks via `docs/ADDING_A_BANK_IMPORT.md` (client parser only).

**No automated backup job:**
- Problem: `docs/DEPLOY.md` / `docs/BACKUP.md` leave backups to the operator. `make reset-db` / `make reset-docker-db` delete the live file.
- Blocks: Hands-off Pi deploys. Run `scripts/backup-db.sh` before upgrades.

## Test Coverage Gaps

**Major Angular pages have no component specs:**
- What's not tested: Dashboard, transactions, calendar, income, fixed expenses, subscriptions, assets-liabilities, planning page, vault setup/unlock, charts, main layout. Specs exist for crypto, client-finance, imports, portfolio, stock-lab, auth, admin, detectors, and a few services.
- Files: `frontend/src/app/dashboard/dashboard.component.ts`, `frontend/src/app/transactions/transactions.component.ts`, `frontend/src/app/planning/planning.component.ts`, `frontend/src/app/income/income.component.ts`, `frontend/src/app/calendar/calendar.component.ts`, `frontend/src/app/assets-liabilities/assets-liabilities.component.ts`, `frontend/src/app/vault/`
- Risk: UI can show combined cashflow as if it were observed, or wire planning back to holdings, without a failing test.
- Priority: High for dashboard/planning/transactions (invariant surfaces). Low for presentational `ui-*` wrappers.

**E2E is a single anonymous smoke test:**
- What's not tested: Login, vault unlock, import, net worth display, admin invite.
- Files: `frontend/e2e/smoke.spec.ts`
- Risk: Auth/cookie/CSRF regressions only show up manually.
- Priority: Medium. Prefer one Playwright path: signup/bootstrap → unlock → add asset → see net worth.

**Backend no longer owns finance math, and has no replacement invariant suite there:**
- What's not tested: `computeNetWorth` / cashflow overlap / planning non-mutation are frontend-only. `make test-finance` runs `test_migrations.py` plus a few Angular includes. Unmounted-router absence is checked in `backend/tests/test_openapi.py`.
- Files: `Makefile`, `frontend/src/app/crypto/client-finance.spec.ts`, `frontend/src/app/services/planning.service.spec.ts`
- Risk: A new backend router that writes `assets` from transactions would not fail a backend finance test.
- Priority: High — keep `test_openapi.py` assertions if any finance router is proposed. Add a backend test that `USER_OWNED_MODELS` are never written by market/auth/vault except wipe/migration delete.

**Signup/bootstrap rate-limit and idle-lock have no tests:**
- What's not tested: Open signup under `RATE_LIMIT_PER_MIN`; vault idle expiry.
- Files: `backend/rate_limit.py`, `backend/tests/test_api_auth.py`, `frontend/src/app/crypto/vault.service.ts`
- Risk: Limits and lock behavior drift from `docs/DEPLOY.md` / security model.
- Priority: Medium.

**VACUUM / leftover-plaintext bytes are unverified:**
- What's not tested: Post-migration SQLite file contains no known plaintext (SECURITY_MODEL verification list).
- Files: `backend/services/encrypted_storage.py`, `docs/SECURITY_MODEL.md`
- Risk: Operators believe encryption is complete while retired tables or WAL pages still hold amounts.
- Priority: High before dropping legacy tables.

---

*Concerns analysis: 2026-08-30*
