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

Home shows three clickable blocks, then holdings and charts:

- current net worth with a holdings / assets / debts split
- this month pay vs spend
- recurring pay vs spend
- top holdings
- embedded cashflow, category, and allocation charts

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

- Light, airy, operational UI. Paper canvas `#F4F2EC`, card `#FFFEFA`, ink
  `#1C1B18`, pine accent `#3F6F5C`. Dark is an explicit Light / Dark split.
- Content width is 72rem. No shadows or glows. No `NW` / `CF` / `ACT+CF` / `PLAN` chips.
- Hierarchy from type weight, alignment, and hairline borders — not shadows or
  accent glows. Cards sit on a slightly lighter surface than the canvas.
- Cards are for real grouped surfaces, not decorative nesting.
- Modest radii (6–12px). Pills are for buttons and chips only.
- Use responsive grids for metric tiles.
- Keep tables horizontally safe on mobile.
- Avoid oversized hero sections, ornamental gradients, and marketing copy.
