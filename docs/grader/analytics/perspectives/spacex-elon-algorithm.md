# SpaceX Elon Algorithm Review

Derived from the [ledger](../evidence-ledger.md) and [baseline](../baseline-scorecard.md).

## Question Requirements

Question every aggregate label (`COR-001`, `COR-002`, `COR-003`), every migration-era surface (`BE-001`, `BE-002`), and every page-local primitive (`FE-001`). A requirement survives only when it preserves financial truth, supported data, security, or a measured user journey.

## Delete

`CRUFT-001` is a candidate inventory, not permission to remove. Do not delete Alembic history, migration state, schema-v1 compatibility until verified, plaintext source tables until migration retirement, financial invariants, or security controls. Delete only after runtime, deploy, test, migration, and documentation references are zero.

## Simplify And Optimize

Consolidate source semantics (`IA-001`), dialog and field primitives (`A11Y-001`, `FE-001`), import recovery (`UX-002`), and API lifecycle ownership (`BE-001`). Use one fixture set for financial and migration semantics before optimizing implementations.

## Accelerate

Make `TEST-001` tiered: fast unit checks, finance invariant checks, privacy/accessibility checks, then full production-like checks. Use URL state and source badges (`UX-003`, `VIS-001`) to shorten diagnosis.

## Automate

Automate privacy gates (`SEC-001`), migration matrices (`BE-002`), deployment preflight and restore drills (`OPS-001`), and documentation drift checks (`OPS-002`).

## Convergence And Tradeoff

The deletion impulse is constrained by `STR-001`, `STR-002`, and `BE-002`; reliable compatibility beats locally cleaner code. The dependency gates in the [roadmap](../roadmap/dependency-map.md) resolve ordering.
