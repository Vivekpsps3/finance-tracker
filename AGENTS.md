# AI Agent Handoff

Read this before changing code. This app is meant to be easy for future AI agents
to resume with minimal rediscovery.

## Product Story

Personal, self-hosted finance tracker. The user wants first-class support for:

- current net worth
- spending and transaction review
- investments and portfolio imports
- planning/retirement analysis
- official tax document storage and yearly summaries
- later household users and SimpleFIN, but not now

Deployment target is a domain-hosted website on a Raspberry Pi or similar. SQLite
is acceptable and should default to a repo-local DB file, configurable with
`DATABASE_URL`.

## Hard Invariants

Do not blur these data planes:

1. Net worth = current manual assets + portfolio market value - liabilities.
2. Transactions are a card/spending ledger and do not change net worth.
3. Net worth snapshots are observed balance-sheet valuations, not transaction
   rollups.
4. Planning is speculative and must not mutate assets, liabilities, holdings, or
   transactions.
5. Imported brokerage cash sweeps and manual cash assets can double count; the
   app currently leaves that choice to the user and documents it.
6. Tax documents are a separate review/vault plane. They do not update net
   worth, transactions, or planning inputs.

## Current Stack

- Backend: FastAPI, SQLAlchemy, SQLite, Alembic, yfinance price lookup.
- Frontend: Angular 19 standalone components, Tailwind, Chart.js.
- Imports today: Capital One CSV transactions, Fidelity CSV positions.
- Tax docs today: upload/store/download/delete W-2, 1099, 1098, 5498, 1040,
  state return, property tax, and other files; yearly summary aggregates
  manually entered structured values.
- Planned later: SimpleFIN. Plaid is not expected to work for this user.

## Where To Look

- `docs/ARCHITECTURE.md`: one-page architecture.
- `docs/DATA_MODEL.md`: financial formulas and table semantics.
- `docs/FRONTEND.md`: Angular routes, shared UI, design conventions.
- `docs/DESIGN_GUIDE.md`: page-level metrics, chart rules, visual standards.
- `docs/DEPLOY.md`: production/domain deployment checklist.
- `docs/ADDING_A_BANK_IMPORT.md`: add a new CSV bank importer.
- `backend/models.py`: ORM tables.
- `backend/services/finance.py`: net worth, imports, response mappers.
- `frontend/src/app/services/finance.service.ts`: frontend API contract.

## Recent Direction

The user clarified:

- all major finance surfaces matter; do not optimize for only budgeting or only
  investments
- current net worth must stay separate from transaction history
- transactions are mostly card-based, but rent/utilities can be first-class
  manual recurring/cashflow items later
- CSV import is fine now; SimpleFIN later; Plaid later is not desired
- domain access is required
- DB location should be configurable, defaulting to a repo-local SQLite file
- backups are user-managed for now
- login/household users are later, not part of the current pass
- tax UI must display important yearly and per-document values directly, not
  hide them in backend-only metadata

## Implementation Notes

Prefer additive API changes. Preserve current endpoints unless intentionally
migrating them with tests and docs. Add tests for any financial invariant.

For tax work, keep `summary_json` as the stable structured-value contract.
Future OCR/LLM extraction should populate the same fields rather than inventing
a parallel model.

For UI work, keep operational density. Avoid marketing/landing pages. Use shared
`ui-*` components where practical and keep cards for real grouped surfaces.

Before finalizing a substantial change, run:

```bash
make test-backend
cd frontend && npx ng build --configuration development
```

If frontend tests need Chrome and fail due environment setup, report that
explicitly.
