# Repository Grader and Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a reusable, evidence-backed repository grading package in `docs/grader/analytics/` with a weighted baseline, four engineering perspectives, domain analyses, and an exhaustive dependency-aware remediation roadmap.

**Architecture:** `evidence-ledger.md` is the canonical finding registry. The scorecard, perspective reports, domain reports, and roadmap derive from stable finding IDs so facts are not duplicated or contradicted. The package is documentation-only, but its validation commands enforce structure, traceability, internal links, score arithmetic, placeholder absence, and repository-reference accuracy.

**Tech Stack:** GitHub-flavored Markdown, Git, ripgrep, Bash, existing Angular/FastAPI/SQLite repository evidence.

## Global Constraints

- Current net worth remains manual assets plus portfolio market value minus liabilities.
- Transactions, recurring cashflow, observed net-worth snapshots, and speculative planning remain separate data planes.
- Planning recommendations must never mutate assets, liabilities, holdings, or transactions.
- Finance plaintext, vault passphrases, recovery keys, private keys, and private insight evidence remain browser-owned.
- Explicit market refresh and Stock Lab research may disclose ticker symbols only under the documented boundary.
- Persisted-data compatibility and migration safety take precedence over deletion or architectural purity.
- Removed tax-document storage must not be reintroduced.
- Accessibility is a release requirement, not polish.
- Every confirmed issue, including low-severity and polish issues, must appear in the canonical ledger and roadmap.
- Runtime-dependent claims must be labeled for verification rather than asserted as facts.
- Do not modify application code while creating the grading package.
- Do not modify or remove the existing untracked `.superpowers/` directory.

---

## File Structure

### Canonical files

- Create `docs/grader/analytics/README.md`: package map, usage, canonical-source rules, and regrading entry point.
- Create `docs/grader/analytics/methodology.md`: scoring, evidence, severity, confidence, blocker caps, lifecycle, and conflict rules.
- Create `docs/grader/analytics/evidence-ledger.md`: all stable findings and strengths.
- Create `docs/grader/analytics/baseline-scorecard.md`: weighted current grade derived from ledger IDs.

### Perspective files

- Create `docs/grader/analytics/perspectives/apple-ecosystem-ux.md`.
- Create `docs/grader/analytics/perspectives/spacex-elon-algorithm.md`.
- Create `docs/grader/analytics/perspectives/xai-innovation.md`.
- Create `docs/grader/analytics/perspectives/google-effortless-ux.md`.

### Domain files

- Create `docs/grader/analytics/domains/product-correctness.md`.
- Create `docs/grader/analytics/domains/accessibility.md`.
- Create `docs/grader/analytics/domains/information-architecture.md`.
- Create `docs/grader/analytics/domains/visual-system.md`.
- Create `docs/grader/analytics/domains/responsive-platforms.md`.
- Create `docs/grader/analytics/domains/privacy-security.md`.
- Create `docs/grader/analytics/domains/frontend-engineering.md`.
- Create `docs/grader/analytics/domains/backend-architecture.md`.
- Create `docs/grader/analytics/domains/testing-quality.md`.
- Create `docs/grader/analytics/domains/delivery-operations.md`.
- Create `docs/grader/analytics/domains/innovation.md`.

### Reusable scorecards and roadmap

- Create `docs/grader/analytics/scorecards/rubric.md`.
- Create `docs/grader/analytics/scorecards/review-template.md`.
- Create `docs/grader/analytics/roadmap/master-plan.md`.
- Create `docs/grader/analytics/roadmap/dependency-map.md`.
- Create `docs/grader/analytics/roadmap/acceptance-criteria.md`.

## Shared Interfaces

Every task that creates findings must use this exact field order:

```markdown
### A11Y-001: Descriptive title

- **Classification:** Repair
- **Severity:** Critical
- **Confidence:** Confirmed
- **Perspectives:** Apple, Google
- **Domains:** Accessibility, Core workflow usability
- **Affected journeys:** Transaction import, portfolio maintenance
- **Affected platforms:** Web, macOS, iPadOS, iOS
- **Evidence:** `frontend/src/app/example.component.html:10-24`
- **Finding:** Factual description of current behavior.
- **Impact:** User, product, engineering, or operational consequence.
- **Preserve:** Existing strengths or constraints that remediation must retain.
- **Recommendation:** Specific disposition and target behavior.
- **Dependencies:** `None` or comma-separated stable finding IDs.
- **Acceptance criteria:** Objective completion conditions.
- **Verification:** Exact static, automated, or manual verification.
- **Status:** Open
```

Allowed classification values are `Preserve`, `Repair`, `Simplify`, `Delete`, `Redesign`, `Automate`, and `Experiment`.

Allowed severity values are `Blocker`, `Critical`, `High`, `Medium`, `Low`, and `Polish`.

Allowed confidence values are `Confirmed`, `Strongly indicated`, and `Runtime verification required`.

Stable ID prefixes are:

```text
STR    Preserve/strength
COR    Product and financial correctness
SEC    Privacy, security, and trust
A11Y   Accessibility and inclusive interaction
UX     Core workflow usability
IA     Information architecture and comprehension
PLAT   Responsive and Apple-platform adaptation
VIS    Visual system and interface consistency
FE     Frontend engineering quality
BE     Backend and data architecture
TEST   Testing and operational reliability
CRUFT  Simplicity and deletion candidates
INNO   Innovation and differentiated value
OPS    Delivery and operations
DOC    Documentation accuracy
```

---

### Task 1: Establish Methodology and Package Navigation

**Files:**
- Create: `docs/grader/analytics/README.md`
- Create: `docs/grader/analytics/methodology.md`

**Interfaces:**
- Consumes: `docs/superpowers/specs/2026-07-11-repository-grader-analytics-design.md`.
- Produces: the canonical vocabulary, scoring rules, stable ID prefixes, finding lifecycle, and navigation contract used by every later task.

- [ ] **Step 1: Create the package directories and navigation file**

Create `README.md` with these sections and explicit links:

```markdown
# Repository Grader and Analytics

## Purpose
## Current Baseline
## Canonical Sources
## Perspective Reviews
## Domain Reviews
## Remediation Roadmap
## Regrading Workflow
## Reading Order
```

Under `Canonical Sources`, state that `evidence-ledger.md` owns factual findings, `methodology.md` owns grading rules, and all other documents are derived views. Under `Reading Order`, link in this order: methodology, evidence ledger, baseline scorecard, perspective reports, domain reports, roadmap.

- [ ] **Step 2: Write the methodology vocabulary**

Create `methodology.md` with the exact classification, severity, confidence, maturity, ID-prefix, and finding-schema values from this plan's Shared Interfaces. Explain that a derived report may prioritize a finding differently but cannot change its factual statement, severity, confidence, or status without updating the ledger first.

- [ ] **Step 3: Define score arithmetic and maturity bands**

Record the twelve domain weights from the approved design. Define domain achievement as an integer from 0 through its domain weight and total score as the sum of those earned points. Define maturity by percentage of available domain points:

```text
0-39%   Fragile
40-59%  Foundational
60-74%  Operational
75-89%  Refined
90-100% Exemplary
```

Document the approved blocker caps and state that caps apply after raw achievement scoring.

- [ ] **Step 4: Define evidence and conflict rules**

Include exact rules for static evidence, runtime verification, historical plans, persisted-data compatibility, server-blind privacy, financial invariants, duplicate findings, score changes, and disagreement resolution. State that missing aspirational features are not defects unless promised by UI, docs, or contracts.

- [ ] **Step 5: Validate package links and forbidden placeholders**

Run:

```bash
rg -n "TBD|TODO|FIXME|PLACEHOLDER|implement later" docs/grader/analytics/README.md docs/grader/analytics/methodology.md
```

Expected: no output.

Run:

```bash
rg -n "evidence-ledger.md|baseline-scorecard.md|perspectives/|domains/|roadmap/" docs/grader/analytics/README.md
```

Expected: links to every artifact group.

- [ ] **Step 6: Commit the methodology foundation**

```bash
git add docs/grader/analytics/README.md docs/grader/analytics/methodology.md
git commit -m "docs: establish repository grading methodology"
```

---

### Task 2: Build the Canonical Evidence Ledger

**Files:**
- Create: `docs/grader/analytics/evidence-ledger.md`

**Interfaces:**
- Consumes: the schema and vocabulary in `methodology.md`; repository source, tests, configuration, and current documentation.
- Produces: stable finding IDs referenced by every score, report, domain analysis, and roadmap task.

- [ ] **Step 1: Add ledger metadata and index**

Add review date, reviewed Git revision from `git rev-parse HEAD`, review scope, static-review limitation, finding counts by classification/severity/confidence, and a linked index grouped by ID prefix.

- [ ] **Step 2: Record cross-cutting strengths first**

Create `STR-*` entries for at least these evidenced strengths:

- Explicit financial data-plane separation in `AGENTS.md`, `docs/ARCHITECTURE.md`, and `docs/DATA_MODEL.md`.
- Browser-owned encryption and ciphertext-only vault storage.
- Passwordless challenge authentication and user-held recovery boundary.
- Contextual ticker disclosure.
- Existing design tokens and shared UI primitives.
- Existing focus-visible, reduced-motion, skip-link, safe-area, and touch-size foundations.
- Client-side bank import and deterministic planning behavior.
- Current intent-based navigation and operational dashboard density.

Each strength must use the full canonical schema and `Classification: Preserve`.

- [ ] **Step 3: Record correctness and trust findings**

Inspect and cite the exact current line ranges in:

```text
frontend/src/app/services/planning.service.ts
frontend/src/app/crypto/client-finance.ts
frontend/src/app/dashboard/dashboard.component.ts
frontend/src/app/dashboard/dashboard.component.html
frontend/src/app/planning/planning.component.ts
frontend/src/app/planning/planning.component.html
docs/DATA_MODEL.md
docs/ARCHITECTURE.md
```

Create canonical findings for transaction-derived planning labels versus actual input calculation, observed-plus-scheduled cashflow overlap, source provenance, recurring reconciliation, partial transaction totals, stale balance interpretation, net-worth snapshot status, and Stock Lab assumption transparency.

- [ ] **Step 4: Record accessibility and interaction findings**

Create canonical findings for dialog focus lifecycle, missing accessible dialog names, routed links using tab semantics, mobile navigation names, pointer-only sorting, chart hover/canvas access, duplicate caption IDs, heading/table semantics, calendar semantics, live-region inconsistency, touch targets, and runtime contrast/zoom/VoiceOver verification.

Cite current line ranges from shared UI, layout, transactions, portfolio, assets/liabilities, calendar, planning chart, dashboard, vault, and admin files.

- [ ] **Step 5: Record workflow and information-architecture findings**

Create findings for onboarding duplication, recovery-key handling, stale password terminology, silent transaction/import failures, importer-copy drift, preview controls and summaries, responsive table usability, mobile navigation discoverability, planning units and deep links, empty-state actions, wildcard routing, and observed/scheduled source labels.

- [ ] **Step 6: Record frontend and visual-system findings**

Create findings for modal duplication, table-wrapper duplication, mixed shared/native fields, inline decorative styles, dark-only tokens, external font loading, platform metadata, locale formatting, page-width strategy, responsive list alternatives, and shared page-state/metric/source-badge gaps.

- [ ] **Step 7: Record backend, cruft, testing, and operations findings**

Create findings for active versus legacy API classification, backend planning duplication, three schema authorities, duplicated requirements, optional Redis, unused dependency candidates, `main.py` test coupling, orphaned tax sample, superseded docs, legacy redirect, migration matrix, E2E coverage, static analysis, production build validation, deployment rollback, backup restore drills, and documentation drift automation.

Deletion findings must list evidence required before removal and explicitly preserve Alembic history and migration source data.

- [ ] **Step 8: Record innovation opportunities**

Create `INNO-*` experiment findings for a local explainable signal engine, decision cockpit, encrypted observed net-worth timeline, planning sensitivity/provenance, evidence-weighted Stock Lab, adaptive data-quality guidance, and client-side brokerage import. Include privacy boundaries, failure modes, measurable hypotheses, and non-mutation guarantees.

- [ ] **Step 9: Verify every evidence path exists**

Extract backticked repository references manually from the ledger and check each referenced path with `test -e`. Correct any stale or misspelled path before continuing. For line references, re-read the cited range and ensure it supports the factual statement.

- [ ] **Step 10: Validate canonical field coverage**

Run one count for every required field:

```bash
rg -c '^### (STR|COR|SEC|A11Y|UX|IA|PLAT|VIS|FE|BE|TEST|CRUFT|INNO|OPS|DOC)-[0-9]{3}:' docs/grader/analytics/evidence-ledger.md
rg -c '^- \*\*Classification:\*\*' docs/grader/analytics/evidence-ledger.md
rg -c '^- \*\*Severity:\*\*' docs/grader/analytics/evidence-ledger.md
rg -c '^- \*\*Confidence:\*\*' docs/grader/analytics/evidence-ledger.md
rg -c '^- \*\*Acceptance criteria:\*\*' docs/grader/analytics/evidence-ledger.md
rg -c '^- \*\*Verification:\*\*' docs/grader/analytics/evidence-ledger.md
rg -c '^- \*\*Status:\*\*' docs/grader/analytics/evidence-ledger.md
```

Expected: all seven counts are identical and greater than zero.

- [ ] **Step 11: Validate stable IDs are unique**

Run:

```bash
rg -o '^### (STR|COR|SEC|A11Y|UX|IA|PLAT|VIS|FE|BE|TEST|CRUFT|INNO|OPS|DOC)-[0-9]{3}' docs/grader/analytics/evidence-ledger.md | sort | uniq -d
```

Expected: no output.

- [ ] **Step 12: Commit the evidence ledger**

```bash
git add docs/grader/analytics/evidence-ledger.md
git commit -m "docs: catalog repository grading evidence"
```

---

### Task 3: Calculate the Weighted Baseline Scorecard

**Files:**
- Create: `docs/grader/analytics/baseline-scorecard.md`

**Interfaces:**
- Consumes: domain weights and blocker rules from `methodology.md`; stable IDs from `evidence-ledger.md`.
- Produces: one reproducible 100-point baseline and domain maturity table.

- [ ] **Step 1: Create the baseline summary**

Record review date, Git revision, total earned score, overall maturity, confidence summary, and the critical interpretation that the grade is a current evidence-backed baseline rather than a prediction of product potential.

- [ ] **Step 2: Score all twelve domains**

For each weighted domain, provide available points, earned points, achievement percentage, maturity, confidence, blocker cap, credited `STR-*` IDs, deduction IDs, and concise rationale. Do not assign a deduction without a ledger ID.

- [ ] **Step 3: Apply blocker caps explicitly**

Create a `Blocking Findings` section listing each applicable cap, the affected domain, its finding ID, and what verification or remediation removes the cap. Do not silently lower scores.

- [ ] **Step 4: Add score-improvement rules**

For every domain, list the exact finding IDs that must close before it can reach the next maturity level. State that closed findings require resolution evidence and verification in the ledger.

- [ ] **Step 5: Verify score arithmetic**

Manually sum the twelve available weights to 100 and the twelve earned values to the displayed total. Run:

```bash
rg -n '^\| .+ \| [0-9]+ \| [0-9]+ \|' docs/grader/analytics/baseline-scorecard.md
```

Expected: twelve domain rows plus a total row with 100 available points.

- [ ] **Step 6: Verify every finding reference exists**

Compare all stable IDs in the scorecard against ledger headings. Any scorecard ID absent from the ledger is an error and must be removed or added canonically to the ledger first.

- [ ] **Step 7: Commit the baseline scorecard**

```bash
git add docs/grader/analytics/baseline-scorecard.md
git commit -m "docs: grade current repository baseline"
```

---

### Task 4: Write the Four Perspective Reports

**Files:**
- Create: `docs/grader/analytics/perspectives/apple-ecosystem-ux.md`
- Create: `docs/grader/analytics/perspectives/spacex-elon-algorithm.md`
- Create: `docs/grader/analytics/perspectives/xai-innovation.md`
- Create: `docs/grader/analytics/perspectives/google-effortless-ux.md`

**Interfaces:**
- Consumes: stable ledger IDs, baseline domain scores, methodology conflict rules.
- Produces: four complete interpretations with no independent factual registry.

- [ ] **Step 1: Write the Apple ecosystem report**

Include executive assessment, current strengths, prioritized findings, macOS recommendations, iPadOS recommendations, iOS recommendations, Safari/web-platform concerns, accessibility requirements, phased target state, measurable acceptance criteria, and preserved constraints. Cover adaptive navigation, tables-to-list cells, dialogs/sheets, system appearance, system fonts, locale formatting, safe areas, keyboard/touch/VoiceOver, chart alternatives, and installability without proposing unsafe plaintext caching.

- [ ] **Step 2: Write the SpaceX report in algorithm order**

Use sections `Question Requirements`, `Delete`, `Simplify and Optimize`, `Accelerate`, and `Automate`. Rank deletion candidates by confidence and risk. Explicitly list what must not be deleted: Alembic history, migration state, schema-v1 compatibility until verified, plaintext source tables until migration retirement, financial invariants, and security controls.

- [ ] **Step 3: Write the xAI innovation report**

Include existing innovation assets, missed signals, ranked bets, top-bet local architecture, privacy threat analysis, experiments, and measurable success criteria. Reject generic chatbot recommendations. Explain how each proposal remains local, inspectable, confidence-scored, and non-mutating.

- [ ] **Step 4: Write the Google effortless UX report**

Include journey maps for first setup, return/recovery, net worth, transaction import/review, recurring cashflow, and planning. Add prioritized heuristic findings, target information architecture, shared design-system opportunities, responsive/inclusive requirements, privacy-safe UX metrics, and phased acceptance criteria.

- [ ] **Step 5: Add cross-perspective convergence and disagreement sections**

Each report must identify findings shared with other perspectives and any perspective-specific tradeoff. Resolve conflicts through the approved rules rather than creating contradictory recommendations.

- [ ] **Step 6: Verify reports only reference canonical IDs**

Extract all stable IDs from the four reports and compare them to ledger headings. Correct orphan references. Verify that each report links to `../evidence-ledger.md`, `../baseline-scorecard.md`, and the relevant domain documents.

- [ ] **Step 7: Commit the perspective reports**

```bash
git add docs/grader/analytics/perspectives
git commit -m "docs: add four repository review perspectives"
```

---

### Task 5: Write Product, Accessibility, and Experience Domains

**Files:**
- Create: `docs/grader/analytics/domains/product-correctness.md`
- Create: `docs/grader/analytics/domains/accessibility.md`
- Create: `docs/grader/analytics/domains/information-architecture.md`
- Create: `docs/grader/analytics/domains/visual-system.md`
- Create: `docs/grader/analytics/domains/responsive-platforms.md`

**Interfaces:**
- Consumes: ledger findings and all four perspective interpretations.
- Produces: cross-perspective target states and implementation boundaries used by the roadmap.

- [ ] **Step 1: Write product correctness analysis**

Document current strengths, correctness risks, target cashflow semantics, planning provenance, transaction-summary scope, observed snapshot semantics, reconciliation rules, and invariant tests. Define the target labels `Observed`, `Scheduled`, and `Combined outlook` and prohibit unlabeled blending.

- [ ] **Step 2: Write accessibility analysis**

Define target dialog lifecycle, navigation semantics, sortable table behavior, chart alternatives, form errors, live regions, focus after route changes, touch targets, zoom/reflow, color independence, reduced motion, reduced transparency, and manual VoiceOver test journeys.

- [ ] **Step 3: Write information architecture analysis**

Preserve the five primary groups while defining recommended internal hierarchy, source labels, deep-linkable state, wildcard routing, onboarding consolidation, contextual cross-links, and terminology standards.

- [ ] **Step 4: Write visual-system analysis**

Inventory existing tokens and shared controls, then define the target token modes, surface hierarchy, typography, financial formatting, source badges, metric components, field patterns, empty/error/loading states, and exceptions for bespoke hero surfaces.

- [ ] **Step 5: Write responsive-platform analysis**

Define target behavior for 390x844, 844x390, 768x1024, 1024x768, 1280x800, 1440x900, and 1728x1117. Cover iPhone navigation/list cells, iPad split views, macOS sidebars/dense tables, Stage Manager/Split View, software keyboards, safe areas, and coarse-pointer target expansion.

- [ ] **Step 6: Validate domain traceability**

Every `Current finding`, `Target requirement`, and `Acceptance criterion` subsection must cite at least one stable ledger ID. Add links back to the relevant perspective reports.

- [ ] **Step 7: Commit the experience domain reports**

```bash
git add docs/grader/analytics/domains/product-correctness.md docs/grader/analytics/domains/accessibility.md docs/grader/analytics/domains/information-architecture.md docs/grader/analytics/domains/visual-system.md docs/grader/analytics/domains/responsive-platforms.md
git commit -m "docs: analyze product and experience domains"
```

---

### Task 6: Write Engineering, Security, Operations, and Innovation Domains

**Files:**
- Create: `docs/grader/analytics/domains/privacy-security.md`
- Create: `docs/grader/analytics/domains/frontend-engineering.md`
- Create: `docs/grader/analytics/domains/backend-architecture.md`
- Create: `docs/grader/analytics/domains/testing-quality.md`
- Create: `docs/grader/analytics/domains/delivery-operations.md`
- Create: `docs/grader/analytics/domains/innovation.md`

**Interfaces:**
- Consumes: canonical findings, existing architecture/security/deployment docs, and perspective reports.
- Produces: engineering target states, deletion safety rules, automation requirements, and innovation experiment contracts used by roadmap tasks.

- [ ] **Step 1: Write privacy and security analysis**

Cover server-blind scope and limitations, malicious frontend delivery, recovery and signing keys, ticker disclosure, blind-index leakage, encrypted-record metadata leakage, logs/URLs, service-worker caching restrictions, browser memory, migration cleanup, admin limits, and tests required for every new analytics capability.

- [ ] **Step 2: Write frontend engineering analysis**

Cover shared dialog/page-state/field/metric/table/source-badge primitives, duplicate patterns, local snapshot boundaries, pure detector interfaces, route state, performance at 1k/10k/50k transactions, client-side brokerage parsing, and cross-language fixture strategy.

- [ ] **Step 3: Write backend architecture analysis**

Classify active, migration-only, reference-only, retired, and reserved surfaces. Define target separation for auth/vault/market/health versus legacy finance and migration adapters. Document schema-authority consolidation and conditions for retiring backend planning or plaintext routers.

- [ ] **Step 4: Write testing and quality analysis**

Specify unit, invariant, accessibility, journey, responsive, privacy-boundary, migration-matrix, performance, production-build, Docker, and documentation-drift coverage. Define fast, security, finance, and full verification tiers.

- [ ] **Step 5: Write delivery and operations analysis**

Cover deterministic installs, static checks, CI concurrency, path filtering, image tagging, copied-database migration preflight, backup integrity, rollback, restore drills, health checks, and controlled production promotion.

- [ ] **Step 6: Write innovation domain analysis**

Define interfaces and boundaries for `LocalFinancialSnapshot`, deterministic `FinancialSignal`, detector versioning, encrypted feedback, net-worth snapshots, decision actions, planning sensitivity, Stock Lab evidence, and client-side Fidelity reconciliation. Include measurable experiment gates before broad rollout.

- [ ] **Step 7: Validate domain traceability**

Verify every recommendation references canonical IDs and every deletion condition cites migration or compatibility findings. Verify innovation documents never propose transmitting merchant names, amounts, shares, account details, scenario values, or insight evidence.

- [ ] **Step 8: Commit engineering domain reports**

```bash
git add docs/grader/analytics/domains/privacy-security.md docs/grader/analytics/domains/frontend-engineering.md docs/grader/analytics/domains/backend-architecture.md docs/grader/analytics/domains/testing-quality.md docs/grader/analytics/domains/delivery-operations.md docs/grader/analytics/domains/innovation.md
git commit -m "docs: analyze engineering and innovation domains"
```

---

### Task 7: Create the Reusable Rubric and Review Template

**Files:**
- Create: `docs/grader/analytics/scorecards/rubric.md`
- Create: `docs/grader/analytics/scorecards/review-template.md`

**Interfaces:**
- Consumes: methodology weights, maturity bands, blocker caps, finding schema, and baseline lessons.
- Produces: a blank repeatable process that does not depend on the current score.

- [ ] **Step 1: Write domain-specific rubric anchors**

For each of the twelve weighted domains, define observable criteria for Fragile, Foundational, Operational, Refined, and Exemplary. Include examples of qualifying evidence and disqualifying blockers. Keep anchors behavioral and verifiable rather than aesthetic preference statements.

- [ ] **Step 2: Write the blank review template**

Include revision/date, scope, static/runtime methods, score table, blocker table, confidence table, strengths, findings by stable ID, perspective summaries, roadmap delta, unresolved evidence, and approval record. Use instructional comments that tell reviewers what evidence belongs in each section without including current repository scores.

- [ ] **Step 3: Add a regrading checklist**

Require revision capture, static/runtime evidence refresh, stable-ID preservation, new-finding registration, resolution evidence, blocker application, arithmetic verification, perspective refresh, roadmap refresh, and score-delta publication.

- [ ] **Step 4: Validate rubric completeness**

Run:

```bash
rg -c '^## (Product and financial correctness|Privacy, security, and trust|Accessibility and inclusive interaction|Core workflow usability|Information architecture and comprehension|Responsive and Apple-platform adaptation|Visual system and interface consistency|Frontend engineering quality|Backend and data architecture|Testing and operational reliability|Simplicity and cruft control|Innovation and differentiated value)$' docs/grader/analytics/scorecards/rubric.md
```

Expected: `12`.

- [ ] **Step 5: Commit reusable scorecards**

```bash
git add docs/grader/analytics/scorecards
git commit -m "docs: add reusable repository grading scorecards"
```

---

### Task 8: Build the Exhaustive Master Roadmap

**Files:**
- Create: `docs/grader/analytics/roadmap/master-plan.md`

**Interfaces:**
- Consumes: every open non-`Preserve` ledger finding and domain target state.
- Produces: one actionable remediation entry for every issue, ordered by dependency rather than workforce availability.

- [ ] **Step 1: Create roadmap metadata and coverage index**

Record source revision, finding count, actionable count, excluded preserve-only count, wave definitions, and a table mapping every actionable ID to one roadmap task.

- [ ] **Step 2: Write Wave 1 tasks**

Create implementation tasks for financial-semantic tests, planning input provenance, transaction-derived baseline correction, observed/scheduled cashflow separation, recurring reconciliation, partial-total scope, documentation/runtime alignment, and source-confidence presentation.

Each roadmap task must include exact affected files, prerequisite IDs, preserved invariants, implementation steps, tests, acceptance criteria, and expected observable result.

- [ ] **Step 3: Write Wave 2 tasks**

Cover shared dialogs/sheets, focus lifecycle, nav semantics and names, sortable headers, chart alternatives, unique IDs, field errors, live status, touch targets, route focus, calendar semantics, zoom/reflow, and contrast verification.

- [ ] **Step 4: Write Wave 3 tasks**

Cover dependency removal verification, orphan/superseded artifact cleanup, legacy/API classification, compatibility isolation, `main.py` test decoupling, requirements consolidation, schema authority, shared fixtures, and duplicated frontend primitive consolidation.

- [ ] **Step 5: Write Wave 4 tasks**

Cover unified onboarding, recovery-key save/verify, account/vault language, import registry-driven copy, import error recovery, preview summaries, full-data transaction totals, search/filter URL state, calendar deep links, freshness/completeness, planning units, and progressive disclosure.

- [ ] **Step 6: Write Wave 5 tasks**

Cover adaptive navigation, iPhone list cells, iPad split view, macOS sidebar and table behavior, page-specific widths, appearance modes, contrast/transparency, system font removal, manifest/touch icons, safe areas, and locale-aware formatting.

- [ ] **Step 7: Write Wave 6 tasks**

Cover local snapshots, data quality, stale-balance and outlier detectors, recurring-price changes, duplicate detection, cash-sweep overlap, encrypted signal feedback, observed snapshots and attribution, decision cockpit, sensitivity analysis, Stock Lab evidence, and client-side brokerage import.

- [ ] **Step 8: Write Wave 7 tasks**

Cover verification tiers, axe/journey/responsive tests, performance fixtures, migration matrix, static analysis, dependency audits, doc drift, production build, E2E Compose smoke, copied-DB migration preflight, image rollback, backup integrity, and restore drills.

- [ ] **Step 9: Write Wave 8 tasks**

Cover every remaining low and polish finding, including copy, capitalization, headings, empty-state actions, source labels, stale terminology, inline styles, table scopes, destructive styling, account success announcements, and minor layout consistency.

- [ ] **Step 10: Verify exhaustive finding coverage**

Create a sorted list of all open non-preserve ledger IDs and a sorted list of all roadmap IDs. Compare them. Expected: no actionable ID missing from the roadmap and no roadmap ID absent from the ledger.

- [ ] **Step 11: Commit the master roadmap**

```bash
git add docs/grader/analytics/roadmap/master-plan.md
git commit -m "docs: add exhaustive repository remediation roadmap"
```

---

### Task 9: Build Dependency and Acceptance Maps

**Files:**
- Create: `docs/grader/analytics/roadmap/dependency-map.md`
- Create: `docs/grader/analytics/roadmap/acceptance-criteria.md`

**Interfaces:**
- Consumes: roadmap task IDs, finding dependencies, domain acceptance requirements.
- Produces: safe parallel workstreams, hard gates, and consolidated completion criteria.

- [ ] **Step 1: Define hard dependency gates**

Document at least these gates:

- Baseline invariant tests before financial behavior changes.
- Correct source semantics before planning intelligence.
- Shared accessible primitives before page-by-page modal migration.
- Active/legacy classification before compatibility movement.
- Migration fixture matrix before compatibility deletion or schema consolidation.
- Local snapshot and privacy tests before signal detectors.
- Observed snapshots before change attribution.
- Detector evidence before decision ranking.
- Production images and copied-DB preflight before automated rollback.

- [ ] **Step 2: Define unlimited-workforce parallel tracks**

Create tracks for correctness, accessibility primitives, workflow UX, adaptive platform UI, compatibility architecture, test infrastructure, delivery operations, local intelligence, documentation, and polish. For each track, list start conditions, blocked tasks, integration points, and final gate.

- [ ] **Step 3: Add a Mermaid dependency graph**

Represent waves and major gates with acyclic edges. Keep node labels mapped to roadmap headings and stable finding groups. Verify no innovation node bypasses privacy or correctness gates.

- [ ] **Step 4: Consolidate acceptance criteria**

Organize `acceptance-criteria.md` by financial semantics, privacy/security, accessibility, responsive platforms, core journeys, architecture/deletion, innovation, tests, performance, deployment, and documentation. Every criterion must be measurable and link to roadmap or ledger IDs.

- [ ] **Step 5: Add required test matrices**

Include exact viewport targets, keyboard/dialog behaviors, chart alternatives, 200%/400% zoom, reduced motion/transparency, finance invariant formulas, privacy network/storage assertions, migration generations, 1k/10k/50k transaction performance, production build, Docker smoke, backup verification, and restore drill.

- [ ] **Step 6: Commit dependency and acceptance maps**

```bash
git add docs/grader/analytics/roadmap/dependency-map.md docs/grader/analytics/roadmap/acceptance-criteria.md
git commit -m "docs: map grader dependencies and acceptance gates"
```

---

### Task 10: Validate and Publish the Complete Grading Package

**Files:**
- Modify: `docs/grader/analytics/README.md`
- Modify if validation exposes errors: any file under `docs/grader/analytics/`

**Interfaces:**
- Consumes: all grader artifacts.
- Produces: a self-consistent, navigable, reproducible package ready for implementation execution and future regrading.

- [ ] **Step 1: Refresh the README artifact index**

Link every created file and add a concise description. Mark the ledger as canonical, the baseline as revision-specific, and reports/roadmap as derived.

- [ ] **Step 2: Scan for placeholders and vague implementation language**

Run:

```bash
rg -n "TBD|TODO|FIXME|PLACEHOLDER|implement later|appropriate error handling|handle edge cases|write tests for" docs/grader/analytics
```

Expected: no output. Rewrite every match with a concrete requirement.

- [ ] **Step 3: Verify Markdown hygiene**

Run:

```bash
git diff --check -- docs/grader/analytics
```

Expected: exit code 0 and no output.

- [ ] **Step 4: Verify artifact count**

Run:

```bash
test "$(git ls-files --others --cached --exclude-standard 'docs/grader/analytics/*.md' 'docs/grader/analytics/**/*.md' | sort -u | wc -l)" -ge 21
```

Expected: exit code 0. The package contains the four root files, four perspective files, eleven domain files, two scorecard files, and three roadmap files.

- [ ] **Step 5: Verify ID uniqueness and traceability**

Confirm ledger IDs are unique. Confirm every stable ID used outside the ledger exists in the ledger. Confirm every open non-preserve ID appears in `roadmap/master-plan.md`. Confirm every score deduction references a ledger ID.

- [ ] **Step 6: Verify score arithmetic and package links**

Recalculate all domain scores and the total. Open every relative Markdown link from `README.md` and confirm the target exists. Correct stale anchors or filenames.

- [ ] **Step 7: Verify repository references**

Check every cited path exists and spot-check every cited line range. Downgrade claims to `Runtime verification required` where source inspection cannot prove behavior.

- [ ] **Step 8: Review against the approved design**

Read `docs/superpowers/specs/2026-07-11-repository-grader-analytics-design.md` section by section. Confirm the package implements directory structure, finding schema, classifications, scoring, maturity, blocker caps, perspectives, roadmap waves, conflict rules, evidence standards, ambiguity handling, verification requirements, and regrading workflow.

- [ ] **Step 9: Run application verification only if implementation touched application files**

This plan must not touch application code. If an accidental application change exists, stop and remove only that accidental change. If the scope is intentionally expanded later, run:

```bash
make test-backend
npm --prefix frontend run build -- --configuration development
```

Expected: backend tests pass and Angular development build succeeds.

- [ ] **Step 10: Inspect final Git scope**

Run:

```bash
git status --short
git diff --stat
```

Expected: only approved grader/spec/plan documentation is changed by this work. Leave the pre-existing untracked `.superpowers/` directory untouched.

- [ ] **Step 11: Commit final validation fixes**

```bash
git add docs/grader/analytics docs/superpowers/specs/2026-07-11-repository-grader-analytics-design.md docs/superpowers/plans/2026-07-11-repository-grader-analytics.md
git commit -m "docs: complete reusable repository grader"
```

## Completion Criteria

The implementation is complete only when:

- All 21 grader files exist and are linked from `README.md`.
- The ledger is the sole canonical factual registry.
- Stable IDs are unique and all derived references resolve.
- The baseline sums to exactly 100 available points and its earned total is reproducible.
- Every score deduction has canonical evidence.
- All four requested perspectives provide complete, distinct interpretations.
- Every domain report defines a target state and acceptance criteria.
- Every open actionable finding appears exactly once in the roadmap coverage index.
- Dependencies and unlimited-workforce parallel tracks are explicit.
- Deletion candidates include migration and compatibility safeguards.
- Innovation proposals include privacy boundaries, explainability, failure modes, and measurable experiment gates.
- Placeholder, Markdown-hygiene, link, path, and traceability checks pass.
- No application code or pre-existing unrelated worktree content is modified.
