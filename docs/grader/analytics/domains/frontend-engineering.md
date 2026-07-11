# Frontend Engineering Quality

## Current Findings

Standalone components and shared controls are strengths (`STR-004`). `FE-001`, `VIS-001`, `UX-002`, and `A11Y-001` show repeated page-local primitives.

## Target State

Shared dialog, field, page-state, metric, table, and source-badge primitives own behavior that otherwise repeats. Local finance snapshots have explicit in-memory lifetime. Detectors are pure, versioned, fixture-tested functions. Route state is serializable. Performance budgets cover 1k, 10k, and 50k transactions.

## Acceptance Criteria

`FE-001` replaces proven duplicates without changing financial behavior. `UX-002` import UI consumes one parser/result contract. New detector code does not expose private data outside the browser.

## Verification

Component tests, route journeys, bundle/performance fixtures, and privacy tests.
