# Adding a bank CSV import

Bank imports create **expense** transactions (`source=import`). They **do not** change net worth; update liabilities on **Balance sheet** if you track balances there.

## Active client-side registry

Normal vault-mode bank imports run in the browser. Add or update active parsers in
`frontend/src/app/utils/bank-import.util.ts` and tests in
`frontend/src/app/utils/bank-import.util.spec.ts`.

Each parser must produce:

- `dedupe_key` using the same payload format as the legacy backend (`bank|account|date|amount|normalized description` SHA-256)
- `date`, `account_mask`, `description`, `category`, `amount` (positive number for expenses)

The Transactions page calls `FinanceService.previewBankImport()` and
`commitBankImport()`. In encrypted mode these methods parse locally and write
encrypted transaction records; CSV contents are not sent to the backend.

## Legacy backend registry

Backend parsers in `backend/import_registry.py` are retained for regression tests
and old service-layer coverage only. Normal deployments return `410` for
`/api/imports/*`, and those routes are hidden from OpenAPI.

Each legacy backend entry needs:

- `slug`, `name`, `hint`, `file_extensions`
- `parse(raw_csv: str) -> List[ParsedImportRow]`
- `bank_slug` / `bank_name` for dedupe keys and account labels

Legacy HTTP routes are generic: `POST /api/imports/{bank_slug}/preview` and
`/commit` (see `backend/routers/imports.py`) when explicitly enabled for tests.
Optional slug aliases live in `SLUG_ALIASES`.

## Parsed row shape

`import_parsers/types.py` — each row should provide:

- `dedupe_key` (via `build_dedupe_key` in `dedupe.py`)
- `date`, `account_mask`, `description`, `category`, `amount` (positive number for expenses)

## Built-in bank importers

| Slug | Parser | Notes |
|------|--------|--------|
| `capital_one` | `bank-import.util.ts` + `import_parsers/capital_one.py` | Credits/payments skipped; debits become expenses. |
| `chase` | `bank-import.util.ts` + `import_parsers/chase.py` | Sale rows only (credit card export). |
| `amex` | `bank-import.util.ts` + `import_parsers/amex.py` | American Express credit card export. |
| `citi` | `bank-import.util.ts` + `import_parsers/citi.py` | Citi credit card export (Status, Debit/Credit, Member Name). |
| `x_money` | `bank-import.util.ts` + `import_parsers/x_money.py` | Completed negative Card Purchase rows only. |

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

Transactions page → **Import from bank**. In vault mode it uses local parsing and `/api/vault/*`; no `/imports` proxy path is required for normal browser use.

## Tests

Add frontend parser tests in `frontend/src/app/utils/bank-import.util.spec.ts`.
If you also keep a matching legacy backend parser, add parser unit tests under
`backend/tests/` and assert net worth remains unchanged after import.
