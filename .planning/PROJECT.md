# Finance Tracker

## What This Is

A personal, self-hosted finance tracker. The owner maintains current net worth,
reviews card spending, models recurring cashflow, and runs speculative planning
without mixing those data planes.

## Core Value

Current net worth stays a balance-sheet fact: assets + portfolio − liabilities.
Nothing else may pretend to be that number.

| Epic | Plane | May write | Must not |
|------|-------|-----------|----------|
| **NW** | Net Worth | `assets`, `liabilities`, `holdings` (and price refresh) | Treat transactions or recurring cashflow as net worth |
| **ACT** | Activity | `transactions` (manual + bank CSV) | Change net worth |
| **CF** | Cashflow | `job_incomes`, `fixed_expenses`, `subscriptions` | Change net worth |
| **PLAN** | Planning | MC presets, encrypted `stock_lab_scenarios` | Mutate assets, liabilities, holdings, or transactions |

Overview at `/` is a read-only composition of current NW + period ACT/CF signals. Writes none.

## Requirements

### Validated

- ✓ Four write epics (NW, ACT, CF, PLAN) plus Overview cockpit — existing
- ✓ Passwordless vault auth — existing
- ✓ Encrypted client-side finance storage — existing
- ✓ OVERVIEW-02 / IA-01 / IA-02 — chrome names the plane — Phase 2

### Active

(None — IA milestone shipped)

Moved to Validated: OVERVIEW-02, IA-01, IA-02.

### Out of Scope

- SimpleFIN — later aggregation
- Plaid — not wanted
- Household sharing — later
- Tax document vault — intentionally removed
- Net worth history — current-only by invariant
- New finance features — this milestone is schema + IA only

## Context

Brownfield. Spec: `docs/superpowers/specs/2026-08-30-organization-and-user-story-schema.md`.
Formulas: `docs/DATA_MODEL.md`. Planes: `docs/ARCHITECTURE.md`.

## Constraints

- **Data planes**: Do not mix NW, ACT, CF, PLAN
- **Security**: Finance plaintext never leaves the browser
- **Stack**: Angular 19, FastAPI, SQLite, vault via `/api/vault/*`

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| One epic per write plane | Matches existing invariants | ✓ Good |
| Overview is read-only | Prevents dashboard-as-editor | ✓ Good |
| Lean stories (no role/so-that) | Less ceremony, same gates | ✓ Good |
| Two-phase milestone | Freeze docs, then IA copy | ✓ Good |

## Current State

**Shipped:** v1.0 Organization and user-story schema (2026-08-30)

Four write epics + Overview cockpit are the planning and chrome contract.
Nav, titles, tutorial, and source badges name the plane.

## Next Milestone

None queued. `/gsd-new-milestone` when the next product slice is chosen.

Shipped v1 stories live in `.planning/milestones/v1.0-REQUIREMENTS.md`.

## Evolution

This document evolves at phase transitions and milestone boundaries.

---
*Last updated: 2026-08-30 after v1.0*
