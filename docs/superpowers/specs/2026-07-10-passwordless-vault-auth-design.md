# Passwordless Vault Authentication Design

## Goal

Use one user-entered secret for both account access and vault unlock. A username
identifies the account; the vault passphrase unlocks a browser-held private
authentication key that proves account ownership without reaching the server.

## Authentication Protocol

First-user setup and subsequent account enrollment generate a random asymmetric
authentication keypair in the browser. The server stores the public key. The
private key is encrypted with a passphrase-derived wrapping key alongside the
vault DEK wrap and recovery wrap.

Login proceeds as follows:

1. The browser submits a normalized username.
2. The server returns public vault KDF metadata, encrypted key wraps, and no
   finance records.
3. The browser derives the wrapping key from the vault passphrase and unwraps
   the private authentication key and vault DEK locally.
4. The browser requests an account-bound, random, short-lived, single-use
   challenge.
5. The browser signs the challenge and submits the signature.
6. The server verifies the signature with the stored public key, consumes the
   challenge, and issues the existing HttpOnly session and CSRF cookies.
7. The browser loads encrypted finance records only after session creation.

Failed unwraps remain local. Invalid signatures return a generic authentication
failure. Challenge lookup and verification do not reveal whether a username is
active beyond what is required to return public bootstrap material.

## Key Recovery And Rotation

The recovery key can unwrap the vault DEK and authentication private key. A
successful recovery lets the browser choose a new vault passphrase and replace
both passphrase wraps without changing finance ciphertext.

Authentication key rotation generates a new keypair in the browser, uploads the
new public key and encrypted private-key wraps in one authenticated operation,
then revokes all other sessions. Admins cannot reset vault access or generate an
authentication key for a user.

## Existing-User Migration

Password authentication remains available only through a bounded migration
endpoint while an existing account has no authentication public key. After a
password-authenticated session unlocks the vault, the browser creates and wraps
the authentication keypair and registers the public key. The backend then
clears the password hash and marks passwordless migration complete.

Accounts with a registered authentication public key cannot use password login.
After all supported accounts migrate, password login, password reset/change,
temporary-password flags, and corresponding admin/frontend controls are
removed. The migration is idempotent and never requires the backend to receive
the vault passphrase, DEK, recovery key, or private authentication key.

## Account And Admin Model

Usernames are unique account identifiers. Existing email addresses may be
migrated into usernames, but email is not an authentication factor. Multi-user
ownership, admin/user roles, account disabling, account deletion, audit events,
session expiry, CSRF protection, and final-admin safeguards remain.

Admins may create an invitation/enrollment record with username, display name,
and role. The user completes enrollment in the browser by choosing a vault
passphrase and receiving a recovery key. Admins cannot recover, reset, or unlock
another user's vault.

## Security Requirements

- Use a WebCrypto signing algorithm supported by target browsers and FastAPI's
  verification library; store versioned algorithm and public-key metadata.
- Bind signatures to protocol version, challenge ID, username/account ID,
  origin context, and expiry to prevent replay or cross-account use.
- Store only a hash of each challenge token; consume it transactionally before
  creating the session.
- Rate-limit bootstrap lookup, challenge issuance, signature verification, and
  legacy migration login.
- Never place vault passphrases, private keys, DEKs, recovery keys, ciphertext,
  or signatures in logs or audit metadata.
- Keep finance APIs session-authenticated and mutation requests CSRF-protected.

## Interaction With Systemic Repairs

The passwordless migration must coordinate with authenticated-record AAD and
legacy plaintext cleanup. Existing schema-version-1 ciphertext is decrypted
with its legacy format only after successful account authentication, then
rewritten as a new authenticated record version in the browser. Legacy
plaintext rows are removed only after encrypted replacement verification.

Global portfolio refresh may disclose ticker symbols to the backend market
service after authentication. Shares, values, cost bases, account details, and
all other finance fields remain encrypted.

## Verification

Tests cover first setup, new-browser login, wrong passphrase, replayed/expired
challenge, cross-account signature, disabled account, recovery re-wrap,
authentication-key rotation, existing-user migration, password endpoint
retirement, session/CSRF behavior, and absence of finance plaintext before
authentication and vault unlock.
