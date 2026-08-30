# Adding a bank CSV import

Bank imports create **expense** transactions (`source=import`). They **do not** change net worth; update liabilities on **Balance sheet** if you track balances there.

Parsers live in `frontend/src/app/utils/bank-import.util.ts`. Tests: `frontend/src/app/utils/bank-import.util.spec.ts`.

Each parser must produce:

- `dedupe_key` (`bank|account|date|amount|normalized description` SHA-256)
- `date`, `account_mask`, `description`, `category`, `amount` (positive number for expenses)

The Transactions page calls `FinanceService.previewBankImport()` / `commitBankImport()`, which parse locally and write encrypted records. CSV contents are not sent to the backend.

| Slug | Notes |
|------|--------|
| `capital_one` | Credits/payments skipped; debits become expenses. |
| `chase` | Sale rows only (credit card export). |
| `amex` | American Express credit card export. |
| `citi` | Citi credit card export (Status, Debit/Credit, Member Name). |
| `x_money` | Completed negative Card Purchase rows only. |

Fidelity positions CSV is a **holdings** import (replace positions per account), not expense transactions. Parser: `frontend/src/app/utils/fidelity-import.util.ts`.
