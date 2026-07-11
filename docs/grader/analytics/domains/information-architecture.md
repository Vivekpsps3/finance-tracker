# Information Architecture And Comprehension

## Current Findings

Intent-based groups are preserved by `STR-004`; `IA-001`, `UX-003`, `COR-002`, and `COR-003` require common source language and recoverable state.

## Target State

Keep five primary groups. Within them, use `Observed`, `Scheduled`, and `Combined outlook` consistently; link a summary to its inputs; make filters and calendar state deep-linkable; give wildcard routes a recovery action; consolidate onboarding and auth terminology.

## Acceptance Criteria

Every aggregate identifies its plane and has a contextual input link. Shared URLs restore filter state. Empty states have one valid next action. `IA-001` terminology is consistent across dashboard, cashflow, and planning.

## Verification

Audit all routes and the return-user journey against [Google review](../perspectives/google-effortless-ux.md).
