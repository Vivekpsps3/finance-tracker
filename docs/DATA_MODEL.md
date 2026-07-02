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

**Not** derived from transactions or imports. Observed history is stored as
snapshots, but snapshots still use the current balance-sheet formula.

### Net worth snapshots

`net_worth_snapshots` stores observed balance-sheet valuations created from the
same current formula:

```
snapshot.total = assets + portfolio - liabilities
```

Snapshots are available at:

| Endpoint | Purpose |
|----------|---------|
| `GET /api/net-worth/snapshots` | Recent observed net worth history |
| `POST /api/net-worth/snapshots` | Record the current balance-sheet valuation |

Snapshots are **not** a transaction rollup. Expenses, income, card payments,
rent, utilities, transfers, and bank imports remain transaction/cashflow data.
They only affect net worth after the corresponding current asset/liability value
is updated.

Future back-calculated net worth should be added as a separate projection or
derived history layer. Example: reconstructing historical investment values from
holding purchase dates and price history must not rewrite observed snapshots.

### Avoid double-counting cash

`compute_net_worth()` in `services/finance.py` **adds** `other_assets` (all manual `assets` rows) and **portfolio** (all `holdings` rows valued at market or purchase fallback). There is **no** deduplication between a manual cash/checking asset and brokerage sweep or money-market positions (e.g. **SPAXX**, **SWVXX**, **VMFXX**) that appear in Fidelity or other imports.

| User mistake | Effect on net worth |
|--------------|---------------------|
| Manual “Cash” or checking asset **and** SPAXX (or similar) in `holdings` for the same dollars | Both count toward `total_assets` — **inflated** net worth |
| Only SPAXX in `holdings` (brokerage cash) | Correct if that is where cash lives |
| Only manual `assets` for bank cash | Correct if you do not import sweep positions |

**Guidance:** Pick one representation per pool of money. Either track bank cash as manual assets **or** rely on brokerage CSV positions (including sweeps), not both for the same balance. The app does not infer overlaps; keeping both is allowed and sums both amounts by design.

## Manual balance sheet

| Table | Purpose |
|-------|---------|
| `assets` | Cash accounts, property, vehicles, other (`AssetCategory` enum) |
| `liabilities` | Mortgages, loans, credit cards (`LiabilityCategory` enum) |

Each row has `name`, `category`, value (`current_value` or `balance_owed`), `as_of_date`, optional `notes`.

## Investments

`holdings` — equities/ETFs and brokerage cash sweeps with live/cached prices via `market_data`. Counted inside **portfolio** only; they are **not** subtracted from or merged with manual `assets` (see [Avoid double-counting cash](#avoid-double-counting-cash)).

## Transactions ledger

`transactions` — `income` and `expense` (manual or `source=import` from bank CSV). Powers calendar, dashboard period views, and monthly expense/income totals on the Transactions page. **Does not** update net worth.

The user mostly transacts by card. Rent and utilities should become first-class
manual/recurring cashflow items later, but still should not directly mutate net
worth.

Imports: see [ADDING_A_BANK_IMPORT.md](./ADDING_A_BANK_IMPORT.md).

SimpleFIN is the likely future aggregation path. Plaid placeholders may exist in
env examples, but Plaid is not the intended integration for this user.

## Tax document vault

`tax_documents` stores official tax files and user-entered structured values for
yearly review.

| Field group | Purpose |
|-------------|---------|
| Metadata | `tax_year`, `document_type`, `issuer`, `taxpayer`, `filename`, `content_type`, `size_bytes`, `sha256`, `uploaded_at` |
| File storage | `file_bytes` SQLite BLOB; keeps docs inside the repo-local DB file |
| Review values | `summary_json` for values read from official docs |

Supported document types:

- W-2
- 1099
- 1098
- 5498
- 1040 tax return
- state return
- property tax
- other

Yearly summary endpoint:

```
GET /api/taxes/years/{tax_year}/summary
```

Aggregated values include wages, federal/state withholding, Social Security and
Medicare wages/tax, interest, dividends, capital gain distributions, retirement
contributions, AGI, taxable income, total tax, and refund/amount owed.

Important boundary: tax documents do not update net worth, transactions, or
planning. They are a review/documentation plane. Future extraction/OCR should
populate `summary_json` from files but preserve the same API contract.

## Planning lab (speculative)

Separate from net worth and the transaction ledger. Code: `backend/models.py`, `backend/services/planning/`.

| Table | Purpose |
|-------|---------|
| `planning_assumption_profiles` | Named assumption sets (`payload_json`: returns, spending, tax ids, retirement age, etc.) |
| `planning_scenario_runs` | One execution of a planning `tool_id`: seed, paths, `input_snapshot_hash`, `input_as_of` (snapshot time at run), JSON results |

- **Does not** update `assets`, `liabilities`, `holdings`, or `transactions`.
- **Does not** affect `GET /api/net-worth/`.
- API: `/api/planning/v1/*` — all responses include speculative disclaimers.
