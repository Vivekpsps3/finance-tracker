# Methodology

## Evidence Rules

Static claims cite current paths and line ranges. Runtime-dependent behavior is marked `Runtime verification required`; historical plans are context rather than proof. Finance plaintext, passphrases, recovery keys, private keys, and private insight evidence must remain browser-owned. Ticker disclosure is allowed only for explicit refresh or research. Migration compatibility, Alembic history, source tables, and schema-v1 support outrank deletion convenience. Missing aspirational features are not defects unless promised by product surfaces or contracts.

## Finding Schema

Every ledger entry follows this field order: classification, severity, confidence, perspectives, domains, affected journeys, affected platforms, evidence, finding, impact, preserve, recommendation, dependencies, acceptance criteria, verification, status. IDs are permanent and use `STR`, `COR`, `SEC`, `A11Y`, `UX`, `IA`, `PLAT`, `VIS`, `FE`, `BE`, `TEST`, `CRUFT`, `INNO`, `OPS`, or `DOC`.

Classifications are `Preserve`, `Repair`, `Simplify`, `Delete`, `Redesign`, `Automate`, and `Experiment`. Severities are `Blocker`, `Critical`, `High`, `Medium`, `Low`, and `Polish`. Confidence is `Confirmed`, `Strongly indicated`, or `Runtime verification required`.

## Scoring

Domain achievement is an integer from zero through its weight; the total is their sum. Maturity is 0-39% Fragile, 40-59% Foundational, 60-74% Operational, 75-89% Refined, and 90-100% Exemplary.

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
| Total | 100 |

Apply caps after raw scoring: materially misleading financial totals cap correctness below Operational; inaccessible primary actions or broken core-dialog focus cap accessibility below Operational; finance plaintext or secret leakage sets privacy/security to zero; planning mutation of observed records sets correctness to zero. Missing tests lower confidence, not achievement by themselves.

## Lifecycle And Conflicts

Statuses are Open, Verified, Resolved, or Rejected. A score can improve only after ledger resolution evidence and its verification are recorded. Duplicate observations merge under one ID. Derived reports may reprioritize but cannot alter ledger facts. Financial correctness overrides visual elegance; privacy and server-blind constraints override convenience; accessibility is release-critical; deletion requires migration proof; innovation must be explainable and non-mutating. Conflicts remain Open with a verification task until the higher-order rule resolves them.

## Regrading

Record revision and date; refresh evidence; retain IDs; add findings; attach resolution evidence; recalculate achievement and caps; refresh reports, roadmap, and dependency map; then publish a delta tied to IDs.
