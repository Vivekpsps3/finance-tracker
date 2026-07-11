# Consolidated Acceptance Criteria

## Financial Semantics

`COR-001`, `COR-002`, `COR-003`, and `DOC-001`: fixtures prove net worth formula, transaction non-mutation, observed snapshot semantics, recurring cashflow separation, planning non-mutation, source labels, overlap handling, and freshness/completeness disclosures.

## Privacy And Security

`STR-002`, `SEC-001`, `INNO-001` to `INNO-003`: network, URL, log, cache, and storage checks show no finance plaintext, secrets, account details, shares, scenario values, merchant data, or private evidence. Explicit ticker disclosure remains tested.

## Accessibility And Responsive Platforms

`A11Y-001` to `A11Y-003`, `PLAT-001`, `PLAT-002`: test 390x844, 844x390, 768x1024, 1024x768, 1280x800, 1440x900, and 1728x1117; keyboard dialogs, route focus, semantic sorting, chart alternatives, 200%/400% zoom, color independence, reduced motion, reduced transparency, contrast, VoiceOver, and coarse pointers.

## Core Journeys

`UX-001` to `UX-003`, `IA-001`, `VIS-001`: first setup, return/recovery, net worth, import/review, recurring cashflow, and planning display source, errors, next actions, and deep-linkable state.

## Architecture And Deletion

`FE-001`, `BE-001`, `BE-002`, `CRUFT-001`: active/legacy maps, migration generations, cross-language fixtures, and dependency audits pass before removal. Alembic history, source tables, and supported compatibility remain until verified retirement.

## Innovation

`INNO-001` to `INNO-003`: detector fixtures measure precision/recall; evidence cards state fact/inference/scenario, confidence, version, and reversible actions; feedback is encrypted; no feature mutates truth.

## Tests, Performance, And Deployment

`TEST-001`, `OPS-001`, `OPS-002`: fast, finance, security, and full tiers cover 1k/10k/50k transaction fixtures, production build, Docker smoke, migration preflight, backup integrity, restore drill, rollback rehearsal, health checks, and documentation paths/lifecycle claims.
