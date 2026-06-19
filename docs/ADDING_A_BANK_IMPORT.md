# Adding a new bank statement import

This app imports bank transactions through a **registry** (`backend/import_registry.py`). The UI loads banks from `GET /imports/banks` and shows them in a dropdown.

## Checklist for a new bank

### 1. Parser module

Create `backend/import_parsers/<bank_slug>.py` (e.g. `chase.py`).

- Export constants: `BANK_SLUG`, `BANK_NAME`, `IMPORT_HINT` (one sentence for the UI).
- Implement `parse_<bank>_csv(content: str) -> list[ParsedImportRow]`.
- Each `ParsedImportRow` must include:
  - `date` — transaction date (not posted date unless that is all you have)
  - `account_mask` — last4 / card mask shown as `Bank Name ···1234`
  - `description`, `category`, `amount` (positive number for expenses)
  - `dedupe_key` — use `build_dedupe_key(BANK_SLUG, account_mask, date, amount, description)` from `import_parsers/dedupe.py`

Document which CSV columns you map and what you skip (e.g. credits, payments).

### 2. Register the bank

In `backend/import_registry.py`, add an entry to `BANK_IMPORTS`:

```python
from import_parsers.chase import BANK_SLUG as CHASE_SLUG, BANK_NAME as CHASE_NAME, IMPORT_HINT as CHASE_HINT, parse_chase_csv

BANK_IMPORTS[CHASE_SLUG] = BankImportConfig(
    slug=CHASE_SLUG,
    name=CHASE_NAME,
    hint=CHASE_HINT,
    file_extensions=(".csv",),
    parse=parse_chase_csv,
    bank_slug=CHASE_SLUG,
    bank_name=CHASE_NAME,
)
```

No frontend code changes are required if the slug is registered—the dropdown picks it up automatically.

### 3. Tests

Add `backend/tests/test_<bank>_import.py`:

- Parser unit test (sample row, skipped credits, bad headers).
- API test: `POST /imports/<slug>/preview` with multipart file, then `POST /imports/<slug>/commit` with one row.

### 4. Database behavior (unchanged)

Imports still write to `transactions` with:

- `source = "import"`
- `type = expense` (unless you extend the registry for income rows later)
- `category` = bank category (current product rule)
- `bank_account_id` → `banks` + `bank_accounts` (created on commit)

### 5. API contract

| Endpoint | Purpose |
|----------|---------|
| `GET /imports/banks` | List `{ slug, name, hint, file_extensions }` |
| `POST /imports/{slug}/preview` | `multipart/form-data` field `file` |
| `POST /imports/{slug}/commit` | JSON `{ filename, rows: [...] }` |

Legacy aliases `POST /imports/capital-one/preview` and `.../commit` remain for Capital One only.

### 6. Agent notes

- Keep parsers **pure** (string in → rows out); no DB access in parsers.
- Validate headers early with clear `ValueError` messages (line numbers when possible).
- Prefer **one row per purchase**; aggregate in parser only if the bank export requires it.
- Do not change `dedupe_key` formula without a migration plan (re-imports would duplicate).
- After adding a bank, run: `cd backend && python -m pytest tests/ -q`

## Reference: Capital One

See `backend/import_parsers/capital_one.py` for the canonical implementation.