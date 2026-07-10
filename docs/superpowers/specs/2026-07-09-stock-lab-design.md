# Stock/ETF Decision And Planning Lab Design

Date: 2026-07-09

## Summary

Add a new dedicated Planning page, **Stock Lab**, for dense stock and ETF decision planning. The page is a speculative workbench: it analyzes typed symbols and existing owned symbols, compares multiple tickers, models hypothetical purchases, shows historical price and total-return behavior, surfaces dividend schedules and dividend income, and projects future outcomes under user-controlled assumptions.

Stock Lab does **not** mutate holdings, assets, liabilities, transactions, recurring cashflow, or net worth. It saves only encrypted scenario inputs in the browser-owned vault. Market research data is fetched through explicit ticker lookups and cached as public market data on the backend.

## Approved Product Decisions

- Layout: hybrid of Command Center and Comparison Lab.
- Navigation: new dedicated Planning nav item, not a tab inside existing Monte Carlo.
- Market privacy: typed symbols and owned holding symbols may be disclosed to the backend/yfinance for this feature.
- Saved data: save encrypted scenarios, not full reports.
- Return basis: price return and total return are shown side by side with equal emphasis.
- Data depth: v1 should attempt maximum useful yfinance data, while treating provider fields as opportunistic.
- Decision layer: analysis scorecard only, not direct buy/sell advice.
- Purchase action: planner-only; no conversion into real holdings in v1.

## Product Scope

Stock Lab answers: “What would it look like if I owned this stock or ETF?”

It supports:

- Primary ticker deep dive.
- 2-4 ticker comparison strip and matrix.
- Existing owned holdings as selectable analysis symbols.
- Explicit yfinance-backed market lookup with disclosure that symbols are sent to the backend.
- Saved encrypted scenarios.
- Price return, dividend return, and total return analysis.
- Dividend schedule and estimated income.
- Purchase planning by share count, dollar budget, target price, and cost basis.
- Future growth planning under bear/base/bull/custom assumptions.
- Fundamentals, ETF metadata, valuation, risk, and analyst/provider fields when available.
- Scorecard warnings and fit indicators.

It does not support in v1:

- Writing real holdings from the lab.
- Changing net worth or portfolio values.
- Persisting market-analysis report outputs as private records.
- Professional investment advice language such as “buy,” “sell,” or “avoid.”
- Guaranteeing all yfinance metadata exists for every symbol.

## Navigation And Route

Add a new route:

- Path: `/stock-lab`
- Title: `Stock Lab · Finance`
- Nav group: Planning
- Nav label: `Stock Lab`
- Short label: `Stocks`
- Guarding: same authenticated + vault-unlocked shell as other finance pages.

The existing Planning nav should become:

- Investment insights
- Monte Carlo
- Stock Lab

## Data Boundaries

### Encrypted User Data

Saved scenarios belong in a new encrypted vault collection:

- Collection name: `stock_lab_scenarios`
- Stored through `/api/vault/*` as ciphertext.
- Backend stores only encrypted payload and sync metadata.
- Scenario contents are decrypted only in the browser.

Scenario records include private user preferences such as target budget, share count, target price, custom assumptions, and scenario names.

### Public Market Data

Market research endpoints receive ticker symbols. For this feature, ticker lookup is an explicit exception to stricter holdings privacy because owned symbols may be analyzed automatically.

Backend may cache public data by symbol:

- Quote summary.
- Historical prices.
- Dividends.
- Splits.
- Company/fund metadata.
- Fundamentals and valuation fields.
- ETF/fund fields.
- Analyst target fields when available.
- Fetch timestamps, source, provider warnings, and cache status.

The market cache must not store private scenario assumptions, purchase budgets, share counts, user IDs, or holdings IDs.

### Planning Invariant

Stock Lab is speculative planning. It must not write:

- `holdings`
- `assets`
- `liabilities`
- `transactions`
- recurring cashflow records
- net worth snapshots

It must not affect current net worth. Any chart, score, dividend estimate, or projection is labeled as hypothetical.

## Architecture

### Frontend

Add a standalone Angular feature page under:

- `frontend/src/app/stock-lab/stock-lab.component.ts`
- `frontend/src/app/stock-lab/stock-lab.component.html`
- `frontend/src/app/stock-lab/stock-lab.component.css`

Supporting frontend code:

- `frontend/src/app/models/stock-lab.model.ts`
- `frontend/src/app/services/market-research.service.ts`
- `frontend/src/app/utils/stock-lab.util.ts`
- Extend `EncryptedStoreService` for `stock_lab_scenarios`.
- Extend route and nav definitions.

The component should use `ChangeDetectionStrategy.OnPush`, shared `ui-*` components, and Chart.js loaded dynamically where charts are needed.

### Backend

Add yfinance-backed market research under the public market surface. The existing `/api/market/price/{symbol}` remains for quote-only lookup.

New or extended backend code:

- `backend/routers/market.py`
- `backend/services/market_data.py`
- `backend/schemas_market.py` for market-research-specific request/response models.
- A new SQLite cache table for market research payloads, separate from quote-only `ticker_quotes`.

The API should validate symbol input using the existing symbol rules unless a specific ETF/fund symbol requires a safe extension. Batch lookups should be bounded to prevent accidental large provider calls.

## Backend API Contract

### GET `/api/market/research/{symbol}`

Query parameters:

- `refresh?: boolean` defaults to `false`.
- `period?: string` defaults to `10y`; users can request `max` from the UI when they want all available history.

Response shape:

```ts
interface MarketResearchResponse {
  symbol: string;
  valid: boolean;
  source: string;
  fetched_at: string;
  cache_status: 'hit' | 'miss' | 'refresh' | 'partial';
  warnings: string[];
  profile: MarketInstrumentProfile | null;
  quote: MarketQuoteSummary | null;
  history: MarketPricePoint[];
  dividends: MarketDividendEvent[];
  splits: MarketSplitEvent[];
  fundamentals: MarketFundamentals | null;
  etf: MarketEtfProfile | null;
  analyst: MarketAnalystSummary | null;
}
```

### POST `/api/market/research/batch`

Request:

```ts
interface MarketResearchBatchRequest {
  symbols: string[];
  refresh?: boolean;
  period?: string;
}
```

Response:

```ts
interface MarketResearchBatchResponse {
  results: MarketResearchResponse[];
  failed: Array<{ symbol: string; error: string }>;
}
```

Batch behavior:

- Cap symbols to 5 for v1: one primary symbol plus up to four comparison symbols.
- Return partial success when some symbols fail.
- Do not fail the whole batch because one ticker has no metadata.

### Market Data Detail Shapes

```ts
interface MarketInstrumentProfile {
  name?: string;
  asset_type?: 'stock' | 'etf' | 'fund' | 'cash' | 'unknown';
  exchange?: string;
  currency?: string;
  sector?: string;
  industry?: string;
  website?: string;
  quote_type?: string;
}

interface MarketQuoteSummary {
  current_price?: number;
  previous_close?: number;
  open?: number;
  day_high?: number;
  day_low?: number;
  fifty_two_week_high?: number;
  fifty_two_week_low?: number;
  market_cap?: number;
  beta?: number;
  trailing_pe?: number;
  forward_pe?: number;
  dividend_rate?: number;
  dividend_yield?: number;
}

interface MarketPricePoint {
  date: string;
  open?: number;
  high?: number;
  low?: number;
  close: number;
  adjusted_close?: number;
  volume?: number;
}

interface MarketDividendEvent {
  date: string;
  amount: number;
}

interface MarketSplitEvent {
  date: string;
  ratio: number;
}
```

Fundamentals, ETF, and analyst shapes should be permissive and optional because yfinance coverage varies widely.

## Frontend Scenario Model

```ts
interface StockLabScenario {
  id: number;
  name: string;
  primary_symbol: string;
  comparison_symbols: string[];
  include_owned_symbols: boolean;
  selected_owned_symbols: string[];
  purchase_mode: 'shares' | 'budget' | 'target_price';
  shares: number | null;
  budget: number | null;
  target_price: number | null;
  cost_basis: number | null;
  recurring_contribution: number | null;
  projection_years: number;
  bear_growth_rate: number;
  base_growth_rate: number;
  bull_growth_rate: number;
  custom_growth_rate: number | null;
  dividend_growth_rate: number;
  reinvest_dividends: boolean;
  tax_drag: number;
  fee_drag: number;
  inflation_rate: number;
  created_at: string;
  updated_at: string;
}
```

Defaults:

- `projection_years`: 10
- `bear_growth_rate`: 0.03
- `base_growth_rate`: 0.08
- `bull_growth_rate`: 0.12
- `dividend_growth_rate`: 0
- `reinvest_dividends`: true
- `tax_drag`: 0
- `fee_drag`: 0
- `inflation_rate`: 0.03

## Page Layout

### 1. Control Bar

- Primary ticker lookup.
- Comparison ticker inputs.
- Add owned symbols from current holdings.
- Refresh market data action.
- Scenario selector.
- Save, update, delete scenario actions.
- Clear disclosure: “Ticker symbols on this page are sent to market data services.”

### 2. Comparison Strip

Show cards for primary and comparison symbols:

- Symbol and name.
- Current price.
- Day change.
- 1Y price return.
- 1Y total return.
- Dividend yield.
- Data freshness.
- Failed/partial status when needed.

### 3. Headline Snapshot

For the primary ticker:

- Current price.
- Previous close.
- Day change and percent.
- 52-week high and low.
- Distance from high and low.
- Market cap if available.
- Currency and exchange.
- Owned exposure if the symbol exists in current holdings.
- Hypothetical position value from selected purchase assumptions.

### 4. Return Matrix

Periods:

- 1 month
- 6 months
- 1 year
- 2 years
- 3 years
- 5 years
- 10 years
- max available

Rows show:

- Start price.
- End price.
- Price return dollars.
- Price return percent.
- Dividend return dollars.
- Dividend return percent.
- Total return dollars.
- Total return percent.
- Annualized price return for periods 1 year or longer.
- Annualized total return for periods 1 year or longer.
- Rank against comparison tickers.
- Data availability marker.

Price return and total return are equally prominent.

### 5. Charts

Required charts:

- Price history line.
- Total-return line when dividend data exists.
- Comparison total-return chart.
- Drawdown chart.
- Dividend cashflow bar chart.
- Future projection chart with bear/base/bull/custom paths.

Every chart must have a nearby numeric summary and an empty state.

### 6. Dividend Analysis

Show:

- Dividend event schedule.
- Trailing 12-month dividends.
- Forward yield when available.
- Trailing dividend yield computed from actual payouts.
- Dividend return over each supported period.
- Yield on cost.
- Estimated monthly, quarterly, and annual income.
- Dividend growth over 1/3/5/10 years when enough history exists.
- Payment cadence detection: monthly, quarterly, annual, irregular, none.
- Dividend reliability warning when history is sparse or irregular.

If yfinance only provides dividend event dates, the UI should not invent ex-date/payment-date distinctions. It should label the provider date as “dividend date.”

### 7. Purchase Planner

Inputs:

- Shares.
- Dollar budget.
- Target entry price.
- Cost basis.
- Recurring contribution.
- Projection horizon.
- Bear/base/bull/custom growth rates.
- Dividend growth rate.
- Reinvest dividends.
- Tax drag.
- Fee drag.
- Inflation.

Outputs:

- Shares purchasable.
- Cash required.
- Position value at current price.
- Position value at target entry price.
- Gain/loss at user-entered target prices.
- Break-even price.
- Future nominal value.
- Future inflation-adjusted value.
- Dividend income over time.
- Total return with dividends reinvested.
- Total return without dividend reinvestment.

### 8. Analysis Scorecard

The scorecard is not advice. It should avoid labels like “Buy,” “Sell,” and “Avoid.”

Scores:

- Growth fit.
- Income fit.
- Risk/drawdown fit.
- Valuation signal.
- Data confidence.

Warnings:

- Provider data missing.
- Sparse history.
- High drawdown.
- High volatility.
- No dividend history.
- Irregular dividends.
- Owned portfolio concentration.
- Currency mismatch.
- Stale cached data.

### 9. Fundamentals, ETF, And Provider Detail

Show optional fields when available:

- Company/fund name.
- Sector and industry.
- Exchange and currency.
- Market cap.
- Beta.
- Trailing PE and forward PE.
- EPS.
- Revenue growth.
- Profit margin.
- Analyst target high/low/mean if present.
- Recommendation fields if present, but not as final app advice.
- ETF category.
- Expense ratio.
- NAV.
- Fund yield.
- Holdings or sector exposure if yfinance provides it reliably.

Missing provider fields render as `Unavailable`.

## Calculation Rules

### Return Periods

Use the nearest available trading day on or before the desired start date. If no point exists, mark the period unavailable.

Price return:

```text
price_return = end_close - start_close
price_return_pct = price_return / start_close
```

Dividend return:

```text
dividend_return = sum(dividends paid after start_date and on/before end_date)
dividend_return_pct = dividend_return / start_close
```

Total return without reinvestment:

```text
total_return = price_return + dividend_return
total_return_pct = total_return / start_close
```

Annualized return for periods at least one year:

```text
annualized = (1 + return_pct) ^ (1 / years) - 1
```

### Drawdown

Compute drawdown from closing prices:

```text
drawdown = close / running_peak_close - 1
```

Show max drawdown for selected horizon.

### Dividend Cadence

Infer cadence from intervals between dividend event dates:

- Monthly: most intervals around 25-35 days.
- Quarterly: most intervals around 80-100 days.
- Annual: most intervals around 330-400 days.
- Irregular: insufficient consistency.
- None: no events.

### Purchase Planning

Shares purchasable by budget:

```text
shares = budget / effective_purchase_price
```

Effective purchase price uses target price when purchase mode is target-price, otherwise current price.

Position value:

```text
position_value = shares * current_or_projected_price
```

Projection should run yearly for v1 using annualized assumptions. Monthly compounding may be added if simple to implement, but the spec does not require it.

## Error Handling

- Invalid symbol: show inline validation and do not call API.
- Provider unavailable: preserve scenario and show market-data error.
- Missing quote: show failed card and keep other symbols.
- Missing history: disable affected period rows and charts.
- Missing dividends: show “No dividend history found.”
- Missing fundamentals: show `Unavailable`.
- Partial batch failure: show successful symbols and failed-symbol messages.
- Rate limit: show retry guidance and keep current report on screen.
- Stale cache: show fetched timestamp and warning.
- Empty scenario list: show first-run helper state.

## Security And Privacy

- The UI must clearly disclose ticker-symbol lookup.
- Saved scenario payloads remain encrypted in `stock_lab_scenarios`.
- Backend market cache stores only public symbol-level data.
- Logs must not include scenario names, budgets, share counts, or holdings IDs.
- Backend must not join market lookups to users or persist user-specific market research.
- Existing finance endpoints remain unchanged.

## Testing Plan

### Backend Tests

- Symbol validation accepts valid tickers and rejects invalid values.
- Single market research endpoint maps mocked yfinance responses.
- Batch endpoint returns partial successes and failures.
- Cache hit/miss/refresh behavior works.
- Price return calculations match expected values.
- Dividend return and total return calculations match expected values.
- Missing yfinance fields produce nulls/warnings, not 500s.
- Rate limiting remains enforced for market research endpoints.
- Market cache does not store user scenario data.

### Frontend Tests

- Stock Lab utilities compute return periods correctly.
- Dividend cadence detection works for monthly, quarterly, annual, irregular, and none.
- Purchase planner computes shares, cost, future value, dividend income, and inflation-adjusted value.
- Scenario save/load/delete works through encrypted store.
- Missing market data renders graceful empty states.
- Scorecard warnings trigger for sparse history, missing dividends, high drawdown, and concentration.
- Route and nav item exist.

### Manual Verification

- `make test-backend`
- `cd frontend && npx ng build --configuration development`

If frontend tests or build require unavailable browser tooling, report that explicitly.

## Documentation Updates

Update:

- `docs/ARCHITECTURE.md`: mention Stock Lab as a planning surface and market-symbol privacy exception.
- `docs/DATA_MODEL.md`: document `stock_lab_scenarios` encrypted collection semantics.
- `docs/FRONTEND.md`: add `/stock-lab` route and nav entry.
- `docs/SECURITY_MODEL.md`: clarify that Stock Lab can disclose owned symbols when the user uses this feature.
- `docs/DESIGN_GUIDE.md`: add Stock Lab to subpage standards.

## Implementation Notes

- Prefer frontend calculations for scenario outputs to keep private assumptions out of backend APIs.
- Backend should focus on public market data retrieval and caching.
- Keep yfinance-specific parsing isolated in `MarketDataService` or a small adjacent helper.
- Do not make the page dependent on every optional yfinance field being present.
- Keep the first implementation dense but navigable: cards, grids, details panels, and horizontal-safe tables.
- Do not add direct holding creation in v1.

## Open Risks

- yfinance field availability is inconsistent across stocks, ETFs, and funds.
- Some ETF holdings/sector fields may be slow or absent.
- Historical adjusted-close behavior may already include dividends; total-return calculations must avoid double-counting if adjusted close is used. Use raw close plus explicit dividends for transparent period math unless a total-return-specific series is deliberately implemented and labeled.
- Provider calls can be slow; batch requests need limits, caching, and partial failure behavior.
- Owned-symbol analysis intentionally weakens holdings privacy for users who enable/use this page.
