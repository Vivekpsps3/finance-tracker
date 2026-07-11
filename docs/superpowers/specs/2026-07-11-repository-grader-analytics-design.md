# Repository Grader and Analytics Design

**Date:** 2026-07-11  
**Status:** Approved design  
**Target:** `docs/grader/analytics/`

## Purpose

Create a reusable, evidence-backed repository grading system that evaluates the
finance tracker from four complementary perspectives:

1. An Apple UX/UI engineer adapting the product to Apple ecosystem design and
   interaction conventions.
2. A SpaceX engineer applying the five-step Elon algorithm to question,
   delete, simplify, accelerate, and automate.
3. An xAI engineer identifying useful, privacy-preserving innovation rather
   than generic AI features.
4. A Google product UX engineer making workflows discoverable, efficient,
   inclusive, trustworthy, and easy to complete.

The system must produce an initial weighted baseline, preserve all evidence in
one canonical ledger, include every confirmed issue regardless of size, and
support repeatable regrading after future changes.

## Product Constraints

All grading and recommendations must preserve these repository invariants:

- Current net worth is manual assets plus portfolio market value minus
  liabilities.
- Transactions describe spending activity and do not change net worth.
- Net-worth snapshots are observed balance-sheet valuations, not transaction
  rollups.
- Recurring income, bills, and subscriptions describe scheduled cashflow and
  do not change net worth.
- Planning is speculative and must never mutate financial truth.
- Manual cash and brokerage sweeps can overlap; recommendations must not hide
  that risk.
- Browser-owned finance plaintext and secrets must remain server-blind.
- Explicit portfolio refresh and Stock Lab research disclose ticker symbols,
  but not shares, values, account details, or saved scenario inputs.
- Persisted-data compatibility and migration safety take precedence over
  architectural purity.
- Removed tax-document storage must not be reintroduced.

## Chosen Approach

Use an evidence ledger with derived perspective reports.

One canonical finding registry prevents four independent reviews from
duplicating issues, assigning conflicting facts, or producing incompatible
priorities. Perspective and domain reports interpret the same findings through
different lenses. The scorecard and roadmap are derived from that shared
evidence.

This approach is preferred over four independent reports because it supports
repeatable grading and deduplication. It is preferred over one unified report
because it preserves the distinct Apple, SpaceX, xAI, and Google perspectives.

## Directory Structure

```text
docs/grader/analytics/
|-- README.md
|-- methodology.md
|-- baseline-scorecard.md
|-- evidence-ledger.md
|-- perspectives/
|   |-- apple-ecosystem-ux.md
|   |-- spacex-elon-algorithm.md
|   |-- xai-innovation.md
|   `-- google-effortless-ux.md
|-- domains/
|   |-- product-correctness.md
|   |-- accessibility.md
|   |-- information-architecture.md
|   |-- visual-system.md
|   |-- responsive-platforms.md
|   |-- privacy-security.md
|   |-- frontend-engineering.md
|   |-- backend-architecture.md
|   |-- testing-quality.md
|   |-- delivery-operations.md
|   `-- innovation.md
|-- scorecards/
|   |-- rubric.md
|   `-- review-template.md
`-- roadmap/
    |-- master-plan.md
    |-- dependency-map.md
    `-- acceptance-criteria.md
```

## Artifact Responsibilities

### `README.md`

Explain how to navigate the grading package, distinguish canonical from derived
artifacts, and perform a future review.

### `methodology.md`

Define evidence standards, severity, confidence, scoring, blocker caps,
maturity levels, finding lifecycle, conflict rules, and regrading procedure.

### `baseline-scorecard.md`

Record the current weighted score, domain maturity, evidence confidence,
blocking findings, strengths, and score rationale. It must not contain findings
that are absent from the evidence ledger.

### `evidence-ledger.md`

Act as the canonical source of truth for all strengths, defects, risks,
opportunities, deletion candidates, experiments, and runtime-verification
needs.

### Perspective Reports

Interpret canonical evidence according to each requested engineering lens.
They may rank findings differently but must not redefine their factual content.

### Domain Reports

Combine relevant findings across perspectives to explain systemic causes,
target architecture, affected journeys, implementation considerations, and
domain-specific acceptance criteria.

### Scorecard Templates

Make future reviews reproducible without copying the current baseline. The
rubric defines scoring; the review template provides a blank assessment form.

### Roadmap

Convert every actionable finding into dependency-aware implementation work.
The roadmap assumes unlimited parallel workforce but still enforces correctness,
security, migration, and architectural ordering.

## Canonical Finding Schema

Every finding must include:

- Stable ID using a domain prefix, such as `COR-001`, `A11Y-004`, or
  `CRUFT-012`.
- Classification: preserve, repair, simplify, delete, redesign, automate, or
  experiment.
- Concise title and problem or strength statement.
- Exact file and line evidence.
- Affected user journeys, subsystems, and platforms.
- Perspective attribution: Apple, SpaceX, xAI, Google, or cross-cutting.
- Severity: blocker, critical, high, medium, low, or polish.
- Confidence: confirmed, strongly indicated, or runtime verification required.
- Impact dimensions: correctness, trust, accessibility, usability, privacy,
  maintainability, performance, operations, and innovation.
- Existing strengths or constraints that remediation must preserve.
- Recommended disposition and rationale.
- Dependencies, conflicts, and safe parallelization notes.
- Concrete acceptance criteria.
- Verification method.
- Status and resolution evidence for future regrading.

Duplicate observations from multiple perspectives must share one canonical ID
and carry multiple perspective tags.

## Classification Meanings

### Preserve

An existing strength, architectural boundary, user-facing behavior, or
financial invariant that future work must retain.

### Repair

Behavior that is incorrect, inaccessible, misleading, unsafe, or unreliable.

### Simplify

Necessary behavior whose implementation, documentation, or workflow contains
avoidable complexity.

### Delete

Proven cruft whose compatibility, data-retention, migration, and operational
risks have been checked explicitly.

### Redesign

A valid capability with a structurally weak interaction model or architecture.

### Automate

Recurring verification, maintenance, quality, migration, security, or
operational work that should become deterministic.

### Experiment

An innovation hypothesis that needs measurable validation before broad
implementation.

## Weighted Scoring Model

The baseline uses a 100-point score.

| Domain | Weight |
|---|---:|
| Product and financial correctness | 15 |
| Privacy, security, and trust | 15 |
| Accessibility and inclusive interaction | 12 |
| Core workflow usability | 12 |
| Information architecture and comprehension | 8 |
| Responsive and Apple-platform adaptation | 8 |
| Visual system and interface consistency | 6 |
| Frontend engineering quality | 6 |
| Backend and data architecture | 6 |
| Testing and operational reliability | 6 |
| Simplicity and cruft control | 3 |
| Innovation and differentiated value | 3 |
| **Total** | **100** |

Each domain reports:

- Achievement score against the documented rubric.
- Evidence confidence.
- Applicable blocker cap.
- Maturity label.
- Strengths credited.
- Finding IDs responsible for deductions.
- Verification required before the score can increase.

## Maturity Levels

- **Fragile:** Core behavior is misleading, unsafe, inaccessible, or dependent
  on undocumented assumptions.
- **Foundational:** Sound direction exists, but major workflow or quality gaps
  remain.
- **Operational:** Core journeys are correct and usable with known limitations.
- **Refined:** Workflows are consistent, accessible, adaptive, and well tested.
- **Exemplary:** The domain demonstrates unusually strong execution,
  explainability, resilience, and measurable quality.

## Blocker Caps

Scores are not simple issue counts. Severe unresolved defects cap maturity even
when substantial polish exists.

- A financial total that can materially mislead users caps product correctness
  below operational.
- A primary action that is unavailable to keyboard or assistive-technology
  users caps accessibility below operational.
- Broken dialog focus across core workflows caps accessibility below
  operational.
- Secret or finance-plaintext leakage caps privacy and security at zero until
  resolved and verified.
- Planning that mutates observed financial records caps product correctness at
  zero.
- Missing tests lower evidence confidence; they do not automatically prove
  broken behavior.
- Missing aspirational functionality is not a defect unless product copy,
  documentation, or contracts promise it.

## Perspective Lenses

### Apple Ecosystem UX/UI

Evaluate adaptive macOS, iPadOS, and iOS web behavior; system typography;
materials; direct manipulation; keyboard, touch, VoiceOver, contrast, reduced
motion, and safe areas; privacy communication; platform metadata; and visual
coherence. Do not recommend a native rewrite without demonstrated need.

### SpaceX and the Elon Algorithm

Apply the steps in order:

1. Question every requirement.
2. Delete unnecessary parts or processes.
3. Simplify and optimize what remains.
4. Accelerate feedback and delivery cycles.
5. Automate recurring work.

Deletion requires evidence. Migration history, persisted data, security
controls, and compatibility code must not be removed merely because they look
old.

### xAI Innovation

Prioritize differentiated, local, explainable financial instrumentation over
chatbot features. Candidate innovation must preserve server-blind storage,
label fact versus inference versus scenario, provide evidence and confidence,
and avoid automatic mutation of financial truth.

### Google Effortless UX

Evaluate discoverability, task completion, consistency, responsive behavior,
error recovery, progressive disclosure, comprehension, inclusive design, and
trust. Preserve the product's operational density rather than replacing it
with a generic consumer-finance interface.

## Review Data Flow

```text
Repository evidence
    -> canonical finding
    -> severity, confidence, and affected domains
    -> perspective interpretations
    -> remediation task and dependencies
    -> acceptance criteria and verification
    -> resolution evidence
    -> regraded baseline
```

## Roadmap Model

Every actionable finding must appear in the roadmap, including low-severity and
polish findings. Unlimited workforce permits all independent branches to begin
immediately, but does not remove dependency gates.

### Wave 1: Protect Invariants and Establish Truth

- Correct misleading planning and cashflow behavior.
- Preserve all financial data-plane boundaries.
- Resolve documentation and runtime contradictions.
- Establish behavioral baselines before structural work.

Initial high-priority concerns to verify include encrypted planning inputs that
appear to be labeled transaction-derived while using recurring configuration,
and dashboard cashflow that can blend observed and scheduled values in a way
that risks double counting.

### Wave 2: Repair Accessibility and Interaction Foundations

- Build one accessible dialog and sheet primitive.
- Correct route-navigation semantics.
- Make sorting and chart exploration keyboard and touch operable.
- Standardize errors, statuses, validation, focus, and touch targets.

### Wave 3: Simplify Architecture and Remove Proven Cruft

- Delete orphaned assets and superseded active-looking documents.
- Remove confirmed unused dependencies.
- Classify and isolate legacy plaintext compatibility.
- Consolidate migration authority, shared UI patterns, and cross-language
  financial fixtures.

### Wave 4: Make Core Workflows Effortless

- Unify onboarding, passphrase, recovery, and vault language.
- Improve transaction import, review, and failure recovery.
- Separate observed and scheduled cashflow.
- Add freshness, completeness, and source-quality guidance.
- Improve planning provenance and progressive disclosure.

### Wave 5: Build Adaptive Apple-Platform Presentation

- Add macOS and iPadOS sidebar or split-view behavior.
- Add appropriate iPhone navigation and list-cell alternatives.
- Support system appearance, increased contrast, reduced transparency, safe
  areas, and installability metadata.
- Centralize locale-aware financial formatting.

### Wave 6: Add Differentiated Local Intelligence

- Build a browser-local financial snapshot and data-quality layer.
- Add explainable anomaly and recurring-charge detectors.
- Add encrypted observed net-worth history and attribution.
- Add a ranked, reversible decision cockpit.
- Add planning sensitivity and evidence-weighted Stock Lab analysis.
- Complete client-side brokerage import and reconciliation.

### Wave 7: Automate Quality and Operations

- Add journey, accessibility, responsive, privacy, and performance tests.
- Add a migration compatibility matrix.
- Add dependency and documentation drift checks.
- Improve reproducible builds, deployment preflight, rollback, and restore
  drills.

### Wave 8: Complete the Polish Backlog

- Resolve all copy, capitalization, heading, empty-state, terminology, layout,
  semantic, and minor consistency findings.

## Conflict Rules

- Financial correctness overrides visual elegance.
- Privacy, security, and server-blind constraints override convenience.
- Accessibility is a release requirement, not polish.
- Deletion requires evidence and migration safety.
- Innovation must be explainable and cannot automatically mutate financial
  truth.
- Apple and Google recommendations must preserve operational density.
- Existing user data and supported migration paths take precedence over code
  purity.
- When two recommendations conflict, the evidence ledger records the conflict
  and the higher-order rule that resolves it.

## Evidence Standards

- Static findings cite exact file paths and line ranges.
- Runtime-dependent claims are labeled for verification rather than asserted as
  facts.
- Deletion candidates state compatibility and persisted-data risks.
- Security recommendations are checked against the documented threat model.
- UX recommendations identify affected journeys and device classes.
- Innovation proposals state privacy boundaries, failure modes, and measurable
  hypotheses.
- Historical plans are context, not proof of implementation.
- Previously completed work is rechecked against current code before receiving
  credit.

## Error and Ambiguity Handling

- Conflicting evidence remains open with a concrete verification task.
- Missing runtime evidence lowers confidence rather than automatically lowering
  achievement.
- Recommendations that violate hard invariants are rejected.
- Duplicate findings merge under one canonical ID.
- Large findings decompose into independently verifiable tasks.
- Small findings remain visible in the polish backlog.
- A score changes only when resolution evidence and verification are linked to
  the relevant finding IDs.

## Verification Requirements

Implementation tasks derived from the grader must require the checks relevant
to their risk:

- Financial invariant tests before behavior changes.
- Keyboard and assistive-technology checks for interactive primitives.
- Phone, tablet, desktop, zoom, contrast, reduced-motion, and
  reduced-transparency checks.
- Network and storage checks proving that finance plaintext, secrets, and
  private insight evidence remain local.
- Explicit ticker-disclosure regression checks.
- Migration fixtures before deleting compatibility code or persisted tables.
- Backend tests and Angular development builds after substantial work.
- Production builds, E2E, accessibility, Docker, migration, backup, and
  deployment checks where relevant.

## Regrading Workflow

1. Record the repository revision and review date.
2. Re-run static and runtime evidence collection.
3. Add new findings and update existing findings without changing stable IDs.
4. Attach resolution evidence to completed findings.
5. Recalculate domain achievement and confidence.
6. Apply blocker caps.
7. Update perspective and domain interpretations.
8. Update the roadmap and dependency map.
9. Publish the score delta with the finding IDs that caused it.

## Definition of Success

The grading system succeeds when another engineer can:

1. Reproduce the baseline grade.
2. Trace every deduction to repository evidence.
3. Understand why each issue matters.
4. See all remediation work without perspective duplication.
5. Identify dependency-safe parallel work.
6. Verify completion objectively.
7. Regrade the repository without rediscovering the methodology.

## Out of Scope

This design creates the grading and planning framework. It does not itself
implement the recommended product, UX, architecture, innovation, or operational
changes. Those changes require the exhaustive implementation plan generated
after the initial grader artifacts are written and reviewed.
