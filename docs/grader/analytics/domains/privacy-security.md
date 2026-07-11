# Privacy, Security, And Trust

## Current Findings

`STR-002` and `STR-003` are critical protections. `SEC-001` requires a reusable gate for new intelligence.

## Target State

Finance plaintext, vault passphrases, recovery keys, private keys, accounts, amounts, shares, scenario values, and insight evidence remain browser-owned. Explicit portfolio refresh and Stock Lab research disclose ticker symbols only. New features document metadata, blind-index, log, URL, cache, malicious-delivery, browser-memory, and admin-limit implications.

## Acceptance Criteria

`SEC-001` feature contracts enumerate sent fields, request tests reject private data, service workers never cache plaintext, and admin functions cannot expose vault payloads. Migration cleanup verifies encrypted replacement before deletion.

## Verification

Inspect network, storage, URLs, logs, cache, and local memory lifecycle for every analytics capability.
