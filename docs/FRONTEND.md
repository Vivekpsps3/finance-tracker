# Frontend conventions

Angular 19 standalone app under `frontend/src/app/`.

## Stack

- **Tailwind CSS 3** + `src/theme/tokens.css` (dark only v1)
- **Shared UI** — `shared/ui/*`, selector prefix `ui-`
- **State** — `FinanceService` (RxJS `BehaviorSubject`s); dashboard uses `loadDashboard()` for coordinated fetch
- **Charts** — Chart.js via dynamic `import('chart.js/auto')` in `ChartsComponent`

## Routes

| Path | Component |
|------|-----------|
| `/` | Dashboard (lazy; current net worth, manual snapshots, period trends) |
| `/transactions` | Transactions (income, expenses, import) |
| `/balance-sheet` | Balance sheet |
| `/portfolio` | Portfolio (manual + Fidelity CSV import with account grouping) |
| `/calendar` | Calendar |
| `/taxes` | Tax Center (official document vault + yearly summary) |
| `/planning` | Monte Carlo net worth simulator (fan chart; save **named input presets** only—runs not stored) |
| `/charts` | Redirects to `/` (legacy path) |

Shell: `MainLayoutComponent` (top nav, `#main-content` max-width 1180px). Dev API: `apiUrl: '/api'` + `proxy.conf.js` (`/api/**` → FastAPI).

## Design tokens

Source of truth: `frontend/src/theme/tokens.css` and `frontend/tailwind.config.js`.

| CSS variable | Tailwind | Role |
|--------------|----------|------|
| `--bg` | `bg-bg` | Page background |
| `--card-bg` | `bg-card` | Cards |
| `--surface-2` | `bg-surface` | Inputs, chips |
| `--text` | `text-foreground` | Primary text |
| `--text-secondary` | `text-muted` | Secondary text |
| `--accent` | `text-accent` / `bg-accent` | Links, primary actions |
| `--border` | `border-border` | Borders |
| `--success` / `--danger` / `--warning` | semantic utilities | Status |

Charts: `src/theme/chart-colors.ts` (prefer CSS vars for axes/tooltips; segment palette in `CHART_COLORS`).

**Product:** dark theme only; no theme toggle in v1.

## Shared components

Import from `shared/ui` or `shared/ui/index.ts`.

| Selector | Notes |
|----------|--------|
| `ui-button` | `variant`: primary \| secondary \| ghost \| danger; `(clicked)` output |
| `ui-card` | `title`, optional `[uiCardActions]` |
| `ui-badge` | `variant`: default \| success \| warning \| danger |
| `ui-input` | `[(value)]` model, `label`, `type` |
| `ui-select` | `[(value)]`, `options: UiSelectOption[]` |
| `ui-skeleton` | `variant`: lines \| block \| circle |
| `ui-empty-state` | `title`, `message` |
| `ui-page-header` | `title`, `subtitle`, `[uiPageActions]` |
| `ui-data-table` | Scroll wrapper; project table markup inside |

Use **OnPush** on new components; feature pages should use OnPush + `markForCheck` when updating from subscriptions.

## Dashboard behavior

- **Period filter** applies to insights and charts only.
- **Net worth hero** is always **current** balance-sheet total (labeled in UI).
- **Record snapshot** stores the current balance-sheet valuation through
  `POST /api/net-worth/snapshots`.
- Snapshot history is observed net worth history. It is not computed from
  transactions.
- Embedded charts: `[embedded]="true"`, `[dataReady]`, `[overrideTransactions]`.

When adding history charts later, keep two concepts separate:

| Concept | Source |
|---------|--------|
| Observed net worth | `net_worth_snapshots` |
| Spending/income trends | `transactions` |

## Tax Center behavior

- Route: `/taxes`.
- Shows yearly totals from structured values entered during upload.
- Upload accepts PDF, CSV, text, JPG, and PNG tax documents.
- Important values are visible on the page and on each document row.
- Document downloads use `/api/taxes/documents/{id}/download`.
- Tax summaries are not financial ledger mutations; keep tax docs separate from
  net worth and transactions.
- Tax Center uses native file, textarea, and dense numeric inputs because shared
  UI components do not yet cover those controls ergonomically. Keep the local
  `.field` pattern contained to the page until reusable file/textarea controls
  exist.

## Build

```bash
cd frontend
npm install
npx ng build --configuration development
```

Do not break `FinanceService` public method signatures without coordinating with backend/docs.
