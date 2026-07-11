# Google Effortless UX Review

Derived from the [ledger](../evidence-ledger.md) and [baseline](../baseline-scorecard.md).

## Journey Assessment

- **First setup and recovery:** clarify passwordless vault ownership and non-resettable recovery (`UX-001`, `STR-003`).
- **Net worth:** show observed inputs, freshness, completeness, and cash-sweep caveats (`COR-003`, `IA-001`).
- **Import and review:** preview accepted/rejected rows, totals, dedupe, and correction routes (`UX-002`).
- **Recurring cashflow:** distinguish observed, scheduled, and combined outlook without double-count ambiguity (`COR-002`).
- **Planning:** make recurring, transaction, and scenario provenance explicit (`COR-001`, `INNO-003`).

## Prioritized Heuristics

Address dialog and navigation semantics first (`A11Y-001`, `A11Y-002`), then chart/table equivalence (`A11Y-003`), deep-linkable state and empty actions (`UX-003`), shared provenance components (`VIS-001`), and adaptive layouts (`PLAT-001`).

## Target Information Architecture

Keep the five intent groups. Use uniform `Observed`, `Scheduled`, and `Combined outlook` badges; link aggregates to inputs; preserve dense professional workflows; expose progressive detail rather than hiding essential finance context.

## Privacy-Safe Metrics

Measure local completion, correction, and dismissed-signal counts only when encrypted and user-controlled. Do not transmit finance content. `SEC-001` is the gate.

## Convergence And Tradeoff

Google and Apple converge on inclusive task completion; xAI’s insight surfaces must remain inspectable, non-mutating, and subordinate to `STR-001` and `STR-002`. See [information architecture](../domains/information-architecture.md).
