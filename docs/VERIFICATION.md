# Verification tiers

Named quality gates for local development and CI (TEST-001).

| Tier | Command | Covers | Owner |
|------|---------|--------|-------|
| **fast** | `make test-fast` | Doc path/lifecycle checks (OPS-002) | docs |
| **finance** | `make test-finance` | Balance sheet, planning non-mutation, client-finance, migrations matrix | finance |
| **security** | `make test-security` | Vault/openapi/auth + client-finance and evidence-labels specs | privacy |
| **full** | `make test-full` | Backend + frontend unit tests + frontend build + Docker compose build | release |

## Migration matrix (BE-002)

Supported DB generations and fixtures: [LIFECYCLE.md](./LIFECYCLE.md) and the
migration fixture tests in `apps/finance/backend/tests/test_migrations.py`
(`test_alembic_upgrade_head_on_legacy_holdings_sqlite`,
`test_passwordless_migration_recovers_partial_sqlite_state`,
`test_password_hash_migration_allows_passwordless_users`).

## Backup and restore (OPS-001)

1. Backup: `./scripts/backup-db.sh` (also used on deploy).
2. Integrity: `./scripts/verify-backup.sh data/backups/finance.db.<timestamp>.bak`
3. Restore drill (staging): stop stack → copy backup over data file → start → `curl` health → record date in ops notes.
4. Details: [BACKUP.md](./BACKUP.md), [DEPLOY.md](./DEPLOY.md).

## Privacy gate for local intelligence (SEC-001)

See [SECURITY_MODEL.md](./SECURITY_MODEL.md) § Local intelligence privacy gate.
No local signal/detector code currently ships; any future client-side analytics
must stay network-zero and non-mutating. `test-security` covers the
client-finance (`client-finance.spec.ts`) and evidence-labels
(`evidence-labels.util.spec.ts`) specs.

## Planning / Stock Lab evidence (INNO-003)

Shared fact / inference / scenario cards in `apps/finance/frontend/src/app/utils/evidence-labels.util.ts`.
Speculative surfaces must not mutate holdings or net worth; Stock Lab discloses tickers only.

## CI mapping

`.github/workflows/ci.yml` runs backend pytest, frontend unit tests + build, and
`docker compose build`. Local `make test-full` mirrors that set plus `test-fast`.
