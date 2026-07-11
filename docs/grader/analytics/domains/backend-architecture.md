# Backend And Data Architecture

## Current Findings

`STR-002` protects encrypted records. `BE-001` identifies lifecycle ambiguity; `BE-002` makes migration proof a prerequisite for consolidation; `DOC-001` identifies snapshot lifecycle ambiguity.

## Target State

Classify auth, vault, market, and health as active; classify plaintext routers as retired, migration-only, or test-only; maintain documented migration adapters. Establish one accountable schema authority only after supported database and vault generations pass. Retire planning or plaintext paths only after users and tests no longer require them.

## Acceptance Criteria

`BE-001` publishes owner and retirement conditions per surface. `BE-002` upgrades each supported generation with preserved financial semantics and verified encrypted replacement. `DOC-001` aligns snapshot lifecycle.

## Verification

OpenAPI checks, production configuration review, copied-database migrations, and regression suite.
