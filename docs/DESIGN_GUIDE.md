# Design Guide

This app is an operational finance dashboard, not a marketing site. Every page
should answer useful money questions quickly with dense, readable metrics and
clear graphs.

## Product Principles

1. Show the most relevant metrics directly on each page.
2. Prefer charts and summaries over raw tables alone.
3. Keep financial data planes separate: net worth, transactions, recurring
   cashflow, and planning each have different meanings.
4. Make the UI useful before it is decorative.
5. Optimize for future AI agents: if a page has unusual behavior, document the
   invariant near the code or in the relevant doc.

## Dashboard Standard

The dashboard should include:

- current net worth from balance sheet data
- asset/liability/portfolio breakdown
- selected-period income
- selected-period spending
- selected-period net cashflow
- savings rate
- average daily spend
- largest expense category
- investment percentage of total assets
- monthly cashflow chart
- spending by category chart
- portfolio allocation chart

The period filter applies only to transaction-derived (and related cashflow)
metrics and charts. It must not imply that net worth is computed from
transactions.

## Subpage Standard

Each major subpage should have page-level metrics at the top:

- Transactions: monthly income, spending, net cashflow, largest category, count.
- Income: annual/monthly gross and net, active jobs.
- Bills: monthly/annual total, active count, largest items.
- Subscriptions: monthly/annual total, next bills, active count.
- Balance sheet: total assets, liabilities, net worth, stale balances.
- Portfolio: market value, account allocation, largest holdings, price freshness.
- Investment insights: portfolio value, growth assumptions, projected value, withdrawal-rate income (client-side; speculative).
- Calendar: monthly spending, income, net cashflow, active days.
- Planning: scenario success rate, median ending value, risk bands, assumptions.
- Stock Lab: primary ticker price, price return, total return, dividend income, purchase scenario value, scorecard warnings, and comparison tickers.

Tables are acceptable for detail, but a page is incomplete if it only exposes a
table when a summary or graph would answer the natural question faster.

## Chart Rules

- Use Chart.js through existing chart utilities.
- Use token-based colors from `frontend/src/theme/chart-colors.ts`.
- Every chart needs a meaningful empty state.
- Every chart needs a nearby numeric summary so the user does not have to hover.
- Keep net worth charts sourced from the current balance-sheet formula, never
  from transaction sums.
- Investment-insights projections are speculative client-side charts, not
  stored net worth history.

## Visual Style

- Dark, dense, operational UI.
- Cards are for real grouped surfaces, not decorative nesting.
- Use responsive grids for metric tiles.
- Keep tables horizontally safe on mobile.
- Avoid oversized hero sections, ornamental gradients, and marketing copy.
