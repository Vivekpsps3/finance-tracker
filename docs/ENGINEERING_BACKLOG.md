# Engineering backlog

Living list of follow-ups after the 2026-03-18 hardening pass. Not blocking local use.

## Done (reference)

- Coordinated `loadDashboard()`; Chart.js lazy import (~68 KB dashboard chunk)
- Current net worth vs period filter UX copy
- Backend split: `app.py`, `routers/`, `services/`
- OnPush on dashboard, charts, portfolio, transactions, layout
- Makefile, `.gitignore`, API health banner
- Shared UI token cleanup (no stray hex in primitives)

## Open — quality

| Priority | Item |
|----------|------|
| P2 | Finish migrating legacy `.page` / `.card` global CSS to Tailwind + `ui-*` on all routes |
| P2 | `CHART_COLORS` driven fully from `--chart-*` CSS variables |
| P2 | Calendar + remaining features OnPush if not already |
| P2 | Pagination for transactions (5k client limit today) |
| P3 | Light theme or remove unused `[data-theme='light']` hooks |
| P3 | E2E smoke in CI (API mock + Playwright) |
| P3 | Auth if API is ever exposed beyond localhost |

## Open — ops

- Production deploy doc (CORS, HTTPS, auth warning) — see README checklist
- Optional: `docker compose` for one-command demo

Update this file when closing items; keep README and DEVELOPMENT.md for day-to-day setup.