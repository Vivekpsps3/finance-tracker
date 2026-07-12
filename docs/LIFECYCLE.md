# Surface Lifecycle Map

Canonical ownership for API routers, schema modules, and schema authorities.
Retirement requires migration proof in `backend/tests/test_migrations.py` and a
green copied-DB upgrade. Do not delete Alembic history or the 410 legacy gate
without updating this document and the migration matrix.

## Lifecycle labels

| Label | Meaning |
|-------|---------|
| **active** | Product path in normal encrypted deployments |
| **retired** | Mounted but returns 410 unless `ALLOW_LEGACY_FINANCE` is set; hidden from OpenAPI |
| **migration-only** | Exists for upgrade/enroll paths; not a daily product surface |
| **test-only** | Enabled in tests via env escape hatch; not production config |
| **reserved** | Schema/table present; no product HTTP/UI yet |

## HTTP routers (`backend/app.py`)

| Surface | Module | Lifecycle | Owner | Retirement condition |
|---------|--------|-----------|-------|----------------------|
| Health | `routers/health.py` | active | ops | Keep while deploy health checks exist |
| Auth / admin users | `routers/auth_routes.py` | active | auth | Keep while passwordless sessions exist |
| Password bootstrap / signup / login | `auth_routes` password endpoints | retired (410) | auth | Remove after zero unenrolled password accounts in supported DBs |
| Password → passwordless enroll | `auth_routes` migrate path | migration-only | auth | Remove after migration window closed |
| Vault ciphertext API | `routers/vault.py` | active | vault | Primary finance storage |
| Market quotes / research | `routers/market.py` | active | market | Keep while yfinance refresh/research exists |
| Imports (bank/Fidelity plaintext) | `routers/imports.py` | retired + test-only | imports | Delete only after client importers cover all banks and migration matrix green |
| Transactions CRUD | `routers/transactions.py` | retired + test-only | ledger | Delete only after vault path is sole supported client |
| Cashflow summary | `routers/cashflow.py` | retired + test-only | cashflow | Same as transactions |
| Job income | `routers/income.py` | retired + test-only | cashflow | Same |
| Fixed expenses | `routers/fixed_expenses.py` | retired + test-only | cashflow | Same |
| Subscriptions | `routers/subscriptions.py` | retired + test-only | cashflow | Same |
| Assets | `routers/assets.py` | retired + test-only | balance-sheet | Same |
| Liabilities | `routers/liabilities.py` | retired + test-only | balance-sheet | Same |
| Holdings | `routers/holdings.py` | retired + test-only | portfolio | Same |
| Live net worth | `routers/net_worth.py` | retired + test-only | balance-sheet | Same (client computes NW from vault) |
| Planning MC HTTP | `routers/planning.py` | retired + test-only | planning | Client Monte Carlo is product path; keep for regression until matrix green |

Gate: `backend/crypto_gate.py` → 410 unless `ALLOW_LEGACY_FINANCE=1|true|yes`.
Tests set the escape hatch in `backend/tests/conftest.py`.

## Schema modules

| Module | Lifecycle | Notes |
|--------|-----------|-------|
| `schemas_auth.py` | active | Passwordless + admin invitation contracts |
| `schemas_vault.py` | active | Ciphertext records, indexes, sync |
| `schemas_market.py` | active | Quotes and research (ticker disclosure intentional) |
| `schemas_planning.py` | active (types) / retired (HTTP) | Types still used; HTTP router retired in prod |
| `schemas.py` | retired + test-only | Legacy plaintext finance DTOs |

## Schema authorities (coexist until BE-002 matrix complete)

| Authority | Path | Role | Retirement condition |
|-----------|------|------|----------------------|
| ORM `create_all` | `database.py` | Creates missing tables from models on startup | After Alembic alone covers every supported generation |
| Lightweight SQLite | `migrations.py` | Column/table backfills for old DBs | After each backfill has an Alembic revision and matrix fixture |
| Alembic | `alembic/versions/*` | Versioned upgrades to head `e8a4c7d2f910` | Never delete history; squash only with explicit proof |

Startup order: `create_all` → `run_sqlite_migrations` → Alembic `upgrade head`.

## Reserved tables / collections

| Name | Lifecycle | Semantics |
|------|-----------|-----------|
| `net_worth_snapshots` | reserved | Observed balance-sheet valuations; HTTP/UI unwired; not transaction rollups |
| vault collection `net_worth_snapshots` | reserved | Same plane for future encrypted observed history |
| vault collection `stock_lab_scenarios` | active | Encrypted speculative scenarios; non-mutating |

## Frontend product path

| Surface | Lifecycle |
|---------|-----------|
| Encrypted store + vault API | active |
| Client bank CSV import | active |
| Client Fidelity portfolio import | active |
| Client Monte Carlo planning | active |
| Stock Lab | active (ticker disclosure to market API) |
| Legacy finance HTTP from browser | retired (410) |

## Supported database generations (BE-002)

Named generations with fixture coverage in `backend/tests/test_migrations.py`:

| Generation ID | Starting state | Fixture |
|---------------|----------------|---------|
| `legacy-holdings` | Pre-brokerage `holdings` only | `test_alembic_upgrade_head_on_legacy_holdings_sqlite` |
| `vault-present-f2d8` | Vault tables + alembic `f2d8c6a4b913` | `test_vault_migration_is_idempotent_after_create_all` |
| `partial-passwordless-d4e5` | Partial passwordless at `d4e5f6a7b8c9` | `test_passwordless_migration_recovers_partial_sqlite_state` |
| `lightweight-tx-columns` | Bare `transactions` table | `test_run_sqlite_migrations_adds_transaction_columns_on_legacy_table` |

Head revision: `e8a4c7d2f910`. Observed snapshot columns asserted by
`test_net_worth_snapshots_lifecycle_columns_after_legacy_upgrade`.

Vault schema-v1 → schema-v2 ciphertext replacement is browser-owned; do not delete
plaintext source tables until encrypted replacement is verified per user and WAL
checkpoint + `VACUUM` complete (see `MIGRATION_TO_SERVER_BLIND_ENCRYPTION.md`).

## Preserve

- Alembic revision history
- 410 legacy finance gate for normal deploys
- Schema-v1 → schema-v2 vault record migration in browser
- Source plaintext tables until generation fixtures prove ciphertext replacement
- No reintroduction of tax-document BLOB storage
