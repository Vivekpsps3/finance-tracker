# Passwordless Vault Auth And Systemic Repairs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace user passwords with username plus vault-passphrase challenge authentication, safely migrate existing accounts and ciphertext, add global encrypted-portfolio price refresh, and repair every confirmed security, finance, planning, backend, and UI defect before one push to `main`.

**Architecture:** The browser owns all finance plaintext, the vault DEK, recovery material, and a wrapped P-256 authentication private key. The backend stores the public authentication key, encrypted wraps, ciphertext, and single-use challenge hashes; successful ECDSA challenge verification issues the existing HttpOnly session and CSRF cookies. Existing schema-v1 ciphertext and password accounts migrate through explicit versioned browser flows before legacy formats are retired.

**Tech Stack:** Angular 19, RxJS 7.8, WebCrypto PBKDF2/AES-GCM/ECDSA P-256, FastAPI 0.115, SQLAlchemy 2, SQLite, Alembic, Python `cryptography`, pytest, Karma/Jasmine, Chart.js.

## Global Constraints

- Net worth is current manual assets + portfolio market value - liabilities.
- Transactions and recurring cashflow never mutate net worth.
- Planning is speculative and never mutates holdings, balance-sheet records, or transactions.
- The vault passphrase, recovery key, DEK, authentication private key, and finance plaintext never reach the backend.
- Portfolio refresh may disclose normalized ticker symbols only; shares, costs, values, accounts, and notes remain encrypted.
- Existing users and schema-v1 ciphertext must remain recoverable throughout migration.
- Finance endpoints remain session-authenticated and mutations remain CSRF-protected.
- No implementation subtask commits. After all review gates and full verification, create one commit and push `main` once.
- Do not stage or modify the unrelated `.superpowers/` scratch directory.

## Current Working-Tree State

Task 1 was partially implemented before this plan rewrite. The working tree already contains strict base64 validation, revision-aware deletes, AAD helpers, and tests in:

- `backend/schemas_vault.py`
- `backend/services/encrypted_storage.py`
- `backend/tests/test_vault_encryption.py`
- `frontend/src/app/crypto/encrypted-store.service.ts`
- `frontend/src/app/crypto/vault-crypto.ts`
- `frontend/src/app/crypto/vault-crypto.spec.ts`
- `frontend/src/app/crypto/vault.service.ts`

Do not discard this work. It currently applies AAD to schema version 1 and would make old records unreadable. Task 1 must correct that before any later task proceeds.

---

### Task 1: Finish Versioned Vault Record Authentication Without Data Loss

**Files:**
- Modify: `frontend/src/app/crypto/vault-crypto.ts`
- Modify: `frontend/src/app/crypto/vault.service.ts`
- Modify: `frontend/src/app/crypto/encrypted-store.service.ts`
- Modify: `backend/schemas_vault.py`
- Modify: `backend/services/encrypted_storage.py`
- Test: `frontend/src/app/crypto/vault-crypto.spec.ts`
- Test: `frontend/src/app/crypto/encrypted-store.service.spec.ts`
- Test: `backend/tests/test_vault_encryption.py`

**Interfaces:**
- `recordAad(collection: string, clientId: string, schemaVersion: number, keyVersion: number): Uint8Array`
- `decryptRecord(dek, record): Promise<unknown>` decrypts schema 1 without AAD and schema 2 with AAD.
- `rewriteLegacyRecords(): Promise<number>` rewrites loaded schema-1 records as schema 2 using expected revisions.
- Delete payload: `{ collection, client_id, expected_revision }`.

- [ ] Add a failing crypto test that encrypts schema-1 JSON without AAD and proves the compatibility reader can decrypt it.
- [ ] Add a failing store test with one schema-1 record, run migration, assert the upsert uses `schema_version: 2`, AAD-bound ciphertext, and the original expected revision.
- [ ] Retain the existing failing tests proving swapped schema-2 metadata fails decryption, malformed/empty base64 returns 400, and stale delete returns 409.
- [ ] Run `backend/.venv/bin/python -m pytest backend/tests/test_vault_encryption.py -v` and `cd frontend && npx ng test --watch=false --browsers=ChromeHeadless --include='src/app/crypto/*.spec.ts'`; expected: compatibility/migration tests fail before implementation.
- [ ] Set `CURRENT_RECORD_SCHEMA_VERSION = 2`. Branch decryption exactly as follows: schema 1 calls `decryptJson(dek, ciphertext)`; schema 2 calls `decryptJson(dek, ciphertext, recordAad(...))`; every new write uses schema 2 and AAD.
- [ ] Implement `rewriteLegacyRecords()` after successful vault load. Re-encrypt each schema-1 payload under schema 2, preserve collection/client ID/key version, submit its current revision, and update the in-memory revision only after the server accepts it.
- [ ] Keep strict `base64.b64decode(value, altchars=b"-_", validate=True)`, reject decoded length zero, and preserve transactional revision comparison for deletes and blind indexes.
- [ ] Run focused tests; expected: all pass. Run `git diff --check`; expected: no output.
- [ ] Request task review. Do not proceed unless both spec compliance and code quality are approved.

### Task 2: Add Passwordless Authentication Persistence And Crypto Primitives

**Files:**
- Create: `backend/alembic/versions/e8a4c7d2f910_add_passwordless_vault_auth.py`
- Create: `backend/services/challenge_auth.py`
- Create: `frontend/src/app/crypto/auth-crypto.ts`
- Create: `frontend/src/app/crypto/auth-crypto.spec.ts`
- Modify: `backend/models.py`
- Modify: `backend/requirements.txt`
- Test: `backend/tests/test_auth_challenge.py`

**Interfaces:**
- User fields: nullable `username`, `auth_public_key_b64`, `auth_algorithm`, `auth_key_version`, `passwordless_enrolled_at`; nullable `password_hash` during migration.
- `AuthChallenge`: `id`, `user_id`, `challenge_hash`, `expires_at`, `consumed_at`, `created_at`.
- `AuthEnrollment`: `id`, `user_id`, `token_hash`, `expires_at`, `consumed_at`, `created_by_user_id`, `created_at`.
- Browser helpers: `generateAuthKeyPair()`, `wrapAuthPrivateKey(privateKey, passKey)`, `unwrapAuthPrivateKey(...)`, `signAuthChallenge(privateKey, message)`.
- Backend helpers: `issue_challenge(db, user, origin)`, `verify_and_consume_challenge(db, user, challenge_id, message, signature)`.

- [ ] Write backend tests asserting challenge hashes, 5-minute expiry, one-time consumption, cross-account rejection, disabled-user rejection, and replay rejection. Add enrollment-token tests proving only the hash is stored, expiry is 24 hours, and reuse fails.
- [ ] Write browser tests generating P-256 ECDSA keys, exporting public key as SPKI, wrapping private PKCS8 bytes with AES-GCM, unwrapping, and producing a 64-byte WebCrypto signature.
- [ ] Add explicit `cryptography>=44.0.0,<45.0.0` and use `ec.ECDSA(hashes.SHA256())`; convert browser raw `r || s` into DER with `encode_dss_signature` before verification.
- [ ] Define the signed UTF-8 message as `vault-auth-v1\n{challenge_id}\n{user_id}\n{normalized_username}\n{origin}\n{expires_at_iso}`. Do not accept client-selected account IDs, origins, or expiries.
- [ ] Store `sha256(raw_challenge)` and `sha256(raw_enrollment_token)` only. In one transaction, select the challenge/token, reject consumed/expired/mismatched rows, set `consumed_at`, flush, then allow session creation or enrollment.
- [ ] Alembic migration backfills `username = lower(email)`, fails on collisions rather than silently renaming, adds the challenge table/indexes, and leaves password hashes nullable but unchanged.
- [ ] Run focused browser/backend tests and `alembic upgrade head` against a temporary migrated database; expected: all pass.
- [ ] Request task review; no commit.

### Task 3: Implement Bootstrap, Enrollment, Challenge Login, And Recovery Auth Rotation

**Files:**
- Modify: `backend/schemas_auth.py`
- Modify: `backend/routers/auth_routes.py`
- Modify: `backend/routers/vault.py`
- Modify: `backend/services/encrypted_storage.py`
- Modify: `backend/auth.py`
- Modify: `backend/rate_limit.py`
- Test: `backend/tests/test_auth.py`
- Test: `backend/tests/test_auth_challenge.py`
- Test: `backend/tests/test_vault_encryption.py`

**Interfaces:**
- `GET /api/auth/bootstrap-status`
- `POST /api/auth/bootstrap/passwordless`
- `POST /api/auth/login/bootstrap` with username; returns public KDF/wrap/auth metadata or a generic unavailable response.
- `POST /api/auth/login/challenge`; returns challenge ID/message/expiry.
- `POST /api/auth/login/verify`; verifies signature and issues session/CSRF cookies.
- `POST /api/auth/passwordless/enroll` for legacy authenticated users.
- `POST /api/auth/invitations/{token}/enroll` for a new invited user to submit public auth/vault material once.
- `POST /api/vault/auth-key/rotate` for recovery or authenticated rotation.

- [ ] Write failing API tests for first-admin passwordless bootstrap, new-browser bootstrap lookup, successful verify, wrong signature, replay, expiry, cross-account signature, disabled account, recovery rotation, and session/CSRF behavior.
- [ ] Add enumeration-resistant responses: unknown usernames receive shape-compatible fake KDF/wrap metadata and cannot obtain a valid challenge session; verification errors always return `401 Authentication failed`.
- [ ] Bootstrap accepts username, display name, public SPKI key, encrypted private-key passphrase/recovery wraps, and vault setup payload in one transaction. It creates the first admin and vault config without accepting a password.
- [ ] Login bootstrap returns only public KDF parameters and encrypted wraps. It never returns encrypted finance records before session creation.
- [ ] Challenge verification calls the existing session creation helper only after transactional challenge consumption.
- [ ] Invitation enrollment validates and consumes the 24-hour hashed token in the same transaction that stores the user's public auth/vault material. It issues a normal session only after enrollment succeeds.
- [ ] Rotation requires a fresh challenge signed by the existing authentication private key. Recovery unwraps that same private key locally, so it uses the identical challenge proof; replace public key/wraps atomically and revoke other sessions.
- [ ] Rate-limit bootstrap lookup (30/IP/minute), challenge issue (10/account/IP/minute), verify (10/account/IP/minute), and legacy migration login (5/account/IP/15 minutes). Tests reset limiter state.
- [ ] Run focused auth/vault tests; expected: all pass. Request review; no commit.

### Task 4: Build The One-Secret Frontend Login, Setup, And Recovery Flow

**Files:**
- Modify: `frontend/src/app/auth/auth.models.ts`
- Modify: `frontend/src/app/auth/auth.service.ts`
- Modify: `frontend/src/app/auth/login.component.ts`
- Modify: `frontend/src/app/auth/login.component.html`
- Modify: `frontend/src/app/crypto/vault.service.ts`
- Modify: `frontend/src/app/vault/vault-setup.component.ts`
- Modify: `frontend/src/app/vault/vault-unlock.component.ts`
- Modify: `frontend/src/app/app.routes.ts`
- Test: `frontend/src/app/auth/auth.service.spec.ts`
- Test: `frontend/src/app/auth/login.component.spec.ts`
- Test: `frontend/src/app/crypto/vault.service.spec.ts`

- [ ] Write failing tests for username + vault passphrase login, wrong local unwrap, first setup, new browser, recovery re-wrap, and no finance fetch before challenge verification.
- [ ] Replace password form state with `username` and `vaultPassphrase`. Submit calls login bootstrap, locally unwraps DEK/auth key, requests challenge, signs exact server message, verifies, stores DEK only in memory, then navigates to the app.
- [ ] First setup generates DEK, recovery key, P-256 keypair, passphrase and recovery wraps in the browser, then submits one bootstrap payload. Display the recovery key exactly once with explicit confirmation.
- [ ] Recovery uses username + recovery key to unwrap DEK/auth private key, asks for a new vault passphrase, re-wraps both keys, rotates auth keys if required, and revokes other sessions.
- [ ] Preserve OnPush rendering by calling `markForCheck()` in every async success/error/final loading transition.
- [ ] Ensure network request assertions contain no passphrase, recovery key, DEK, private key, or finance plaintext.
- [ ] Run focused frontend specs; expected: pass. Request review; no commit.

### Task 5: Migrate Existing Password Accounts And Remove Password Product Surface

**Files:**
- Modify: `backend/routers/auth_routes.py`
- Modify: `backend/schemas_auth.py`
- Modify: `backend/admin_tools.py`
- Modify: `frontend/src/app/auth/auth.service.ts`
- Modify: `frontend/src/app/admin/users/admin-users.component.ts`
- Modify: `frontend/src/app/admin/users/admin-users.component.html`
- Modify: `frontend/src/app/core/layout/main-layout.component.ts`
- Test: `backend/tests/test_auth.py`
- Test: `frontend/src/app/admin/users/admin-users.component.spec.ts`

- [ ] Write failing migration tests: only users lacking an auth public key may use legacy password login; enrollment clears `password_hash`; enrolled accounts cannot password-login; admin cannot reset vault access.
- [ ] Keep `POST /api/auth/login/migrate` temporarily for unenrolled accounts only. After password verification it issues a short migration session restricted to `/auth/passwordless/enroll`, `/vault/*`, `/auth/me`, and logout.
- [ ] Enrollment atomically stores public auth metadata/wraps, clears password hash and `must_change_password`, marks enrollment time, upgrades the migration session, and audits `passwordless_enrolled` without key material.
- [ ] Replace admin create-user password fields with invitation username/display-name/role. Creation stores a 24-hour `AuthEnrollment` token hash and returns the raw token exactly once for secure delivery. Remove reset-password/change-password controls and endpoints. Keep disable, role, content reset, delete, and final-admin protections.
- [ ] Remove password wording from navigation, docs, and errors. Existing `email` may remain nullable contact metadata but username becomes the account identifier.
- [ ] Run focused tests; request review; no commit.

### Task 6: Complete Safe Legacy Plaintext Migration

**Files:**
- Modify: `backend/services/encrypted_storage.py`
- Modify: `backend/routers/vault.py`
- Modify: `backend/schemas_vault.py`
- Modify: `frontend/src/app/crypto/vault.service.ts`
- Modify: `frontend/src/app/crypto/encrypted-store.service.ts`
- Test: `backend/tests/test_vault_encryption.py`
- Test: `frontend/src/app/crypto/vault.service.spec.ts`

- [ ] Seed every user-owned legacy table in a failing test and assert vault setup cannot falsely report migration complete.
- [ ] Add `POST /api/vault/migration/complete` accepting expected encrypted `{collection, client_id}` identities and counts, never plaintext.
- [ ] Verify encrypted replacements belong to the authenticated user, include all required collections/counts, and are schema 2 before deleting legacy transactions, accounts/import batches, assets, liabilities, holdings/brokerage accounts, recurring rows, and planning profiles transactionally.
- [ ] Set migration completed only after deletion and verification. A retry after success is idempotent; a count mismatch returns 409 and deletes nothing.
- [ ] Add a database-level test that known plaintext marker strings are absent after checkpoint/VACUUM cleanup where supported.
- [ ] Run focused tests and review; no commit.

### Task 7: Add Global Encrypted Portfolio Price Refresh

**Files:**
- Modify: `frontend/src/app/services/finance.service.ts`
- Modify: `frontend/src/app/crypto/encrypted-store.service.ts`
- Modify: `frontend/src/app/portfolio/portfolio.component.ts`
- Modify: `frontend/src/app/portfolio/portfolio.component.html`
- Test: `frontend/src/app/services/finance.service.spec.ts`
- Test: `frontend/src/app/portfolio/portfolio.component.spec.ts`

- [ ] Write failing tests proving refresh sends only normalized symbols to `/market/price/{symbol}?refresh=true`, persists successful quotes encrypted, leaves failed/non-ticker prices unchanged, refreshes derived net worth locally, and reports success/failure counts.
- [ ] Add `updateHoldingPrice(id, { price, price_source, price_as_of })` that preserves all other holding fields and schema-2/AAD persistence.
- [ ] Refresh unique valid symbols with concurrency 4 (not an unbounded `forkJoin`), map quotes back to all matching holdings, and isolate per-symbol HTTP errors.
- [ ] Restore the top header action in vault mode. Show: `Refresh prices sends ticker symbols to the market quote service; holding details remain encrypted.`
- [ ] Never send shares, purchase price/date, value, account identifiers, nicknames, notes, or the complete holding object.
- [ ] Run focused tests and review; no commit.

### Task 8: Keep Vault Imports And Category Operations Client-Side

**Files:**
- Modify: `frontend/src/app/services/finance.service.ts`
- Modify: `frontend/src/app/crypto/encrypted-store.service.ts`
- Modify: `frontend/src/app/portfolio/portfolio.component.html`
- Modify: `frontend/src/app/transactions/transactions.component.html`
- Test: `frontend/src/app/services/finance.service.spec.ts`
- Test: `frontend/src/app/transactions/transactions.component.spec.ts`

- [ ] Write failing tests that encrypted category merge/bulk rename update every matching encrypted transaction with no legacy HTTP call and invalidate dashboard state.
- [ ] Implement store bulk updates with bounded sequential/upsert processing and emit one final transaction list after all writes succeed; report partial conflicts rather than silently diverging.
- [ ] Hide Fidelity import in vault mode until a browser-side Fidelity parser exists. Assert no `/imports/fidelity/*` request can occur.
- [ ] Bind import-preview checkbox `(change)` to row selection and preserve row-click behavior without double toggles.
- [ ] Run focused tests and review; no commit.

### Task 9: Correct Encrypted Recurring Cashflow And Dashboard Caching

**Files:**
- Modify: `frontend/src/app/crypto/client-finance.ts`
- Modify: `frontend/src/app/crypto/encrypted-store.service.ts`
- Modify: `frontend/src/app/services/finance.service.ts`
- Modify: `frontend/src/app/dashboard/dashboard.component.ts`
- Test: `frontend/src/app/crypto/client-finance.spec.ts`
- Test: `frontend/src/app/services/finance.service.spec.ts`
- Test: `frontend/src/app/dashboard/dashboard.component.spec.ts`

- [ ] Add failing table-driven tests for inactive, future, ended, weekly, biweekly, semimonthly, monthly, quarterly, and annual rows over one-day, partial-month, and multi-month inclusive ranges.
- [ ] Implement date-only occurrence enumeration matching `backend/services/cashflow.py`; avoid local-time parsing and count occurrences only inside both requested and record-effective ranges.
- [ ] Calculate job income from active effective periods and pay frequency. Return occurrence detail and correct savings rate/null semantics.
- [ ] Invalidate `dashboardLoad$` after every encrypted recurring add/update/delete. All-time selection must request an explicit min/max transaction/recurrence range or clear recurring summary, never reuse prior-period values.
- [ ] Run focused tests and review; no commit.

### Task 10: Make Encrypted And Backend Planning Inputs Truthful

**Files:**
- Modify: `frontend/src/app/services/planning.service.ts`
- Modify: `frontend/src/app/crypto/client-finance.ts`
- Modify: `backend/routers/planning.py`
- Modify: `backend/services/planning/snapshot.py`
- Modify: `backend/services/planning/runner.py`
- Test: `frontend/src/app/services/planning.service.spec.ts`
- Test: `backend/tests/test_planning.py`

- [ ] Write failing tests proving inactive recurring rows are excluded; manual cashflow, start net worth, contributions, allocations, returns, volatility, fees, tax drag, shocks, events, checkpoints, and seed alter encrypted simulation output.
- [ ] Map every request override into `clientMonteCarlo` and return the same paths/percentiles/checkpoints/disclaimer shape consumed by the UI. Preserve deterministic seed zero with `seed ?? 42` and Python `body.seed if body.seed is not None else 42`.
- [ ] Divide sparse transaction totals by the explicit inclusive analysis-window month count, including zero-transaction months.
- [ ] On timeout, call executor `shutdown(wait=False, cancel_futures=True)` outside a waiting context-manager path. Add elapsed-time assertion and cap concurrent runs.
- [ ] Run focused tests and review; no commit.

### Task 11: Repair Market Cache Concurrency And Stock Lab Stale Responses

**Files:**
- Modify: `backend/services/market_data.py`
- Modify: `frontend/src/app/stock-lab/stock-lab.component.ts`
- Test: `backend/tests/test_market_data.py`
- Test: `frontend/src/app/stock-lab/stock-lab.component.spec.ts`

- [ ] Add failing tests for two cold-cache inserts on the same `(symbol, period)` and for a slower prior symbol response completing after a newer selection.
- [ ] Use a SQLAlchemy nested transaction/savepoint around cache insert. On `IntegrityError`, roll back the savepoint and read the winning row without rolling back unrelated request work.
- [ ] Use one `switchMap` research stream or monotonically increasing request token; only the current symbol/scenario updates research/loading/error state.
- [ ] Run focused tests and review; no commit.

### Task 12: Finish OnPush And Import Interaction Repairs

**Files:**
- Modify: `frontend/src/app/admin/users/admin-users.component.ts`
- Modify: `frontend/src/app/auth/login.component.ts`
- Test: `frontend/src/app/admin/users/admin-users.component.spec.ts`
- Test: `frontend/src/app/auth/login.component.spec.ts`

- [ ] Add failing component tests where asynchronous success and error emissions occur without user interaction and assert visible state changes.
- [ ] Inject/use `ChangeDetectorRef` and call `markForCheck()` after each manual-subscription mutation, including loading finalization. Prefer `finalize()` where it prevents duplicated loading code.
- [ ] Confirm passwordless login tests from Task 4 still pass and admin invitation state renders immediately.
- [ ] Run focused tests and review; no commit.

### Task 13: Update Security, Architecture, Deployment, And User Documentation

**Files:**
- Modify: `AGENTS.md`
- Modify: `README.md`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/SECURITY_MODEL.md`
- Modify: `docs/DEPLOY.md`
- Modify: `docs/FRONTEND.md`

- [ ] Document username + vault-passphrase challenge login, public-key/session boundary, recovery limitations, migration behavior, and removal of admin password reset.
- [ ] State that explicit Portfolio refresh discloses ticker symbols to the backend/yfinance while all holding details remain encrypted.
- [ ] Document schema-v1 to schema-v2 AAD migration and legacy plaintext cleanup ordering.
- [ ] Search docs for `password`, `manual/imported prices`, `reset password`, and contradictory holdings-privacy claims; retain password wording only for the bounded legacy migration endpoint.
- [ ] Run `git diff --check`; request documentation/spec review; no commit.

### Task 14: Whole-Branch Review, Full Verification, One Commit, One Push

**Files:** All intended files from Tasks 1-13; exclude `.superpowers/`.

- [ ] Generate a whole-working-tree review package and dispatch a final reviewer covering both approved specs and every systemic finding. Fix all Critical/Important findings through one reviewed fix wave.
- [ ] Run `make test-backend`; expected: zero failures.
- [ ] Run `cd frontend && npx ng test --watch=false --browsers=ChromeHeadless`; expected: zero failures.
- [ ] Run `cd frontend && npx ng build --configuration development`; expected: successful bundle generation.
- [ ] Run `git diff --check`, inspect `git diff --stat`, full `git diff`, `git status --short`, and `git log --oneline -10`.
- [ ] Confirm no passphrase, recovery key, private key, DEK, finance plaintext, local database, or `.superpowers/` artifact is staged.
- [ ] Stage only source, migration, tests, docs, both approved specs, and this plan.
- [ ] Create exactly one implementation commit: `git commit -m "Replace passwords and repair vault finance flows"`.
- [ ] Push without force: `git push origin main`.
- [ ] Verify `git status --branch --short` shows `main...origin/main` with only the pre-existing untracked `.superpowers/` scratch directory.
