# Systemic Repairs And Portfolio Refresh Design

## Scope

Deliver one coordinated repair set for the confirmed systemic findings and add a
global Portfolio price refresh. The work preserves the financial data-plane
invariants: transactions and recurring cashflow never alter net worth, and
planning remains speculative.

## Ticker Disclosure And Global Refresh

The Portfolio header exposes a global refresh action after vault unlock. It
sends normalized holding ticker symbols, and only ticker symbols, to the
backend market quote service. The browser applies returned public prices to
encrypted holding records. Shares, values, cost bases, account details, and all
other finance fields remain encrypted.

The action and documentation explicitly disclose this limited ticker exposure.
Price refresh is unavailable for invalid or non-ticker symbols and reports
per-symbol failures without changing their existing prices.

## Vault Integrity And Migration

AES-GCM records authenticate stable metadata as associated data: collection,
client ID, schema version, and key version. A changed record identity therefore
fails decryption. Existing vault records are migrated client-side by reading and
rewriting them with authenticated metadata; no server plaintext is introduced.

Vault setup does not mark an account migrated if legacy finance rows remain.
The client migration uploads encrypted records, verifies the expected records,
then the backend removes legacy rows and records completed migration state.

Vault delete requests include an expected revision and return a conflict on a
stale delete. Ciphertext and blind indexes use strict, nonempty base64
validation.

## Auth And Service Reliability

Login, signup, and bootstrap receive bounded request limits. Accounts marked
`must_change_password` may only use the password-change, session, and identity
paths until a new password is set.

Planning honors seed zero, calculates averages over the full analysis window,
and returns promptly on timeout. Market-research cache writes handle concurrent
cold misses without surfacing database uniqueness errors.

## Encrypted Finance Behavior

Fidelity import and category operations run wholly in the browser for vault
users; no retired plaintext endpoint is invoked. Recurring cashflow honors
active status, dates, frequency, and requested range. Encrypted mutations
invalidate dashboard cached loads.

Encrypted Monte Carlo applies submitted scenario assumptions and reports the
same result shape as the existing view. Dashboard all-time mode uses a matching
cashflow range rather than stale prior-period totals.

## UI Correctness

Admin and login asynchronous updates trigger OnPush rendering. Import-preview
checkboxes update their selected rows. Stock Lab ignores superseded market-data
responses.

## Verification

Every repaired defect receives a focused regression test. The complete delivery
passes backend tests, frontend tests in Chrome Headless, and the Angular
development build before it is committed and pushed to `main`.
