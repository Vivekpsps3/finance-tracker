# Surface Lifecycle Map

Canonical ownership for API routers, schema modules, and schema authorities.
Do not delete Alembic history. Plaintext finance tables stay until encrypted
replacement is verified per user and WAL checkpoint + `VACUUM` complete.

## Lifecycle labels

| Label | Meaning |
|-------|---------|
| **active** | Product path in normal encrypted deployments |
| **migration-only** | Exists for upgrade/enroll paths; not a daily product surface |
| **reserved** | Schema/table present; no product HTTP/UI |

## HTTP routers (`apps/finance/backend/app.py`)

| Surface | Module | Lifecycle | Owner |
|---------|--------|-----------|-------|
| Health | `routers/health.py` | active | ops |
| Auth / admin users | `routers/auth_routes.py` | active | auth |
| Password → passwordless enroll | `auth_routes` migrate path | migration-only | auth |
| Vault ciphertext API | `routers/vault.py` | active | vault |
| Market quotes / research | `routers/market.py` | active | market |

Plaintext finance HTTP (transactions, assets, holdings, imports, planning, cashflow) is unmounted.

## Schema modules

| Module | Lifecycle | Notes |
|--------|-----------|-------|
| `schemas_auth.py` | active | Passwordless + admin invitation contracts |
| `schemas_vault.py` | active | Ciphertext records, indexes, sync |
| `schemas_market.py` | active | Quotes and research (ticker disclosure intentional) |

## Schema authorities

| Authority | Path | Role |
|-----------|------|------|
| ORM `create_all` | `database.py` | Creates missing tables from models on startup |
| Lightweight SQLite | `migrations.py` | Column backfills for old DBs |
| Alembic | `alembic/versions/*` | Versioned upgrades to head `b7c9d2e4f601` |

Startup order: `create_all` → `run_sqlite_migrations` → Alembic `upgrade head`.

## Encrypted collections

| Name | Lifecycle | Semantics |
|------|-----------|-----------|
| vault collection `stock_lab_scenarios` | active | Encrypted speculative scenarios; non-mutating |

`planning_runs` is not an allowed collection. Monte Carlo is ephemeral in the browser.

## Frontend product path

| Surface | Lifecycle |
|---------|-----------|
| Encrypted store + vault API | active |
| Client bank CSV import | active |
| Client Fidelity portfolio import | active |
| Client Monte Carlo planning | active |
| Stock Lab | active (ticker disclosure to market API) |

## Supported database generations (BE-002)

Named generations with fixture coverage in `apps/finance/backend/tests/test_migrations.py`:

| Generation ID | Starting state | Fixture |
|---------------|----------------|---------|
| `legacy-holdings` | Pre-brokerage `holdings` only | `test_alembic_upgrade_head_on_legacy_holdings_sqlite` |
| `vault-present-f2d8` | Vault tables + alembic `f2d8c6a4b913` | `test_vault_migration_is_idempotent_after_create_all` |
| `partial-passwordless-d4e5` | Partial passwordless at `d4e5f6a7b8c9` | `test_passwordless_migration_recovers_partial_sqlite_state` |
| `lightweight-tx-columns` | Bare `transactions` table | `test_run_sqlite_migrations_adds_transaction_columns_on_legacy_table` |

Head revision: `b7c9d2e4f601`.

Vault schema-v1 → schema-v2 ciphertext replacement is browser-owned; do not delete
plaintext source tables until encrypted replacement is verified per user and WAL
checkpoint + `VACUUM` complete (see [SECURITY_MODEL.md](./SECURITY_MODEL.md)).

## Preserve

- Alembic revision history
- Schema-v1 → schema-v2 vault record migration in browser
- Source plaintext tables until generation fixtures prove ciphertext replacement
- No reintroduction of tax-document BLOB storage
