# Frontend conventions

Angular 19 standalone app under `frontend/src/app/`.

## Stack

- **Tailwind CSS 3** + `src/theme/tokens.css` (dark only v1)
- **Shared UI** — `shared/ui/*`, selector prefix `ui-`
- **State** — `FinanceService` over `EncryptedStoreService` after vault unlock (RxJS `BehaviorSubject`s for ledger, balance sheet, recurring cashflow); `PlanningService`; `AuthService`
- **Charts** — Chart.js via dynamic `import('chart.js/auto')` (dashboard/charts components and planning fan chart)

## Routes

| Path | Component |
|------|-----------|
| `/login` | Auth (bootstrap first admin, signup, login) — outside shell |
| `/vault/setup` | Create encrypted finance vault — auth only, outside shell |
| `/vault/unlock` | Unlock encrypted finance vault — auth only, outside shell |
| `/` | Dashboard (lazy; current net worth, period trends) |
| `/transactions` | Activity → Transactions (income, expenses, bank CSV import) |
| `/calendar` | Activity → Calendar |
| `/income` | Cashflow → Job income configurations |
| `/fixed-expenses` | Cashflow → Bills / recurring fixed expenses (rent/utilities-style) |
| `/subscriptions` | Cashflow → Subscriptions |
| `/balance-sheet` | Net Worth → Manual assets & liabilities |
| `/portfolio` | Net Worth → Portfolio (manual + Fidelity CSV import with account grouping) |
| `/investment-insights` | Planning → Client-side portfolio growth / withdrawal-rate insights |
| `/planning` | Planning → Monte Carlo net worth simulator (fan chart; save **named input presets** only—runs not stored) |
| `/admin/users` | Admin user management (admin role only) |
| `/charts` | Redirects to `/` (legacy path) |

Shell: `MainLayoutComponent` (grouped top nav + subnav, `#main-content`). Top-level groups are Overview, Activity, Cashflow, Net Worth, and Planning; admin/user actions live in the account menu. Dev API: `apiUrl: '/api'` + `proxy.conf.js` (`/api/**` → FastAPI).

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
| `ui-icon` | Named icons used in nav and empty states |

Use **OnPush** on new components; feature pages should use OnPush + `markForCheck` when updating from subscriptions.

## Dashboard behavior

- **Period filter** applies to insights and charts only.
- **Net worth hero** is always **current** balance-sheet total (labeled in UI).
- Observed net worth **history** is not currently exposed in the UI (see [DATA_MODEL.md](./DATA_MODEL.md) on `net_worth_snapshots`).
- Embedded charts use shared chart utilities where present.

When adding history charts later, keep two concepts separate:

| Concept | Source |
|---------|--------|
| Observed net worth | balance-sheet formula / future `net_worth_snapshots` API |
| Spending/income trends | `transactions` (+ optional cashflow summary) |

## Recurring cashflow pages

- `/income`, `/fixed-expenses`, `/subscriptions` manage encrypted recurring rows via `FinanceService`.
- These do **not** change net worth. They feed cashflow summary and can influence planning spending inputs.
- Prefer the dedicated pages over inventing parallel recurring models on the transactions table.

## Bank CSV Import

- Transactions page bank import runs in the browser via `utils/bank-import.util.ts`.
- Supported slugs: `capital_one`, `chase`, `amex`, `citi`, `x_money`.
- Preview uses encrypted transaction dedupe keys and commit writes encrypted transaction records through `/api/vault/records/upsert`; bank CSV contents are not sent to legacy `/api/imports/*` routes in normal vault mode.

## Build

```bash
cd frontend
npm install
npx ng build --configuration development
```

Do not break `FinanceService` public method signatures without coordinating with backend/docs.
