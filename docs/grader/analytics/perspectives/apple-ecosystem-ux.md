# Apple Ecosystem UX Review

Derived from the [ledger](../evidence-ledger.md) and [baseline](../baseline-scorecard.md).

## Assessment

The application has a strong dark operational surface, safe-area and reduced-motion foundations (`STR-004`), but its adaptive behavior should become deliberate rather than merely responsive. Do not recommend a native rewrite: the browser vault boundary is an asset.

## Priorities

- Repair modal focus, names, restoration, and sheet behavior through `A11Y-001`.
- Replace routed tab semantics with accessible navigation and route focus through `A11Y-002`.
- Provide table/list-cell and chart alternatives with `A11Y-003` and `PLAT-001`.
- Make provenance and financial freshness as legible as the visual hierarchy through `COR-003`, `IA-001`, and `VIS-001`.
- Validate appearance, contrast, reduced transparency, locale, system typography, Safari metadata, and installability under `PLAT-002`.

## Platform Target

macOS retains sidebar navigation and dense sortable tables. iPad supports a persistent or collapsible split view. iPhone uses labeled navigation and transaction/portfolio list cells with drill-in detail. All targets honor safe areas, coarse-pointer targets, keyboard, VoiceOver, reduced motion, and reduced transparency. No installability mechanism may cache finance plaintext.

## Convergence And Tradeoff

Apple and Google converge on `A11Y-001` through `PLAT-002`. Apple’s dense-table preference is resolved by `PLAT-001`: retain density on macOS while using equivalent list cells on smaller screens. Financial correctness (`COR-001`, `COR-002`) and privacy (`STR-002`, `SEC-001`) override visual convenience.

## Acceptance

Ship only after the viewport matrix in [responsive platforms](../domains/responsive-platforms.md) and the accessibility matrix in [accessibility](../domains/accessibility.md) pass.
