# Baseline Scorecard

**Review date:** 2026-07-11. **Revision:** `9f83de2`. **Earned:** **58/100**. **Overall maturity:** Foundational. This is a current evidence-backed baseline, not a prediction of product potential. Confidence is moderate: static evidence is strong; runtime accessibility, overlap, and operations checks remain open.

| Domain | Available | Earned | Achievement | Maturity | Confidence | Cap | Strengths | Deductions |
|---|---:|---:|---:|---|---|---|---|---|
| Product and financial correctness | 15 | 9 | 60% | Operational | Moderate | Below Operational if material total misleads | STR-001 | COR-001, COR-002, COR-003, DOC-001 |
| Privacy, security, and trust | 15 | 12 | 80% | Refined | Moderate | 0 on leakage | STR-002, STR-003 | SEC-001 |
| Accessibility and inclusive interaction | 12 | 5 | 42% | Foundational | Moderate | Below Operational for core dialog/action failure | STR-004 | A11Y-001, A11Y-002, A11Y-003 |
| Core workflow usability | 12 | 7 | 58% | Foundational | Moderate | None | STR-004 | UX-001, UX-002, UX-003, COR-002 |
| Information architecture and comprehension | 8 | 5 | 63% | Operational | Moderate | None | STR-001 | IA-001, UX-003, COR-003 |
| Responsive and Apple-platform adaptation | 8 | 4 | 50% | Foundational | Moderate | None | STR-004 | PLAT-001, PLAT-002 |
| Visual system and interface consistency | 6 | 4 | 67% | Operational | Moderate | None | STR-004 | VIS-001, PLAT-002 |
| Frontend engineering quality | 6 | 3 | 50% | Foundational | Moderate | None | STR-004 | FE-001, UX-002 |
| Backend and data architecture | 6 | 3 | 50% | Foundational | High | None | STR-002, STR-003 | BE-001, BE-002 |
| Testing and operational reliability | 6 | 3 | 50% | Foundational | Moderate | None | STR-003 | TEST-001, BE-002, OPS-001 |
| Simplicity and cruft control | 3 | 1 | 33% | Fragile | Low | None | None | CRUFT-001, BE-001 |
| Innovation and differentiated value | 3 | 2 | 67% | Operational | Moderate | None | STR-002 | INNO-001, INNO-002, INNO-003 |
| Total | 100 | 58 | 58% | Foundational | Moderate | See blocking findings | STR-001 to STR-004 | Ledger IDs above |

## Blocking Findings

- `A11Y-001` may cap accessibility below Operational until keyboard focus lifecycle is verified and repaired.
- `COR-002` may cap correctness below Operational if seeded overlap proves a materially misleading aggregate.
- `SEC-001` defines the zero-score privacy cap if a future analytics feature sends finance plaintext or secrets.

## Improvement Rules

The next maturity level requires: correctness `COR-001`, `COR-002`, `DOC-001`; privacy `SEC-001`; accessibility `A11Y-001`, `A11Y-002`, `A11Y-003`; workflow `UX-001`, `UX-002`; information architecture `IA-001`; platforms `PLAT-001`; visual system `VIS-001`; frontend `FE-001`; backend `BE-001`, `BE-002`; reliability `TEST-001`, `OPS-001`; simplicity `CRUFT-001`; innovation requires verified, privacy-safe experiment evidence for `INNO-001` through `INNO-003`. Closed findings require linked ledger resolution evidence and verification.
