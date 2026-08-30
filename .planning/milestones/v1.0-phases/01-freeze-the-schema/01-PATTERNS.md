# Phase 1: Freeze the schema - Pattern Map

**Mapped:** 2026-08-30
**Files analyzed:** 4
**Analogs found:** 4 / 4

This phase writes or verifies GSD planning markdown only. No application source files. Closest analogs are the GSD templates, the approved spec, and the four files already on disk.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `.planning/PROJECT.md` | config | transform | `/home/vivek/.config/opencode/gsd-core/templates/project.md` + existing `.planning/PROJECT.md` | exact |
| `.planning/REQUIREMENTS.md` | config | transform | Spec lean schema + existing `.planning/REQUIREMENTS.md` (not the GSD one-liner) | exact |
| `.planning/ROADMAP.md` | config | transform | `/home/vivek/.config/opencode/gsd-core/templates/roadmap.md` + spec `## Roadmap` | exact |
| `.planning/STATE.md` | config | transform | `/home/vivek/.config/opencode/gsd-core/templates/state.md` + existing `.planning/STATE.md` | exact |

Read-only sources (do not modify in this phase):

| File | Why |
|------|-----|
| `docs/superpowers/specs/2026-08-30-organization-and-user-story-schema.md` | Approved content contract |
| `docs/ARCHITECTURE.md` | Plane/formula source of truth |
| `docs/DATA_MODEL.md` | Formula source of truth |

## Pattern Assignments

### `.planning/PROJECT.md` (config, transform)

**Analog:** `/home/vivek/.config/opencode/gsd-core/templates/project.md` for section order; existing `.planning/PROJECT.md` for brownfield content.

**Section order** (template lines 8–76 — keep these headings, drop optional Business Context):

```markdown
# Finance Tracker

## What This Is
## Core Value
## Requirements
### Validated
### Active
### Out of Scope
## Context
## Constraints
## Key Decisions
## Evolution
```

**Brownfield Validated/Active split** (template brownfield rules + existing file lines 17–28):

```markdown
### Validated

- ✓ Four write epics (NW, ACT, CF, PLAN) plus Overview cockpit — existing
- ✓ Passwordless vault auth — existing
- ✓ Encrypted client-side finance storage — existing

### Active

- [ ] OVERVIEW-02 / IA-01 / IA-02 — chrome names the plane — Phase 2
```

Phase 1 freeze: shipped finance/auth stay Validated. OVERVIEW-02 / IA-01 / IA-02 stay Active (Phase 2). Do not mark the IA stories Validated during this phase even if a later session already did.

**Core Value + four-epic statement** (existing PROJECT.md lines 9–12 + spec lines 27–40):

```markdown
## Core Value

Current net worth stays a balance-sheet fact: assets + portfolio − liabilities.
Nothing else may pretend to be that number.
```

PROJECT.md must name the four write epics (NW, ACT, CF, PLAN) and state Overview is a read-only cockpit. Copy epic names from the spec table, not from `docs/ARCHITECTURE.md` table headers (`Balance sheet` / `Transactions ledger`).

**Out of Scope** (existing PROJECT.md lines 29–36 + spec lines 221–230):

```markdown
### Out of Scope

- SimpleFIN — later aggregation
- Plaid — not wanted
- Household sharing — later
- Tax document vault — intentionally removed
- Net worth history — current-only by invariant
- New finance features — this milestone is schema + IA only
```

**Constraints** (existing PROJECT.md lines 44–47):

```markdown
## Constraints

- **Data planes**: Do not mix NW, ACT, CF, PLAN
- **Security**: Finance plaintext never leaves the browser
- **Stack**: Angular 19, FastAPI, SQLite, vault via `/api/vault/*`
```

**Key Decisions table** (template lines 68–74 + spec Approved Decisions):

```markdown
| Decision | Rationale | Outcome |
|----------|-----------|---------|
| One epic per write plane | Matches existing invariants | — Pending |
| Overview is read-only | Prevents dashboard-as-editor | — Pending |
| Lean stories (no role/so-that) | Less ceremony, same gates | — Pending |
| Two-phase milestone | Freeze docs, then IA copy | — Pending |
```

Leave Outcome as `— Pending` for Phase 1. Do not invent a Business Context section (personal self-hosted tool).

---

### `.planning/REQUIREMENTS.md` (config, transform)

**Analog:** Spec user-story schema (lines 65–82) plus existing `.planning/REQUIREMENTS.md`. Do **not** copy the GSD template's one-line `AUTH-01: User can…` body.

**Document skeleton** (GSD template lines 8–12 + existing REQUIREMENTS.md lines 1–7):

```markdown
# Requirements: Finance Tracker

**Defined:** 2026-08-30
**Core Value:** Current net worth stays a balance-sheet fact.

## v1 Requirements
```

**Lean story body — copy this, not the GSD one-liner** (spec lines 65–82):

```markdown
- [ ] **{PLANE}-{NN}**: {one capability}
      Plane: {NW|ACT|CF|PLAN|AUTH|VAULT|OVERVIEW}
      Writes: {collections or none}
      Must not: {invariant}
      Accept:
      - {testable check}
      - {testable check}
```

Rules from the spec (apply to every story):

- One capability per story. No “and” that crosses planes.
- `Writes: none` for Overview and any read-only story.
- `Must not` is required on every money-plane story.
- IDs are stable. Do not reuse a retired ID.
- No `role`. No `so-that`.

**Grouping** (spec line 22 + existing REQUIREMENTS.md headings): `### Overview`, `### NW`, `### ACT`, `### CF`, `### PLAN`, `### AUTH / VAULT`, `### IA`. Keep stories grouped by plane.

**Validated story example** (existing REQUIREMENTS.md lines 10–16; same shape as spec OVERVIEW-01):

```markdown
- [x] **OVERVIEW-01**: See current net worth and period cashflow on one page
      Plane: OVERVIEW · Writes: none
      Must not: imply net worth is a transaction rollup
      Accept:
      - Hero is current balance-sheet total
      - Period filter does not change that total
```

Use `[x]` for the 16 already-shipped stories (OVERVIEW-01, NW-01..03, ACT-01..03, CF-01..03, PLAN-01..03, AUTH-01, AUTH-02, VAULT-01). Use `[ ]` for OVERVIEW-02, IA-01, IA-02.

**Active story example** (spec lines 181–185):

```markdown
- [ ] **OVERVIEW-02**: Overview chrome states it is a read-only picture
      Plane: OVERVIEW · Writes: none
      Must not: add edit affordances for other planes on the dashboard
      Accept:
      - Subtitle/tutorial say current truth vs period activity
```

Copy IA-01 and IA-02 the same way from spec lines 187–195.

**Traceability** (GSD template lines 54–68 + spec Phase 1/2 mapping):

```markdown
| Requirement | Phase | Status |
|-------------|-------|--------|
| OVERVIEW-01 | existing | Complete |
| NW-01 | existing | Complete |
| …all other shipped stories… | existing | Complete |
| OVERVIEW-02 | Phase 2 | Pending |
| IA-01 | Phase 2 | Pending |
| IA-02 | Phase 2 | Pending |
```

Coverage must stay 19 / 19 / 0. Do not invent new IDs. Do not collapse Accept bullets into a single prose line if the spec lists two checks.

**Out of Scope table** (GSD template lines 45–51 + spec lines 221–230):

```markdown
| Feature | Reason |
|---------|--------|
| SimpleFIN | Later aggregation |
| Plaid | Not wanted |
| Household sharing | Later |
| Tax document vault | Intentionally removed |
| Net worth history | Current-only invariant |
```

---

### `.planning/ROADMAP.md` (config, transform)

**Analog:** `/home/vivek/.config/opencode/gsd-core/templates/roadmap.md` (initial v1 form, lines 7–104) + spec `## Roadmap` (lines 196–219).

**Phase list** (template lines 22–26 + spec lines 198–213):

```markdown
## Phases

- [ ] **Phase 1: Freeze the schema** - Planning docs match the approved spec
- [ ] **Phase 2: Align app IA** - Nav, titles, tutorial, and badges name the plane
```

Phase 1 freeze: both phases stay unchecked. Do not mark Phase 2 complete in this phase.

**Phase 1 block** (template lines 29–42 + spec lines 198–206 + existing ROADMAP.md lines 15–26):

```markdown
### Phase 1: Freeze the schema
**Goal**: Planning docs match the organization and user-story spec
**Depends on**: Nothing (first phase)
**Requirements**: OVERVIEW-01, NW-01, NW-02, NW-03, ACT-01, ACT-02, ACT-03, CF-01, CF-02, CF-03, PLAN-01, PLAN-02, PLAN-03, AUTH-01, VAULT-01, AUTH-02
**Success Criteria** (what must be TRUE):
  1. PROJECT.md states the four write epics and Overview cockpit
  2. REQUIREMENTS.md lists every story with the lean schema
  3. ROADMAP.md maps each active story to Phase 2; validated stories stay marked existing
**Plans**: 1 plan

Plans:
- [ ] 01-01: Write PROJECT.md, REQUIREMENTS.md, ROADMAP.md, STATE.md from the spec
```

Validated stories stay on Phase 1 as `existing` in REQUIREMENTS traceability. ROADMAP Phase 1 lists them so GSD coverage is 19/19.

**Phase 2 block** (spec lines 208–219):

```markdown
### Phase 2: Align app IA
**Goal**: A user can tell which plane they are in from the chrome
**Depends on**: Phase 1
**Requirements**: OVERVIEW-02, IA-01, IA-02
**Success Criteria** (what must be TRUE):
  1. Nav groups and tooltips match the IA table
  2. Tutorial steps are ordered by plane, not by table
  3. No net-worth control uses a combined or scenario badge
**Plans**: TBD

Plans:
- [ ] 02-01: Update nav tooltips, page subtitles, tutorial, and source-badge labels
```

**Progress table** (template lines 94–103):

```markdown
| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Freeze the schema | 0/1 | Not started | - |
| 2. Align app IA | 0/1 | Not started | - |
```

Use the initial roadmap form, not the post-v1 milestone `<details>` form. Coarse granularity (`config.json`) → two phases is correct.

---

### `.planning/STATE.md` (config, transform)

**Analog:** `/home/vivek/.config/opencode/gsd-core/templates/state.md` (lines 9–93) + existing `.planning/STATE.md` (leaner digest).

**Frontmatter + position for Phase 1 planning** (template lines 10–38):

```markdown
---
gsd_state_version: '1.0'
status: planning
progress:
  total_phases: 2
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-08-30)

**Core value:** Current net worth stays a balance-sheet fact.
**Current focus:** Freeze the schema

## Current Position

Phase: 1 of 2 (Freeze the schema)
Plan: 0 of 1
Status: Ready to plan
Last activity: 2026-08-30 — planning files exist; Phase 1 verifies them against the spec

Progress: ░░░░░░░░░░ 0%
```

**Accumulated Context** (existing STATE.md lines 31–45 — keep this short form):

```markdown
## Accumulated Context

### Decisions

- Four write epics + Overview cockpit
- Lean story schema (no role / so-that)

### Pending Todos

None yet.

### Blockers/Concerns

None yet.
```

Keep STATE.md under 100 lines (template size constraint). Existing file already omits Performance Metrics and Deferred Items — keep that omission. Do not copy the current on-disk STATE.md `status: complete` / 100% block; that reflects a later session, not Phase 1 freeze.

## Shared Patterns

### Lean story schema
**Source:** `docs/superpowers/specs/2026-08-30-organization-and-user-story-schema.md` lines 65–82
**Apply to:** `.planning/REQUIREMENTS.md` only
Fields: ID, want, plane, writes, must not, accept. No role. No so-that.

### Four write epics + Overview cockpit
**Source:** spec lines 27–40
**Apply to:** PROJECT.md, REQUIREMENTS.md, ROADMAP.md

| Epic | Plane | May write | Must not |
|------|-------|-----------|----------|
| **NW** | Net Worth | `assets`, `liabilities`, `holdings` (and price refresh) | Treat transactions or recurring cashflow as net worth |
| **ACT** | Activity | `transactions` (manual + bank CSV) | Change net worth |
| **CF** | Cashflow | `job_incomes`, `fixed_expenses`, `subscriptions` | Change net worth |
| **PLAN** | Planning | MC presets, encrypted `stock_lab_scenarios` | Mutate assets, liabilities, holdings, or transactions |

Overview (`/`) writes none. AUTH and VAULT are support, not money planes.

### Plane vocabulary
**Source:** spec IA table (lines 49–59), not `docs/ARCHITECTURE.md` plane titles
**Apply to:** all four planning files

Use **NW / ACT / CF / PLAN / Overview**. Do not rename top groups to table names (`Holdings`, `Transactions`). `docs/ARCHITECTURE.md` stays the formula source; this phase does not edit it.

### GSD document skeleton
**Source:** `/home/vivek/.config/opencode/gsd-core/templates/{project,requirements,roadmap,state}.md`
**Apply to:** matching `.planning/*.md` files
Keep required headings, coverage table, phase Goal / Depends on / Requirements / Success Criteria / Plans blocks, STATE frontmatter.

### Out of scope fence
**Source:** spec lines 221–230
**Apply to:** PROJECT.md and REQUIREMENTS.md
Same six exclusions. Do not add SimpleFIN, Plaid, household sharing, tax vault, net-worth history, or new finance features as Active work.

### Verify, do not rewrite app code
**Source:** `01-CONTEXT.md` lines 39–40; spec lines 8–12
**Apply to:** the whole phase
Touch only `.planning/PROJECT.md`, `.planning/REQUIREMENTS.md`, `.planning/ROADMAP.md`, `.planning/STATE.md`. Files already exist — verify against the spec and formalize drift; do not recreate from empty templates if the lean schema is already present.

### Existing-file drift to correct
On-disk planning files currently show Phase 2 / IA stories as complete. Phase 1 success criteria require:

1. Four write epics + Overview cockpit stated
2. Every story listed with the lean schema
3. Active stories mapped to Phase 2; validated stories marked `existing`

If a verify pass finds IA stories already `[x]` / phases `[x]` / STATE at 100%, restore the Phase 1 freeze view above. Do not invent a third phase.

## No Analog Found

None. All four files have GSD templates plus on-disk copies. Story *body* shape comes from the spec, not from the GSD requirements example.

## Metadata

**Analog search scope:** `.planning/`, `docs/superpowers/specs/`, `docs/ARCHITECTURE.md`, `/home/vivek/.config/opencode/gsd-core/templates/`
**Files scanned:** 12 (4 targets, 4 templates, spec, CONTEXT, ARCHITECTURE, config.json)
**Pattern extraction date:** 2026-08-30
