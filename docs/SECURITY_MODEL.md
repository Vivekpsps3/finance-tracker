# Security model

This app uses server-blind user data storage for finance data: the browser owns
finance plaintext, and the backend owns only ciphertext, auth, sync metadata,
and account administration.

## Goal

Protect user finance data from database readers, backups, admin tooling, and
normal backend/server operators. Admins should be able to manage accounts,
disable access, reset login passwords, and delete data, but they should not be
able to decrypt user finance records.

## Non-goals

- Protect against a fully malicious server that serves modified JavaScript to
  capture vault passphrases.
- Protect against a compromised browser, extension, or endpoint after the user
  unlocks their vault.
- Make admins able to recover user finance data after vault secrets are lost.

If malicious frontend delivery is in scope, the app needs a trusted client
distribution model such as a signed static bundle, native wrapper, or local app.
A normal web deployment can still make the database and backend server-blind, but
the operator controls the code delivered to browsers.

## Required architecture

1. Browser generates a random per-user data encryption key.
2. Browser wraps that key with a vault passphrase-derived key.
3. Browser also wraps that key with a user-held recovery key.
4. Vault passphrases, recovery keys, and unwrapped data keys never reach the backend.
5. Browser encrypts finance records before upload and decrypts them after download.
6. Backend stores ciphertext, non-sensitive sync metadata, and optional blind indexes only.
7. Backend never computes net worth, cashflow, planning snapshots, search, sort, or imports over private plaintext for migrated users.

## Plaintext allowed on the backend

- User account identity and role data in `users`.
- Sessions, CSRF token hashes, and account audit events.
- Global provider registries such as banks and brokerages.
- Public market quote cache, subject to the holdings privacy decision below.
- Encrypted record metadata: owner user ID, collection name, client record ID, schema version, key version, timestamps, and sync revision.

## Plaintext not allowed on the backend

- Transaction amounts, dates, categories, descriptions, account masks, import filenames if sensitive, and dedupe source material.
- Asset and liability names, amounts, dates, and notes.
- Job income, fixed expense, subscription, and payment-account details.
- Holdings symbols, shares, purchase prices, brokerage account masks, and nicknames unless the holdings quote decision explicitly accepts symbol leakage.
- Planning profiles, assumptions, generated input snapshots, and run artifacts.
- Tax document vault data. Tax document storage has been removed and should not be reintroduced without a new product/security decision.

## Recovery rules

- Login password reset is separate from vault recovery.
- Admin password reset must not change encrypted vault material.
- A user can recover by providing their recovery key in the browser and setting a new vault passphrase.
- If a user loses both vault passphrase and recovery key, admins can only delete the encrypted data and let the user start over.

## Holdings price privacy

Automated server-side quote lookup conflicts with encrypted holdings if symbols
are private. Current vault-mode portfolio refresh uses manual/imported prices and
does not batch-send holdings symbols to the backend. Explicit one-off quote
lookup still discloses the typed symbol to the public market quote endpoint.
Stock Lab is an explicit ticker-disclosure feature: when the user opens or refreshes Stock Lab, typed symbols and selected owned symbols may be sent to `/api/market/research/*` and yfinance. Saved scenario inputs remain encrypted; backend market cache must store only public symbol-level data.

Longer-term choices if stricter holdings privacy is required:

1. Encrypt symbols and use manual/current imported prices.
2. Disclose symbols to the backend for quote lookup with explicit UI disclosure.
3. Fetch quotes directly from the browser, accepting third-party/API-key tradeoffs.
4. Serve broad public quote datasets so the browser can look up symbols locally.

Do not claim holdings are server-blind if the backend receives per-user quote
requests for owned symbols.

## Admin tooling

Raw SQL and metrics that expose finance details are incompatible with
server-blind storage. Admin tooling should be limited to counts, table health,
schema/migration state, account management, session revocation, and destructive
data reset.

## Verification expectations

- API responses before vault unlock contain no finance plaintext.
- Logs contain no finance plaintext.
- Admin UI contains no finance plaintext.
- SQLite database bytes contain no known finance plaintext after migration, cleanup, WAL checkpoint, and `VACUUM`.
- Wrong-user record access is rejected server-side even though payloads are encrypted.
- Tampered ciphertext or associated data fails to decrypt in the browser.
