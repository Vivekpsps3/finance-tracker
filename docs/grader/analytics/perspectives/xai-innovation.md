# xAI Innovation Review

Derived from the [ledger](../evidence-ledger.md) and [baseline](../baseline-scorecard.md).

## Assessment

The differentiated asset is not a generic chatbot. It is browser-local, explainable financial instrumentation built on ciphertext-only storage (`STR-002`), user-held access (`STR-003`), deterministic planning, and explicit ticker disclosure boundaries.

## Ranked Bets

1. `INNO-001`: a pure local signal engine for stale values, outliers, duplicates, recurring changes, and cash-sweep overlap.
2. `INNO-002`: encrypted observed net-worth history and conservative attribution.
3. `INNO-003`: evidence-weighted planning and Stock Lab sensitivity with fact, inference, and scenario labels.

## Local Architecture

Decrypt into an in-memory `LocalFinancialSnapshot`; pass it to versioned deterministic detectors that emit `FinancialSignal` objects containing evidence references, confidence, and reversible recommended actions. Persist only encrypted user feedback. The server receives no merchant, amount, share, account, scenario, or signal-evidence plaintext. Explicit ticker research remains the documented exception.

## Threat And Failure Analysis

`SEC-001` gates all bets: inspect network, URL, storage, logs, service-worker caches, and browser memory lifecycle. `COR-001` and `COR-002` prevent signals from treating scheduled or scenario data as observed facts. False positives must be dismissible; unknown attribution stays unknown; no signal mutates financial records.

## Success Criteria

Each experiment has synthetic precision/recall fixtures, network-zero assertions, an explanation card, opt-in encrypted feedback, and a measurable reduction in unresolved data-quality questions. See [innovation](../domains/innovation.md).
