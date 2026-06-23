# Data model

Code truth: `backend/models.py`, `backend/services/finance.py`.

## Net worth

```
other_assets  = sum(Asset.current_value)
portfolio     = sum(holding shares × market price)
liabilities   = sum(Liability.balance_owed)
total_assets  = other_assets + portfolio
net_worth     = total_assets − liabilities
```

Recorded in `GET /net-worth/` and `NetWorthSnapshot` rows when assets, liabilities, or holdings change.

**Not** derived from transactions or imports.

## Manual balance sheet

| Table | Purpose |
|-------|---------|
| `assets` | Cash accounts, property, vehicles, other (`AssetCategory` enum) |
| `liabilities` | Mortgages, loans, credit cards (`LiabilityCategory` enum) |

Each row has `name`, `category`, value (`current_value` or `balance_owed`), `as_of_date`, optional `notes`.

## Investments

`holdings` — equities/ETFs with live/cached prices via `market_data`. Counted inside **portfolio**, not duplicated automatically in `assets`.

## Transactions ledger

`transactions` — `income` and `expense` (manual or `source=import` from bank CSV). Powers calendar, dashboard period views, and monthly expense/income totals on the Transactions page. **Does not** update net worth endpoints or snapshots.

Imports: see [ADDING_A_BANK_IMPORT.md](./ADDING_A_BANK_IMPORT.md).