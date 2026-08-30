# Phase 2: Align app IA - Context

**Gathered:** 2026-08-30
**Status:** Ready for planning
**Mode:** Auto-generated from approved spec (IA already implemented)

<domain>
## Phase Boundary

A user can tell which plane they are in from the chrome: nav, titles,
tutorial, and source badges. No new features. No route changes.

</domain>

<decisions>
## Implementation Decisions

### Information architecture
- Keep the five existing nav groups
- Each group tooltip names the plane and the must-not
- Overview is a read-only picture; edit other planes on their own pages

### Copy
- Page subtitles name the plane and the must-not
- Tutorial map order: Overview, Net Worth, Cashflow, Activity, Planning
- Tutorial steps stay ordered by plane, not by table

### Source badges
- observed = NW
- scheduled = CF
- combined = ACT+CF
- scenario = PLAN
- Never put combined or scenario on a net-worth figure

### the agent's Discretion
Chrome already shipped in `68a9d8c`. This phase verifies and formalizes.
No layout, token, or route changes.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `NavItem` / `NavGroup` in `frontend/src/app/core/layout/main-layout.component.ts`
- `ui-source-badge` LABELS / DEFAULT_TITLES
- `ui-page-header` subtitles on each finance page

### Established Patterns
- System fonts, Mercury/Linear tokens — do not restyle
- Shared `ui-*` components

### Integration Points
- Nav groups in main-layout
- Dashboard header
- Tutorial overlay in main-layout.html

</code_context>

<specifics>
## Specific Ideas

Approved spec: `docs/superpowers/specs/2026-08-30-organization-and-user-story-schema.md`
IA table and badge mapping already applied.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>
