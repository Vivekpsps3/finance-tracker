# Migration to server-blind encryption

This is the implementation sequence for moving finance data to browser-owned
plaintext and backend-owned ciphertext.

## 1. Reduce sensitive surface

- Tax document storage has been removed.
- Keep payroll tax withholding fields because they are recurring cashflow data, not document vault storage.
- Keep planning tax drag assumptions because they are speculative inputs, not tax document storage.

## 2. Remove backend read paths

Before encrypted finance data becomes the default, remove or severely constrain
admin raw SQL. Admins should see account status, counts, and maintenance health,
not finance detail.

## 3. Add ciphertext storage

Create additive tables rather than mutating every existing finance table in place:

| Table | Purpose |
|-------|---------|
| `user_vaults` | Per-user vault metadata, wrapped data key, recovery wrap, KDF parameters |
| `encrypted_records` | Encrypted domain records by collection |
| `encrypted_record_indexes` | Optional HMAC blind indexes for exact duplicate/equality checks |
| `user_crypto_migrations` | Per-user migration status and cleanup state |

The backend validates ownership, collection names, sizes, revisions, and blind
index uniqueness. It never sees decrypted payloads.

## 4. Build browser vault

1. Setup screen creates a random data encryption key.
2. Browser wraps the key with a passphrase-derived key.
3. Browser creates and displays a recovery key.
4. Unlock screen unwraps the data key locally.
5. Unlocked keys live in memory only.
6. Logout, manual lock, and idle lock clear decrypted state.
7. Domain repositories encrypt/decrypt records for `FinanceService`.

## 5. Move calculations client-side

For migrated users, the backend cannot compute over private data. Move these to
frontend utilities:

- Net worth.
- Portfolio value and account breakdown.
- Transaction search, sort, and category rename.
- Cashflow summaries and recurring occurrence generation.
- Planning input snapshots and Monte Carlo runs, unless the user explicitly opts into sending aggregate inputs to the backend.
- Bank CSV import preview/commit.

## 6. Use blind indexes sparingly

Use HMAC blind indexes for exact-match needs such as transaction import dedupe.
Blind indexes leak equality patterns but not source values. They are not suitable
for substring search or range queries.

## 7. Migrate existing plaintext users

Migration must happen in the browser because the backend should not be trusted to
perform encryption with plaintext.

1. User logs in through existing auth.
2. User creates or unlocks a vault.
3. Browser fetches legacy plaintext records through current APIs.
4. Browser converts each row to encrypted domain records.
5. Browser uploads encrypted batches.
6. Browser downloads and decrypts uploaded ciphertext for verification.
7. Browser compares counts and totals against the legacy source data.
8. Backend marks the user migrated.
9. Backend disables legacy plaintext finance endpoints for that user.
10. Backend deletes that user's legacy plaintext rows.
11. Backend checkpoints WAL and vacuums during maintenance.

Old backups remain a risk. Users must rotate or destroy pre-migration backups if
they contained plaintext data.

## 8. Drop legacy tables

After every active user is migrated and plaintext cleanup is verified, add a
final migration that drops legacy finance tables/columns replaced by encrypted
records. Until then, legacy and encrypted storage may coexist behind a migration
status gate.

## Acceptance criteria

- A database dump reveals no finance plaintext for migrated users.
- Admin UI and APIs reveal no finance plaintext.
- Backend has no decrypt function, no vault passphrase, and no unwrapped user key.
- Password reset does not recover vault data.
- User recovery works only with the user's recovery key.
- Existing finance calculations match pre-encryption behavior after browser unlock and migration verification.
