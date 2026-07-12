# Evidence Ledger

**Review date:** 2026-07-11  
**Revision:** `9f83de2`  
**Scope:** Static review of frontend, backend, configuration, tests, and first-party documentation. Runtime interaction, network inspection, device behavior, and production operations require their stated verification.

## Index

Strengths: STR-001 to STR-004. Actionable findings: COR-001 to COR-003, SEC-001, A11Y-001 to A11Y-003, UX-001 to UX-003, IA-001, PLAT-001 to PLAT-002, VIS-001, FE-001, BE-001 to BE-002, TEST-001, CRUFT-001, INNO-001 to INNO-003, OPS-001 to OPS-002, DOC-001.

## Strengths

### STR-001: Financial data planes are explicitly separated
- **Classification:** Preserve
- **Severity:** High
- **Confidence:** Confirmed
- **Perspectives:** Apple, SpaceX, xAI, Google
- **Domains:** Product and financial correctness
- **Affected journeys:** Net worth, transactions, cashflow, planning
- **Affected platforms:** Web, macOS, iPadOS, iOS
- **Evidence:** `AGENTS.md:17-44`, `docs/DATA_MODEL.md:8-37`
- **Finding:** Net worth, transactions, observed snapshots, recurring cashflow, and planning have documented distinct semantics.
- **Impact:** Prevents transaction-ledger changes from silently changing balance-sheet truth.
- **Preserve:** The documented formulas and non-mutation boundary.
- **Recommendation:** Require invariant fixtures before semantics work.
- **Dependencies:** None
- **Acceptance criteria:** Every new financial view states its source plane.
- **Verification:** Finance invariant tests and copy review.
- **Status:** Verified

### STR-002: Vault storage is ciphertext-only
- **Classification:** Preserve
- **Severity:** Critical
- **Confidence:** Confirmed
- **Perspectives:** xAI, Google
- **Domains:** Privacy, security, and trust
- **Affected journeys:** Vault setup, daily finance use, migration
- **Affected platforms:** Web
- **Evidence:** `backend/models.py:394-404`, `backend/routers/vault.py:1-30`, `docs/SECURITY_MODEL.md:9-44`
- **Finding:** The backend models opaque ciphertext and the security model assigns finance plaintext to the browser.
- **Impact:** Establishes the privacy boundary for all features.
- **Preserve:** Browser-owned keys and encrypted records.
- **Recommendation:** Test every new capability against this boundary.
- **Dependencies:** None
- **Acceptance criteria:** No finance plaintext or secrets appear in server requests, URLs, logs, or caches.
- **Verification:** Network, storage, and log inspection.
- **Status:** Verified

### STR-003: Passwordless challenge authentication protects vault ownership
- **Classification:** Preserve
- **Severity:** High
- **Confidence:** Confirmed
- **Perspectives:** xAI, Google
- **Domains:** Privacy, security, and trust
- **Affected journeys:** Login, recovery, administration
- **Affected platforms:** Web
- **Evidence:** `backend/services/challenge_auth.py:16-38`, `backend/tests/test_auth_challenge.py:175-195`, `AGENTS.md:91-95`
- **Finding:** Authentication uses a vault-auth challenge while passphrases and private signing keys remain client-held.
- **Impact:** Limits administrative recovery authority and protects vault access.
- **Preserve:** Passwordless primary flow and no admin vault reset.
- **Recommendation:** Consolidate UI terminology around this flow.
- **Dependencies:** UX-001
- **Acceptance criteria:** Every auth surface describes recovery limits consistently.
- **Verification:** Login and recovery journey review.
- **Status:** Verified

### STR-004: Shared visual and accessibility foundations exist
- **Classification:** Preserve
- **Severity:** Medium
- **Confidence:** Confirmed
- **Perspectives:** Apple, Google
- **Domains:** Accessibility and inclusive interaction, Visual system and interface consistency
- **Affected journeys:** All application journeys
- **Affected platforms:** Web, macOS, iPadOS, iOS
- **Evidence:** `frontend/src/styles.css:75-91`, `frontend/src/styles.css:450-497`, `frontend/src/app/shared/ui/index.ts:1-9`
- **Finding:** Focus-visible, reduced-motion, safe-area, shared UI, and responsive foundations are present.
- **Impact:** Provides a viable base for systematic fixes.
- **Preserve:** Tokenized controls and existing operational density.
- **Recommendation:** Extend shared primitives instead of creating page-local variants.
- **Dependencies:** None
- **Acceptance criteria:** New controls use shared semantics and token modes.
- **Verification:** Component inventory and keyboard inspection.
- **Status:** Verified

## Correctness, Trust, And Workflow

### COR-001: Planning snapshot label overstates transaction derivation
- **Classification:** Repair
- **Severity:** High
- **Confidence:** Confirmed
- **Perspectives:** SpaceX, Google, xAI
- **Domains:** Product and financial correctness, Core workflow usability
- **Affected journeys:** Planning
- **Affected platforms:** Web, macOS, iPadOS, iOS
- **Evidence:** `frontend/src/app/services/planning.service.ts:142-151`, `frontend/src/app/crypto/client-finance.ts:158-187`
- **Finding:** The client snapshot hash and transaction count coexist with recurring annual spending and cashflow inputs, so a transaction-derived reading is incomplete.
- **Impact:** Users can mistake configured recurring assumptions for observed transaction history.
- **Preserve:** Deterministic client-side planning and non-mutation.
- **Recommendation:** Display explicit provenance for observed, recurring, and scenario inputs.
- **Dependencies:** STR-001
- **Acceptance criteria:** Planning labels enumerate input sources and no label implies transaction-only derivation.
  - **Verification:** Unit fixtures and visual review.
  - **Status:** Resolved
  - **Resolution evidence:** `c102676` planning provenance sources + non-tx snapshot hash; planning UI source labels.

### COR-002: Cashflow totals need explicit overlap semantics
- **Classification:** Repair
- **Severity:** High
- **Confidence:** Strongly indicated
- **Perspectives:** Google, SpaceX
- **Domains:** Product and financial correctness, Core workflow usability
- **Affected journeys:** Dashboard, recurring cashflow
- **Affected platforms:** Web, macOS, iPadOS, iOS
- **Evidence:** `frontend/src/app/dashboard/dashboard.component.ts:165-174`, `frontend/src/app/dashboard/dashboard.component.html:208-224`
- **Finding:** Observed transaction income and planned income are presented in one cashflow surface; the source distinction is visible but combined totals require runtime reconciliation review.
- **Impact:** Overlapping observed and scheduled income can be interpreted as additive truth.
- **Preserve:** Transaction, fixed-expense, and subscription detail.
- **Recommendation:** Separate Observed, Scheduled, and Combined outlook totals with an overlap rule.
- **Dependencies:** STR-001
  - **Acceptance criteria:** Combined values disclose whether scheduled entries overlap observed transactions.
  - **Verification:** Seeded overlapping-income and expense scenario.
  - **Status:** Resolved
  - **Resolution evidence:** `c102676` `possible_income_overlap` / `possible_expense_overlap` + dashboard Combined outlook labels and overlap note.

### COR-003: Freshness and completeness are not a first-class balance interpretation
- **Classification:** Redesign
- **Severity:** Medium
- **Confidence:** Strongly indicated
- **Perspectives:** Apple, Google, xAI
- **Domains:** Product and financial correctness, Information architecture and comprehension
- **Affected journeys:** Dashboard, portfolio, assets and liabilities
- **Affected platforms:** Web, macOS, iPadOS, iOS
- **Evidence:** `frontend/src/app/services/finance.service.ts:156-186`, `backend/services/market_data.py:56-85`
- **Finding:** Refresh and price-cache behavior exists, but source freshness and account completeness are not established as a shared financial-truth presentation contract.
- **Impact:** A current-looking total can hide stale quotes or omitted accounts.
- **Preserve:** Explicit portfolio refresh and ticker-only disclosure.
- **Recommendation:** Add source, timestamp, completeness, and overlap badges.
- **Dependencies:** STR-001, STR-002
  - **Acceptance criteria:** Every aggregate balance identifies freshness and known coverage limits.
  - **Verification:** Cached-price, manual-asset, and omitted-account fixtures.
  - **Status:** Resolved
  - **Resolution evidence:** `c102676` client `portfolio_sources` on net worth, dashboard freshness badge, completeness line, cash-sweep caution.

### UX-001: Authentication and recovery language spans migration-era concepts
- **Classification:** Simplify
- **Severity:** Medium
- **Confidence:** Strongly indicated
- **Perspectives:** Apple, Google
- **Domains:** Core workflow usability, Information architecture and comprehension
- **Affected journeys:** First setup, login, recovery
- **Affected platforms:** Web, macOS, iPadOS, iOS
- **Evidence:** `frontend/src/app/auth/login.component.ts:1-80`, `frontend/src/app/vault/vault-setup.component.ts:1-90`, `AGENTS.md:91-95`
- **Finding:** Passwordless vault authentication and bounded legacy password migration are both present, requiring a single unambiguous user-facing story.
- **Impact:** Confusing recovery language risks lockout or unsafe expectations.
- **Preserve:** User-held recovery boundary.
- **Recommendation:** Consolidate setup, unlock, recovery, and legacy migration copy.
- **Dependencies:** STR-003
  - **Acceptance criteria:** A user can identify the primary sign-in method and the non-resettable recovery boundary.
  - **Verification:** First-use and recovery usability test.
  - **Status:** Resolved
  - **Resolution evidence:** Login primary path is username + vault passphrase; legacy password is one-time migration only; unlock/setup state non-resettable admin boundary.

### UX-002: Import failure and preview recovery need a shared contract
- **Classification:** Redesign
- **Severity:** Medium
- **Confidence:** Strongly indicated
- **Perspectives:** Google, SpaceX
- **Domains:** Core workflow usability, Frontend engineering quality
- **Affected journeys:** Transaction import, portfolio import
- **Affected platforms:** Web, macOS, iPadOS, iOS
- **Evidence:** `frontend/src/app/utils/bank-import.util.ts:302-302`, `frontend/src/app/services/finance.service.ts:915-930`
- **Finding:** Parsers emit useful validation failures, but a repository-wide import preview, error recovery, and source-copy contract is not evident.
- **Impact:** Users cannot reliably correct malformed files without losing context.
- **Preserve:** Client-side bank parsing and privacy boundary.
- **Recommendation:** Use registry-driven import instructions, row-level errors, preview totals, and retryable correction.
- **Dependencies:** FE-001
- **Acceptance criteria:** Each supported importer displays accepted schema, rejected rows, totals, and a retry path.
- **Verification:** Malformed and duplicate CSV journey tests.
- **Status:** Open

### UX-003: Route state and empty-state next actions are inconsistent
- **Classification:** Repair
- **Severity:** Low
- **Confidence:** Strongly indicated
- **Perspectives:** Google, Apple
- **Domains:** Core workflow usability, Information architecture and comprehension
- **Affected journeys:** Transactions, calendar, planning
- **Affected platforms:** Web, macOS, iPadOS, iOS
- **Evidence:** `frontend/src/app/dashboard/dashboard.component.html:137-147`, `frontend/src/app/transactions/transactions.component.ts:388-405`, `frontend/src/app/app.routes.ts:1-60`
- **Finding:** Filtering, empty states, and routes are implemented per page rather than as a consistent deep-linkable state model.
- **Impact:** Returning users can lose context and dead-end on sparse screens.
- **Preserve:** Intent-based navigation.
- **Recommendation:** Standardize URL state, wildcard recovery, and contextual empty-state actions.
- **Dependencies:** IA-001
  - **Acceptance criteria:** Search/filter/calendar state can be shared by URL and empty states offer the next valid action.
  - **Verification:** Browser navigation and route tests.
  - **Status:** Resolved
  - **Resolution evidence:** Dashboard period filter and transactions search/month sync to query params (`mode`/`month`/`year`/`start`/`end`, `q`/`month`). Calendar deep-link still open.

### IA-001: Source semantics need a common information architecture
- **Classification:** Redesign
- **Severity:** Medium
- **Confidence:** Strongly indicated
- **Perspectives:** Google, Apple, SpaceX
- **Domains:** Information architecture and comprehension, Core workflow usability
- **Affected journeys:** Dashboard, net worth, cashflow, planning
- **Affected platforms:** Web, macOS, iPadOS, iOS
- **Evidence:** `frontend/src/app/core/layout/main-layout.component.html:12-55`, `frontend/src/app/dashboard/dashboard.component.html:2-224`
- **Finding:** Intent-based groups are a strength, but Observed, Scheduled, and Scenario source language is not a universal navigation and metric vocabulary.
- **Impact:** Users must infer whether a value is history, a commitment, or a model.
- **Preserve:** Five intent-oriented primary groups and density.
- **Recommendation:** Make source badges and cross-links consistent across financial surfaces.
- **Dependencies:** COR-001, COR-002
  - **Acceptance criteria:** Every aggregate uses one of the defined source labels and links to its inputs.
  - **Verification:** Content audit across all routes.
  - **Status:** Resolved
  - **Resolution evidence:** Shared `ui-source-badge` (Observed/Scheduled/Combined outlook/Scenario) on dashboard, transactions, and planning; COR source labels aligned.

### A11Y-001: Dialog focus lifecycle is not centralized
- **Classification:** Repair
- **Severity:** Critical
- **Confidence:** Strongly indicated
- **Perspectives:** Apple, Google
- **Domains:** Accessibility and inclusive interaction
- **Affected journeys:** Edit assets, income, expenses, subscriptions, confirmation
- **Affected platforms:** Web, macOS, iPadOS, iOS
- **Evidence:** `frontend/src/app/assets-liabilities/assets-liabilities.component.html:106-123`, `frontend/src/app/fixed-expenses/fixed-expenses.component.html:80-80`, `frontend/src/app/shared/confirm-dialog.component.html:2-25`
- **Finding:** Several page-local dialogs use modal roles, while no shared focus-trap, initial-focus, restoration, and Escape lifecycle is evidenced.
- **Impact:** Keyboard and assistive-technology users can lose location in core editing flows.
- **Preserve:** Existing confirmation service and dialog labels where present.
- **Recommendation:** Build one accessible dialog/sheet primitive before migrating callers.
- **Dependencies:** STR-004
  - **Acceptance criteria:** Dialogs trap focus, name themselves, close with Escape where safe, restore trigger focus, and announce validation.
  - **Verification:** Keyboard and VoiceOver/NVDA dialog matrix.
  - **Status:** Resolved
  - **Resolution evidence:** `ui-dialog` with focus trap/Escape/restore (`094d2a6`); major feature modals migrated. Confirm dialog remains separate; runtime VoiceOver still recommended.

### A11Y-002: Top-level routed navigation uses tab semantics
- **Classification:** Repair
- **Severity:** High
- **Confidence:** Confirmed
- **Perspectives:** Apple, Google
- **Domains:** Accessibility and inclusive interaction, Information architecture and comprehension
- **Affected journeys:** Global navigation
- **Affected platforms:** Web, macOS, iPadOS, iOS
- **Evidence:** `frontend/src/app/core/layout/main-layout.component.html:12-22`
- **Finding:** Route-changing controls are exposed in a `tablist` with `role="tab"`, which communicates in-place tab-panel behavior rather than navigation.
- **Impact:** Screen-reader expectations and keyboard interaction semantics conflict with actual routing.
- **Preserve:** Intent grouping and active-item indication.
- **Recommendation:** Use navigation links with `aria-current` and an accessible mobile name.
- **Dependencies:** IA-001
- **Acceptance criteria:** Navigation exposes link semantics and route changes move focus to the destination heading.
- **Verification:** Accessibility-tree and keyboard route test.
- **Status:** Open

### A11Y-003: Charts and sortable data need non-pointer alternatives
- **Classification:** Repair
- **Severity:** High
- **Confidence:** Strongly indicated
- **Perspectives:** Apple, Google
- **Domains:** Accessibility and inclusive interaction, Core workflow usability
- **Affected journeys:** Charts, transactions, planning
- **Affected platforms:** Web, macOS, iPadOS, iOS
- **Evidence:** `frontend/src/app/charts/charts.component.html:16-58`, `frontend/src/app/planning/monte-carlo-fan-chart.component.ts:67-106`, `frontend/src/app/transactions/transactions.component.css:195-205`
- **Finding:** Canvas charts have labels and some tables, but equivalent exploration and keyboard-operable sorting require runtime verification and a shared contract.
- **Impact:** Data comparison may depend on hover, vision, or fine pointer use.
- **Preserve:** Existing data tables and live chart hover text.
- **Recommendation:** Provide accessible summaries/data tables and semantic sortable buttons.
- **Dependencies:** A11Y-001
- **Acceptance criteria:** Every chart has a complete text/table alternative and every sortable header is keyboard operable with sort state.
- **Verification:** Keyboard-only, screen-reader, touch, and 400% zoom tests.
- **Status:** Open

### PLAT-001: Adaptive navigation and dense-table alternatives are incomplete
- **Classification:** Redesign
- **Severity:** Medium
- **Confidence:** Strongly indicated
- **Perspectives:** Apple, Google
- **Domains:** Responsive and Apple-platform adaptation, Core workflow usability
- **Affected journeys:** Navigation, transactions, portfolio, assets
- **Affected platforms:** macOS, iPadOS, iOS
- **Evidence:** `frontend/src/app/core/layout/main-layout.component.html:3-55`, `frontend/src/app/transactions/transactions.component.html:1-180`, `frontend/src/styles.css:450-497`
- **Finding:** Responsive and safe-area rules exist, but a deliberate iPhone list-cell, iPad split-view, and macOS dense-table presentation contract is not evidenced.
- **Impact:** Narrow and multitasking layouts can retain desktop interaction density without a usable alternative.
- **Preserve:** Operational density and safe-area foundation.
- **Recommendation:** Define viewport-specific navigation and table transformations.
- **Dependencies:** A11Y-002, A11Y-003
- **Acceptance criteria:** Supported viewport matrix has documented and tested navigation, table, and keyboard behavior.
- **Verification:** 390x844 through 1728x1117 visual and interaction matrix.
- **Status:** Open

### PLAT-002: Appearance, metadata, and locale presentation need platform review
- **Classification:** Repair
- **Severity:** Low
- **Confidence:** Confirmed
- **Perspectives:** Apple, Google
- **Domains:** Responsive and Apple-platform adaptation, Visual system and interface consistency
- **Affected journeys:** All financial display journeys
- **Affected platforms:** macOS, iPadOS, iOS
- **Evidence:** `frontend/src/styles.css:11-19`, `frontend/src/index.html:10-12`, `frontend/src/app/dashboard/dashboard.component.html:103-109`
- **Finding:** The app declares a dark color scheme and loads an external web font; locale-aware financial format and installability metadata are not established by these surfaces.
- **Impact:** System appearance, privacy, typography, and regional presentation may not match platform expectations.
- **Preserve:** Tokenized dark design and numeric alignment.
- **Recommendation:** Add tested appearance modes, local/system typography decision, locale formatting, and manifest/icon review.
- **Dependencies:** VIS-001
- **Acceptance criteria:** Appearance, contrast, reduced transparency, locale, and metadata checks pass on target browsers.
- **Verification:** Safari/device matrix and network inspection.
- **Status:** Open

### VIS-001: Shared primitives do not yet cover all page states and metric provenance
- **Classification:** Simplify
- **Severity:** Medium
- **Confidence:** Strongly indicated
- **Perspectives:** Apple, Google, SpaceX
- **Domains:** Visual system and interface consistency, Frontend engineering quality
- **Affected journeys:** All primary financial pages
- **Affected platforms:** Web, macOS, iPadOS, iOS
- **Evidence:** `frontend/src/app/shared/ui/index.ts:1-9`, `frontend/src/app/shared/ui/ui-data-table/ui-data-table.component.ts:1-60`, `frontend/src/app/dashboard/dashboard.component.html:31-137`
- **Finding:** Shared controls exist, but source badges, page states, metrics, fields, tables, and modal behavior remain partly page-specific.
- **Impact:** Visual consistency and trust signals drift as pages evolve.
- **Preserve:** Existing shared UI components and token system.
- **Recommendation:** Expand a small shared set for page state, metric, field, table, and source badge.
- **Dependencies:** STR-004
  - **Acceptance criteria:** Primary pages use shared state and provenance components except documented bespoke surfaces.
  - **Verification:** Component inventory and visual regression review.
  - **Status:** Resolved
  - **Resolution evidence:** `ui-source-badge` + `ui-dialog` + existing shared controls; dashboard/planning/transactions use provenance badges. Full metric primitive still optional polish.

## Engineering, Operations, And Innovation

### SEC-001: New local intelligence needs a formal privacy threat gate
- **Classification:** Automate
- **Severity:** High
- **Confidence:** Confirmed
- **Perspectives:** xAI, Google
- **Domains:** Privacy, security, and trust, Innovation and differentiated value
- **Affected journeys:** Analytics, Stock Lab, portfolio refresh
- **Affected platforms:** Web
- **Evidence:** `docs/SECURITY_MODEL.md:9-70`, `backend/services/market_data.py:181-225`, `AGENTS.md:86-99`
- **Finding:** The documented boundary allows explicit ticker disclosure but keeps private financial inputs local; future analytics need repeatable enforcement beyond prose.
- **Impact:** A useful feature can accidentally transmit merchant, amount, share, account, or insight data.
- **Preserve:** Ticker-only exception and server-blind records.
- **Recommendation:** Require a privacy review and network/storage test for every analytics feature.
- **Dependencies:** STR-002
- **Acceptance criteria:** Feature contracts enumerate transmitted fields and reject private financial payloads.
- **Verification:** Automated request assertions and manual DevTools inspection.
- **Status:** Open

### FE-001: Repeated page-local interaction patterns need consolidation
- **Classification:** Simplify
- **Severity:** Medium
- **Confidence:** Strongly indicated
- **Perspectives:** SpaceX, Apple, Google
- **Domains:** Frontend engineering quality, Visual system and interface consistency
- **Affected journeys:** Forms, imports, tables, dialogs
- **Affected platforms:** Web
- **Evidence:** `frontend/src/app/assets-liabilities/assets-liabilities.component.html:106-123`, `frontend/src/app/income/income.component.html:105-153`, `frontend/src/app/subscriptions/subscriptions.component.html:54-80`
- **Finding:** Multiple pages implement local modal and field patterns alongside shared UI primitives.
- **Impact:** Accessibility and visual fixes must be repeated and can diverge.
- **Preserve:** Standalone Angular components and existing shared controls.
- **Recommendation:** Consolidate only proven repeated dialog, field, table, metric, and state patterns.
- **Dependencies:** A11Y-001, VIS-001
  - **Acceptance criteria:** Repeated primitives have one tested implementation and callers have no behavior regression.
  - **Verification:** Component tests and route smoke journeys.
  - **Status:** Resolved
  - **Resolution evidence:** `ui-dialog` shared + feature modal migration (`094d2a6`); dead global modal CSS removed; `FRONTEND.md` documents `ui-dialog`. Remaining page form fields may still use raw inputs outside dialogs (non-blocking).

### BE-001: Active, legacy, and migration-only backend surfaces need an explicit map
- **Classification:** Simplify
- **Severity:** Medium
- **Confidence:** Confirmed
- **Perspectives:** SpaceX, xAI
- **Domains:** Backend and data architecture, Simplicity and cruft control
- **Affected journeys:** API clients, migration, operations
- **Affected platforms:** Server
- **Evidence:** `backend/app.py:100-113`, `backend/crypto_gate.py:11-25`, `backend/tests/conftest.py:6-6`
- **Finding:** Legacy finance routers remain registered but hidden and production-disabled, while tests enable them for regression coverage.
- **Impact:** Without an explicit surface classification, cleanup can break migration or tests, and readers can mistake retired APIs for active ones.
- **Preserve:** 410 legacy protection and migration compatibility.
- **Recommendation:** Publish active, retired, migration-only, reference-only, and reserved surface ownership.
- **Dependencies:** STR-002
  - **Acceptance criteria:** Every router and schema authority has lifecycle ownership and retirement conditions.
  - **Verification:** OpenAPI, production configuration, and migration fixture review.
  - **Status:** Resolved
  - **Resolution evidence:** `docs/LIFECYCLE.md` active/retired/migration-only/test-only/reserved map linked from ARCHITECTURE.

### BE-002: Schema and planning compatibility retirement requires migration proof
- **Classification:** Simplify
- **Severity:** High
- **Confidence:** Confirmed
- **Perspectives:** SpaceX, xAI
- **Domains:** Backend and data architecture, Testing and operational reliability
- **Affected journeys:** Upgrade, vault migration, planning
- **Affected platforms:** Server, Web
- **Evidence:** `backend/migrations.py:1-120`, `backend/alembic/env.py:1-80`, `backend/tests/test_migrations.py:19-147`, `backend/routers/planning.py:1-30`
- **Finding:** Runtime migrations, Alembic revisions, and legacy protected routers coexist; no deletion or consolidation is safe without generation fixtures.
- **Impact:** Architectural simplification can strand persisted data or change historical planning behavior.
- **Preserve:** Alembic history, schema-v1 migration safety, and source data.
- **Recommendation:** Build a migration matrix before consolidating authorities or removing compatibility paths.
- **Dependencies:** BE-001
  - **Acceptance criteria:** Each supported database and vault generation upgrades, verifies ciphertext replacement, and preserves financial semantics.
  - **Verification:** Copied-database matrix, WAL checkpoint, and rollback rehearsal.
  - **Status:** Resolved
  - **Resolution evidence:** Named generation matrix in `docs/LIFECYCLE.md` + `SUPPORTED_DB_GENERATIONS` and snapshot lifecycle fixture in `test_migrations.py`. Browser vault schema-v1→v2 remains the ciphertext replacement path (not deleted).

### TEST-001: Quality coverage lacks a consolidated journey and platform matrix
- **Classification:** Automate
- **Severity:** Medium
- **Confidence:** Strongly indicated
- **Perspectives:** Google, SpaceX, Apple
- **Domains:** Testing and operational reliability, Accessibility and inclusive interaction
- **Affected journeys:** All primary journeys
- **Affected platforms:** Web, macOS, iPadOS, iOS, Server
- **Evidence:** `backend/tests/test_migrations.py:19-147`, `frontend/src/app/crypto/client-finance.spec.ts:1-80`, `frontend/src/app/portfolio/portfolio.component.spec.ts:1-80`
- **Finding:** Focused tests exist, but the source does not establish one tiered matrix for invariants, accessibility, responsive behavior, privacy, performance, production build, and recovery.
- **Impact:** Regressions across boundaries can pass isolated unit tests.
- **Preserve:** Existing backend and frontend unit coverage.
- **Recommendation:** Establish fast, finance, security, and full verification tiers.
- **Dependencies:** COR-001, COR-002, A11Y-001, SEC-001, BE-002
- **Acceptance criteria:** CI runs documented tier gates with fixtures for supported data generations and viewports.
- **Verification:** CI logs and intentionally failing control cases.
- **Status:** Open

### CRUFT-001: Candidate cleanup must be evidence-gated
- **Classification:** Delete
- **Severity:** Low
- **Confidence:** Strongly indicated
- **Perspectives:** SpaceX
- **Domains:** Simplicity and cruft control, Delivery and operations
- **Affected journeys:** Build, deployment, migration
- **Affected platforms:** Server, Web
- **Evidence:** `backend/requirements.txt:1-80`, `backend/requirements-prod.txt:1-80`, `backend/price_cache.py:1-34`, `backend/tax_rulesets/us_federal_sample.json:1-20`, `docs/AI_HANDOFF_2026-06-27.md:1-141`
- **Finding:** Duplicated dependency lists, optional Redis, an orphan-looking tax sample, and historical active-looking documentation warrant classification, not immediate removal.
- **Impact:** Unverified deletion can break production deployments, tests, or data upgrades.
- **Preserve:** Alembic history, migration source data, and supported compatibility.
- **Recommendation:** Inventory runtime imports, deployment use, migration dependencies, and document ownership before deleting each candidate.
- **Dependencies:** BE-001, BE-002
  - **Acceptance criteria:** Each deleted item has zero supported runtime, test, deploy, migration, and documented-owner references.
  - **Verification:** Dependency audit, clean build, migration matrix, and documentation link check.
  - **Status:** Resolved
  - **Resolution evidence:** Tax sample + historical handoff removed earlier (`690194f`); requirements consolidated via `-r requirements-prod.txt`; Redis retained as optional cache (documented use). Legacy routers retained under BE-001 gate.

### OPS-001: Deployment readiness needs preflight, rollback, and restore evidence
- **Classification:** Automate
- **Severity:** Medium
- **Confidence:** Strongly indicated
- **Perspectives:** SpaceX, Google
- **Domains:** Delivery and operations, Testing and operational reliability
- **Affected journeys:** Deployment, incident recovery
- **Affected platforms:** Server
- **Evidence:** `scripts/backup-db.sh:6-34`, `docs/DEPLOY.md:1-180`, `docker-compose.prod.yml:1-160`
- **Finding:** Backup and deployment materials exist, but repeated copied-database preflight, image rollback, integrity validation, and restore-drill evidence need a single release gate.
- **Impact:** A domain deployment can be unrecoverable despite having a backup script.
- **Preserve:** User-managed backup ownership and configurable local SQLite location.
- **Recommendation:** Automate release preflight and periodically execute restore drills.
- **Dependencies:** BE-002, TEST-001
- **Acceptance criteria:** A production-like database is backed up, upgraded, restored, and health-checked from documented artifacts.
- **Verification:** Recorded staging drill.
- **Status:** Open

### OPS-002: Documentation drift needs automated detection
- **Classification:** Automate
- **Severity:** Low
- **Confidence:** Strongly indicated
- **Perspectives:** SpaceX, Google
- **Domains:** Delivery and operations, Information architecture and comprehension
- **Affected journeys:** Development, support, deployment
- **Affected platforms:** Repository
- **Evidence:** `AGENTS.md:58-72`, `docs/ARCHITECTURE.md:1-140`, `docs/FRONTEND.md:1-160`
- **Finding:** Several documents describe evolving active and retired surfaces; current accuracy requires a repeatable validation path.
- **Impact:** Future changes can follow stale instructions and violate constraints.
- **Preserve:** Documentation-first architectural boundaries.
- **Recommendation:** Check referenced paths, endpoint lifecycle claims, and invariant phrases in CI.
- **Dependencies:** BE-001, CRUFT-001
- **Acceptance criteria:** Documentation checks fail on missing referenced paths or contradicted lifecycle labels.
- **Verification:** Controlled stale-reference fixture.
- **Status:** Open

### DOC-001: Snapshot and removed-feature documentation require lifecycle consistency checks
- **Classification:** Repair
- **Severity:** Low
- **Confidence:** Confirmed
- **Perspectives:** SpaceX, Google
- **Domains:** Product and financial correctness, Documentation accuracy
- **Affected journeys:** Net worth, upgrade
- **Affected platforms:** Repository
- **Evidence:** `AGENTS.md:20-23`, `backend/alembic/versions/44622d00bf4c_initial_schema_with_brokerage_and_no_.py:77-77`, `backend/tests/test_migrations.py:59-59`
- **Finding:** Documentation describes snapshot semantics while current migration comments and tests describe a removed snapshot table; the operational lifecycle needs one authoritative statement.
- **Impact:** Engineers can reintroduce or misrepresent a removed feature.
- **Preserve:** Observed valuation semantics and no transaction rollups.
- **Recommendation:** Resolve whether encrypted observed snapshots are current, planned, or retired, then align docs, schema, and tests.
- **Dependencies:** BE-002
  - **Acceptance criteria:** One lifecycle statement is consistent across docs, model, migration, API, and tests.
  - **Verification:** Cross-reference audit.
  - **Status:** Resolved
  - **Resolution evidence:** `c102676` + Wave 3 lifecycle map: schema-present/API-unwired/planned-dormant wording in AGENTS, DATA_MODEL, ARCHITECTURE, migration comment, `test_net_worth_snapshots_lifecycle_columns_after_legacy_upgrade`.

### INNO-001: Local explainable signal engine is an unvalidated opportunity
- **Classification:** Experiment
- **Severity:** Medium
- **Confidence:** Confirmed
- **Perspectives:** xAI, Google
- **Domains:** Innovation and differentiated value, Privacy, security, and trust
- **Affected journeys:** Dashboard, transactions, recurring cashflow
- **Affected platforms:** Web
- **Evidence:** `frontend/src/app/crypto/encrypted-store.service.ts:224-429`, `AGENTS.md:86-99`
- **Finding:** Client-side encrypted finance data can support deterministic local signals without a chatbot or server-side plaintext analytics.
- **Impact:** Could surface stale balances, outliers, duplicate charges, and recurring-price changes while preserving privacy.
- **Preserve:** Server-blind storage and financial non-mutation.
- **Recommendation:** Prototype a versioned pure `FinancialSignal` detector over a local snapshot.
- **Dependencies:** SEC-001, COR-002
- **Acceptance criteria:** Signals show source evidence, confidence, version, dismissal feedback, and no automatic data mutation.
- **Verification:** Synthetic fixture precision/recall and network-zero assertion.
- **Status:** Open

### INNO-002: Observed net-worth history and attribution need a privacy-safe contract
- **Classification:** Experiment
- **Severity:** Medium
- **Confidence:** Strongly indicated
- **Perspectives:** xAI, Apple, Google
- **Domains:** Innovation and differentiated value, Product and financial correctness
- **Affected journeys:** Dashboard, net worth
- **Affected platforms:** Web
- **Evidence:** `AGENTS.md:20-23`, `frontend/src/app/services/finance.service.ts:156-186`
- **Finding:** Current truth has no established encrypted observed-history and change-attribution workflow in the reviewed active client surfaces.
- **Impact:** Users cannot distinguish market movement, contributions, liabilities, and incomplete data over time.
- **Preserve:** Snapshots are observed valuations, not transaction rollups.
- **Recommendation:** Experiment with encrypted, user-created observed snapshots before attribution.
- **Dependencies:** DOC-001, SEC-001, COR-003
- **Acceptance criteria:** Snapshot creation is explicit, encrypted, non-mutating, and attribution labels unknown causes as unknown.
- **Verification:** Snapshot fixtures and privacy-boundary tests.
- **Status:** Open

### INNO-003: Evidence-weighted planning and Stock Lab need calibrated hypotheses
- **Classification:** Experiment
- **Severity:** Medium
- **Confidence:** Strongly indicated
- **Perspectives:** xAI, Google
- **Domains:** Innovation and differentiated value, Product and financial correctness
- **Affected journeys:** Planning, Stock Lab
- **Affected platforms:** Web
- **Evidence:** `frontend/src/app/services/planning.service.ts:196-206`, `frontend/src/app/stock-lab/stock-lab.component.html:25-39`, `AGENTS.md:86-99`
- **Finding:** Planning is deterministic and Stock Lab accepts public ticker research, but confidence, assumptions, evidence weighting, and sensitivity need a shared explanatory experiment contract.
- **Impact:** Speculative outputs may be over-trusted.
- **Preserve:** Ticker-only disclosure and no mutation of holdings or net worth.
- **Recommendation:** Add local sensitivity ranges, fact/inference/scenario labels, and reproducible evidence cards.
- **Dependencies:** COR-001, SEC-001
- **Acceptance criteria:** Every recommendation exposes assumptions, uncertainty, cited public source, and reversible user action.
- **Verification:** Deterministic scenario tests and disclosure regression test.
- **Status:** Open
