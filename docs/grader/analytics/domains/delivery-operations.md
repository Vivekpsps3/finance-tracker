# Delivery And Operations

## Current Findings

`OPS-001` requires operational recovery evidence, `OPS-002` documentation drift automation, and `CRUFT-001` safe cleanup.

## Target State

Installs and builds are deterministic; CI uses path-aware tiers; images are tagged; copied production-like databases receive migration preflight; backups are integrity-checked; rollback uses a known image; restore drills prove recovery; health checks gate promotion.

## Acceptance Criteria

`OPS-001` records a backup, upgrade, restore, and health-check drill. `OPS-002` rejects stale paths and lifecycle claims. `CRUFT-001` removes only verified-unused artifacts.

## Verification

Execute deployment rehearsal, restore from an independent copy, and controlled stale-doc checks.
