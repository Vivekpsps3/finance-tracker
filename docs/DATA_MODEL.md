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

Always **current** via `GET /api/net-worth/` (computed from assets + portfolio market value − liabilities).

**Not** derived from transactions or imports. (History/snapshots feature removed.)

## Manual balance sheet

| Table | Purpose |
|-------|---------|
| `assets` | Cash accounts, property, vehicles, other (`AssetCategory` enum) |
| `liabilities` | Mortgages, loans, credit cards (`LiabilityCategory` enum) |

Each row has `name`, `category`, value (`current_value` or `balance_owed`), `as_of_date`, optional `notes`.

## Investments

`holdings` — equities/ETFs with live/cached prices via `market_data`. Counted inside **portfolio**, not duplicated automatically in `assets`.

## Transactions ledger

`transactions` — `income` and `expense` (manual or `source=import` from bank CSV). Powers calendar, dashboard period views, and monthly expense/income totals on the Transactions page. **Does not** update net worth (current-only computation).

Imports: see [ADDING_A_BANK_IMPORT.md](./ADDING_A_BANK_IMPORT.md).

## Planning lab (speculative)

Separate from net worth and the transaction ledger. Code: `backend/models.py`, `backend/services/planning/`.

| Table | Purpose |
|-------|---------|
| `planning_assumption_profiles` | Named assumption sets (`payload_json`: returns, spending, tax ids, retirement age, etc.) |
| `planning_scenario_runs` | One execution of a planning `tool_id`: seed, paths, `input_snapshot_hash`, `input_as_of` (snapshot time at run), JSON results |

- **Does not** update `assets`, `liabilities`, `holdings`, or `transactions`.
- **Does not** affect `GET /api/net-worth/`.
- API: `/api/planning/v1/*` — all responses include speculative disclaimers.