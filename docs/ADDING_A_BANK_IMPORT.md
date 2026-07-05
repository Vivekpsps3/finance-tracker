# Adding a bank CSV import

Bank imports create **expense** transactions (`source=import`). They **do not** change net worth; update liabilities on **Balance sheet** if you track balances there.

## Registry

Register parsers in `backend/import_registry.py` (`BANK_IMPORTS`). Each entry needs:

- `slug`, `name`, `hint`, `file_extensions`
- `parse(raw_csv: str) -> List[ParsedImportRow]`
- `bank_slug` / `bank_name` for dedupe keys and account labels

HTTP routes are generic: `POST /api/imports/{bank_slug}/preview` and `/commit` (see `backend/routers/imports.py`). Optional slug aliases live in `SLUG_ALIASES`.

List available banks: `GET /api/imports/banks`.

## Parsed row shape

`import_parsers/types.py` — each row should provide:

- `dedupe_key` (via `build_dedupe_key` in `dedupe.py`)
- `date`, `account_mask`, `description`, `category`, `amount` (positive number for expenses)

## Built-in bank importers

| Slug | Parser | Notes |
|------|--------|--------|
| `capital_one` | `import_parsers/capital_one.py` | Credits/payments skipped; debits become expenses. Also has legacy `/imports/capital-one/*` routes. |
| `chase` | `import_parsers/chase.py` | Sale rows only (credit card export). |
| `amex` | `import_parsers/amex.py` | American Express credit card export. Alias: `american-express`. |
| `citi` | `import_parsers/citi.py` | Citi credit card export (Status, Debit/Credit, Member Name). Alias: `citi-bank`. |

Merchant rules in `import_parsers/categories.py` (e.g. **Costco** when the description or bank category mentions Costco) apply to all bank parsers and manual transaction create/update.

## Brokerage (not bank ledger)

Fidelity positions CSV is a **holdings** import (replace positions for accounts in the file), not expense transactions:

- Registry: `BROKERAGE_IMPORTS` in `import_registry.py`
- Routes: `POST /api/imports/fidelity/preview|commit`
- List: `GET /api/imports/brokerages`

## Commit behavior (bank)

- `type = expense`
- `source = import`
- Dedupe on `dedupe_key` (preview shows new vs duplicate)
- Does **not** update net worth or record snapshots

## Frontend

Transactions page → **Import from bank**. Proxy must include `/imports` (`frontend/proxy.conf.js`).

## Tests

Add parser unit tests under `backend/tests/` and extend preview/commit tests similar to `test_capital_one_import.py`, `test_chase_import.py`, or `test_amex_import.py` (assert net worth unchanged after import).
