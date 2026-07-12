# Verification tiers

Named quality gates for local development and CI (TEST-001).

| Tier | Command | Covers | Owner |
|------|---------|--------|-------|
| **fast** | `make test-fast` | Doc path/lifecycle checks (OPS-002) | docs |
| **finance** | `make test-finance` | Balance sheet, planning non-mutation, client-finance, migrations matrix | finance |
| **security** | `make test-security` | Vault/410/openapi/auth + pure local signal detectors | privacy |
| **full** | `make test-full` | Backend + frontend unit tests + frontend build + Docker compose build | release |

## Migration matrix (BE-002)

Supported DB generations and fixtures: [LIFECYCLE.md](./LIFECYCLE.md) and
`backend/tests/test_migrations.py` (`SUPPORTED_DB_GENERATIONS`).

## Backup and restore (OPS-001)

1. Backup: `./scripts/backup-db.sh` (also used on deploy).
2. Integrity: `./scripts/verify-backup.sh data/backups/finance.db.<timestamp>.bak`
3. Restore drill (staging): stop stack → copy backup over data file → start → `curl` health → record date in ops notes.
4. Details: [BACKUP.md](./BACKUP.md), [DEPLOY.md](./DEPLOY.md).

## Privacy gate for local intelligence (SEC-001)

See [SECURITY_MODEL.md](./SECURITY_MODEL.md) § Local intelligence privacy gate.
Detectors live under `frontend/src/app/signals/` and must stay network-zero and non-mutating.

## CI mapping

`.github/workflows/ci.yml` runs backend pytest, frontend unit tests + build, and
`docker compose build`. Local `make test-full` mirrors that set plus `test-fast`.
