# Adding a bank CSV import

Bank imports create **expense** transactions (`source=import`). They **do not** change net worth; update liabilities on **Assets & liabilities** if you track balances there.

## Registry

Register parsers in `backend/import_registry.py` (`BANK_IMPORTS`). Each entry needs:

- `slug`, `name`, `hint`, `file_extensions`
- `parse(raw_csv: str) -> List[ParsedImportRow]`
- `bank_slug` / `bank_name` for dedupe keys and account labels

HTTP routes are generic: `POST /imports/{bank_slug}/preview` and `/commit` (see `backend/routers/imports.py`).

## Parsed row shape

`import_parsers/types.py` — each row should provide:

- `dedupe_key` (via `build_dedupe_key` in `dedupe.py`)
- `date`, `account_mask`, `description`, `category`, `amount` (positive number for expenses)

## Capital One (built-in)

Parser: `backend/import_parsers/capital_one.py`. Slug: `capital_one`. Credits/payments are skipped; debits become expenses.

## Commit behavior

- `type = expense`
- `source = import`
- Dedupe on `dedupe_key` (preview shows new vs duplicate)
- Does **not** call `record_net_worth_snapshot`

## Frontend

Transactions page → **Import from bank**. Proxy must include `/imports` (`frontend/proxy.conf.js`).

## Tests

Add parser unit tests under `backend/tests/` and extend preview/commit tests similar to `test_capital_one_import.py` (assert net worth unchanged after import).