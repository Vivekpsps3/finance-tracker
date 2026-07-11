# Product And Financial Correctness

## Current Findings

`STR-001` documents the required data planes. `COR-001` requires planning provenance, `COR-002` requires overlap-safe cashflow totals, `COR-003` requires freshness/completeness, and `DOC-001` requires snapshot lifecycle alignment.

## Target State

Every value is `Observed`, `Scheduled`, or `Combined outlook`; combined values name their components and overlap rule. Net worth remains manual assets plus portfolio market value minus liabilities. Transactions never change net worth. Planning is speculative and never mutates truth. Snapshots, if supported, are explicit observed valuations rather than rollups.

## Acceptance Criteria

`COR-001`: planning displays source-by-source inputs. `COR-002`: overlapping fixtures cannot produce an unlabeled total. `COR-003`: aggregate views show timestamp, source, completeness, and cash-sweep caution. `DOC-001`: docs, schema, migration, and tests state one snapshot lifecycle.

## Verification

Use invariant fixtures for transactions, recurring entries, assets, liabilities, holdings, snapshots, and planning. See [master plan](../roadmap/master-plan.md).
