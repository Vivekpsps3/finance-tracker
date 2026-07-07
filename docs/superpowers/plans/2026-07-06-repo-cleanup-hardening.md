# Repo Cleanup Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove proven-dead cruft from the vault-era codebase while preserving migration safety, product invariants, and current encrypted-storage behavior.

**Architecture:** Treat `/api/vault/*`, auth, admin, health, and public market quote cache as active backend surfaces. Treat plaintext finance routers/services as removable only when frontend encrypted mode and tests prove they are no longer needed; otherwise leave them gated behind `ALLOW_LEGACY_FINANCE_API_FOR_TESTS`. Keep migrations and schema history intact for existing SQLite databases.

**Tech Stack:** FastAPI, SQLAlchemy, Alembic, pytest, Angular 19 standalone components, RxJS, Tailwind, Karma/Jasmine.

## Global Constraints

- Preserve finance invariants from `AGENTS.md`: net worth, transactions, recurring cashflow, and planning remain separate data planes.
- Preserve server-blind storage: browser-owned plaintext, backend-owned ciphertext only through `/api/vault/*`; legacy finance endpoints return `410` outside explicit test mode.
- Do not reintroduce tax document storage or plaintext finance admin exposure.
- Do not drop migration history or tables required to upgrade existing local SQLite databases.
- Prefer small, targeted deletions and hardening over broad rewrites.

---

### Task 1: Establish Cleanup Evidence

**Files:**
- Inspect: `backend/`, `frontend/src/app/`, `docs/`, `scripts/`, `.github/`
- Modify if needed: `.gitignore`, docs that reference removed behavior

**Interfaces:**
- Consumes: current repository state.
- Produces: a list of active surfaces and deletion candidates to verify with tests.

- [ ] Search for legacy routes, removed tax document references, old migration paths, unused Angular components, and stale docs.
- [ ] Run targeted tests around vault encryption and OpenAPI to establish baseline behavior.
- [ ] Confirm no uncommitted user changes are overwritten.

### Task 2: Delete Proven-Dead Frontend Cruft

**Files:**
- Candidate deletes: unused Angular files not reachable from routes/imports.
- Modify: `frontend/src/app/app.routes.ts`, feature imports, docs if necessary.

**Interfaces:**
- Consumes: Angular route/import graph.
- Produces: smaller frontend tree with build passing.

- [ ] Prove each deleted file has no import/reference.
- [ ] Delete only files that are not reachable or intentionally replaced.
- [ ] Run `cd frontend && npx ng build --configuration development`.

### Task 3: Harden Vault-Era Backend Boundaries

**Files:**
- Modify: `backend/crypto_gate.py`, backend routers/tests as needed.
- Test: `backend/tests/test_vault_encryption.py`, `backend/tests/test_openapi.py`, focused API tests.

**Interfaces:**
- Consumes: `require_legacy_finance_access` gating and authenticated test helpers.
- Produces: tests that prove disabled plaintext finance endpoints stay disabled and public/active endpoints remain available.

- [ ] Add or strengthen tests for representative plaintext endpoints returning `410` without test override.
- [ ] Ensure OpenAPI behavior matches active API policy.
- [ ] Remove redundant or misleading compatibility comments only when behavior is unchanged.

### Task 4: Clean Docs And Developer Tooling

**Files:**
- Modify: `README.md`, `docs/*.md`, `Makefile`, scripts as needed.

**Interfaces:**
- Consumes: current implemented behavior.
- Produces: docs that no longer advertise removed migration flows or stale paths.

- [ ] Update docs so the vault-era state is clear and stale one-time migration steps are not presented as active workflow.
- [ ] Keep historical handoff docs only if clearly labeled historical.
- [ ] Improve cleanup commands for generated cache files without deleting data.

### Task 5: Verify, Commit, Push

**Files:**
- All changed files.

**Interfaces:**
- Consumes: completed cleanup changes.
- Produces: pushed commit on the current branch.

- [ ] Run `make test-backend`.
- [ ] Run `cd frontend && npx ng build --configuration development`.
- [ ] Inspect `git status`, `git diff`, and recent log.
- [ ] Commit only intended files.
- [ ] Push the current branch to its upstream or origin.

## Self-Review

- Spec coverage: covers evidence gathering, frontend cruft deletion, backend boundary hardening, docs/tooling cleanup, verification, commit, and push.
- Placeholder scan: no implementation placeholders remain; tasks are intentionally evidence-driven because deletion candidates must be proven from the current tree.
- Type consistency: no new runtime interfaces are introduced by this plan.
