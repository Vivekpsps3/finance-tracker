# Master Remediation Plan

**Source revision:** `9f83de2`. Every Open non-Preserve ledger ID appears once below; `STR-001` through `STR-004` are preserve-only.

| Wave | Task | Finding coverage |
|---|---|---|
| 1 | Financial source truth | COR-001, COR-002, COR-003, DOC-001 |
| 2 | Inclusive interaction foundation | A11Y-001, A11Y-002, A11Y-003 |
| 3 | Lifecycle and simplification safety | FE-001, BE-001, BE-002, CRUFT-001 |
| 4 | Complete core workflows | UX-001, UX-002, UX-003, IA-001, VIS-001 |
| 5 | Adaptive platform presentation | PLAT-001, PLAT-002 |
| 6 | Local differentiated intelligence | SEC-001, INNO-001, INNO-002, INNO-003 |
| 7 | Quality and operations automation | TEST-001, OPS-001, OPS-002 |

## Wave 1: Financial Source Truth

**Task W1:** Define observed, scheduled, and combined contracts; correct planning provenance; add overlap, partial-total, freshness, completeness, and snapshot-lifecycle fixtures. Affected areas: planning service/component, client finance calculations, dashboard, data-model/architecture docs, migration tests. Preserve `STR-001` and `STR-002`. Acceptance: no unlabeled blended values and no planning mutation. Verify finance invariants before and after change.

## Wave 2: Inclusive Interaction Foundation

**Task W2:** Build one dialog/sheet, migrate local dialogs, convert route tabs to links, move focus on navigation, and provide semantic sort/chart alternatives. Affected areas: shared UI, layout, assets/liabilities, income, expenses, subscriptions, transactions, charts, planning. Acceptance: keyboard, VoiceOver, touch, zoom, contrast, motion, and transparency matrix passes. Verify `A11Y-001` through `A11Y-003`.

## Wave 3: Lifecycle And Simplification Safety

**Task W3:** Publish router/schema lifecycle ownership, build migration generations, consolidate only proven frontend duplicates, then audit dependency/document/tax sample candidates. Preserve Alembic, source data, schema-v1 support, and 410 legacy gate. Acceptance: every retired surface has an owner and verified retirement condition. Verify copied-DB upgrades and clean builds for `FE-001`, `BE-001`, `BE-002`, `CRUFT-001`.

## Wave 4: Complete Core Workflows

**Task W4:** Unify auth/recovery language, introduce import preview/recovery, make state deep-linkable, add contextual empty actions, and standardize source badges/metrics. Affected areas: auth/vault, importer utilities, transactions, calendar, layout, shared UI, dashboard. Acceptance: setup, recovery, import, return, and planning journeys complete with source clarity. Verify `UX-001` through `UX-003`, `IA-001`, `VIS-001`.

## Wave 5: Adaptive Platform Presentation

**Task W5:** Implement compact navigation/list cells, iPad split view, macOS dense-table rules, appearance modes, locale format, metadata/icon review, and system typography decision. Acceptance: documented viewport matrix passes without plaintext offline caching. Verify `PLAT-001`, `PLAT-002`.

## Wave 6: Local Differentiated Intelligence

**Task W6:** Add privacy feature gate, local snapshots, deterministic signals, encrypted feedback, explicit observed snapshots, attribution, planning sensitivity, Stock Lab evidence, and client-side brokerage reconciliation. Acceptance: all signals are explainable, confidence-scored, reversible, encrypted where persisted, and non-mutating. Verify `SEC-001`, `INNO-001` through `INNO-003`.

## Wave 7: Quality And Operations Automation

**Task W7:** Add verification tiers, axe/journey/responsive/performance fixtures, privacy checks, migration matrix, dependency/doc drift audit, production build and Docker smoke, copied-DB preflight, rollback, backup integrity, and restore drill. Acceptance: evidence is retained for `TEST-001`, `OPS-001`, `OPS-002`.
