# UI debug report (2026-03-18)

## Symptoms
"UI isn't loading" — investigated with `ng build`, Playwright, and live dev server.

## Findings

### 1. **CORS mismatch (primary)** — FIXED
- Backend default `CORS_ORIGINS` was only `http://localhost:4200`.
- Opening **`http://127.0.0.1:4200`** blocks all API calls → net worth never loads, charts empty, error toasts flood console.
- Playwright on `127.0.0.1:4200`: **12+ CORS errors**; on `localhost:4200`: **0 errors**, dashboard renders.

**Fixes:**
- Backend now allows `http://localhost:4200` and `http://127.0.0.1:4200` by default.
- Dev **proxy** (`frontend/proxy.conf.js`) + `environment.development.ts` with `apiUrl: ''` so API calls are same-origin during `ng serve`.

### 2. **Routing / shell** — OK
- `MainLayoutComponent` + lazy children load correctly.
- Playwright: `nav count: 1`, `dashboard count: 1`, ~10k chars in `#main-content`.

### 3. **Loading state** — IMPROVED
- Dashboard `isLoading` now clears in `finalize()` on `getNetWorth()` (success or failure).
- Clearer error message when API is unreachable.

### 4. **Nav links** — IMPROVED
- Child-relative paths (`transactions` vs `/transactions`) for nested routes.

## How to run (verified path)

```bash
# Terminal 1
cd backend && uvicorn main:app --reload --host 127.0.0.1 --port 8000

# Terminal 2 — restart after proxy change
cd frontend && npm install && ng serve --host 0.0.0.0
```

Open: **http://localhost:4200** (or 127.0.0.1 — proxy + CORS both work now).

## Regression check

```bash
cd frontend
npx ng build --configuration development
npm run debug:ui
# optional: APP_URL=http://127.0.0.1:4200/ npm run debug:ui
```

**Common mistake:** `frontend/frontend/scripts/...` — there is only one `frontend` folder. Use `cd .../finance-tracker/frontend` then `npm run debug:ui`.