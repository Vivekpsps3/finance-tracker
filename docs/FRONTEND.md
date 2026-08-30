# Frontend conventions

Angular 19 standalone app under `frontend/src/app/`.

## Stack

- **Tailwind CSS 3** + `src/theme/tokens.css` (ink + dust light default; dark only via `prefers-color-scheme`)
- **Shared UI** — `shared/ui/*`, selector prefix `ui-`
- **State** — `FinanceService` over `EncryptedStoreService` after vault unlock (RxJS `BehaviorSubject`s for ledger, balance sheet, recurring cashflow); `PlanningService`; `AuthService`
- Stock Lab uses `MarketResearchService` for explicit ticker lookups and `EncryptedStoreService` for encrypted `stock_lab_scenarios`.
- **Charts** — Chart.js via dynamic `import('chart.js/auto')` (dashboard/charts components and planning fan chart)

## Routes

| Path | Component |
|------|-----------|
| `/login` | Auth (username + vault-passphrase challenge login; legacy password migration only) — outside shell |
| `/vault/setup` | Create encrypted finance vault — auth only, outside shell |
| `/vault/unlock` | Unlock encrypted finance vault — auth only, outside shell |
| `/` | Home — three numbers: what you have, this month, what repeats |
| `/have` | Assets, debts, and holdings (`?t=holdings`) |
| `/spending` | Pay or spend list (`?t=pay`, `?t=spend`) and calendar (`?t=calendar`) |
| `/recurring` | Pay or spend (`?t=pay`, `?t=spend`) |
| `/planning` | What-if path, growth, and stocks (`?t=growth`, `?t=stocks`) |
| `/admin/users` | Admin user management (admin role only) |
| `/balance-sheet`, `/portfolio` | Redirect to `/have` |
| `/transactions`, `/calendar` | Redirect to `/spending` |
| `/income`, `/fixed-expenses`, `/subscriptions` | Redirect to `/recurring` |
| `/investment-insights`, `/stock-lab` | Redirect to `/planning` |
| `/charts` | Redirects to `/` |

Shell: `MainLayoutComponent` (five hubs, `#main-content`). Admin and account actions live in the account menu. Dev API: `apiUrl: '/api'` + `proxy.conf.js` (`/api/**` → FastAPI).

## Design tokens

Source of truth: `frontend/src/theme/tokens.css` and `frontend/tailwind.config.js`.

| CSS variable | Tailwind | Role |
|--------------|----------|------|
| `--bg` | `bg-bg` | Page background |
| `--card-bg` | `bg-card` | Cards |
| `--surface-2` | `bg-surface` | Inputs, chips |
| `--text` | `text-foreground` | Primary text |
| `--text-secondary` | `text-muted` | Secondary text |
| `--accent` | `text-accent` / `bg-accent` | Indigo `#5266EB` — links, primary actions |
| `--border` | `border-border` | Borders |
| `--success` / `--danger` / `--warning` | semantic utilities | Status |

Charts: `src/theme/chart-colors.ts` (prefer CSS vars for axes/tooltips; segment palette in `CHART_COLORS`).

**Appearance:** light is the default token set (paper `#F4F2EC`, card `#FFFEFA`,
ink `#1C1B18`, pine accent `#3F6F5C`). Dark is `[data-theme="dark"]`. First
visit follows the OS. The account menu has a Light / Dark split. Choice is
stored in `localStorage` key `ft-theme`. Elevation is surface value, not drop shadow.
Reduced transparency and increased contrast media queries are honored.
Typography prefers the system stack (no remote font fetch). There is no in-app
theme toggle. Locale money/date helpers live in `utils/format.util.ts`.

## Viewport presentation matrix (PLAT-001)

| Viewport | Navigation | Tables / dense data |
|----------|------------|---------------------|
| 390×844 | Icon + short labels, horizontal scroll, 44px targets | Horizontal scroll (dense table); list-cells deferred |
| 844×390 | Same, landscape | Same |
| 768×1024 | Short or full labels | Dense tables |
| 1024×768 | Desktop grid nav | Dense tables |
| 1280×800+ | Full labels + subnav | Dense tables |

Do **not** add a service worker that caches decrypted finance plaintext.

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
| `ui-data-table` | Scroll wrapper; project table markup inside; sortable columns expose semantic order |
| `ui-dialog` | Accessible modal shell: focus trap, Escape, backdrop close, scroll lock, restore focus; use for feature modals |
| `ui-icon` | Named icons used in nav and empty states |

Use **OnPush** on new components; feature pages must call `markForCheck()` after every manual subscription or promise mutation, including loading finalization and asynchronous error paths.

## Privacy and migration

- Vault finance records are schema-v2 authenticated-record ciphertext. The browser migrates schema-v1 records after login, verifies encrypted replacements, then removes legacy plaintext rows.
- Manual/imported Portfolio prices stay local. Explicit Portfolio refresh, typed lookup, and Stock Lab research send ticker symbols to the market-data backend/yfinance; no shares, values, account details, or scenario inputs are sent.
- Login unwraps a browser-held signing key with the vault passphrase and signs a single-use challenge. Admins issue invitations but cannot reset a user's vault passphrase or recover encrypted data.

## Home behavior

- Home shows three clickable numbers only.
- **What you have** is the current net worth total.
- **This month** is period activity plus recurring cashflow for the current month.
- **What repeats** is scheduled pay minus bills and subscriptions.
- Transactions do not change net worth.

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
