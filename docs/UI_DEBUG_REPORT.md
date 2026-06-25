# UI debug report

## Dashboard: "Http failure during parsing" on `/transactions/`

**Cause:** The dev server returned **HTML** (SPA `index.html`) instead of JSON.

Common reasons:

1. **Stale `ng serve`** — restart after `proxy.conf.js` changes.
2. **Wrong API path** — the app calls **`/api/transactions/`**, not `/transactions/`. The backend mounts all routes under `/api` (`backend/app.py`) so SPA routes (`/transactions`, `/planning`) do not collide with the API.
3. **Broken proxy config** — Vite ignores `proxy.conf.js` entries that use a **function** `context`. Use object keys `/api` and `/api/**` only (see `frontend/proxy.conf.js`).
4. **Backend not running** — `make dev` or `make backend`; health: `GET /api/health`.

**Verify:**

```bash
curl -s http://127.0.0.1:8000/api/health
curl -s "http://127.0.0.1:8000/api/transactions/?limit=2" | head -c 80
```

With `ng serve` running, the browser should request `http://<host>:4200/api/transactions/?limit=5000` (proxied to port 8000).

## API offline banner

Health checks retry for ~15s during startup. Use **Retry** on the banner after the API is up. `/health` failures do not show error toasts.

## CORS

If you bypass the proxy and set a full `apiUrl` to the backend origin, ensure `CORS_ORIGINS` includes your UI origin (`backend/.env`).