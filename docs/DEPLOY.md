# Production / domain deployment checklist

This app is **local-first and single-user**. Use this list only if the API is reachable beyond your own machine.

The current intended deployment is a domain-accessible website on a Raspberry Pi
or similar host:

```
domain / LAN / VPN
  → web container (Nginx serves Angular and proxies /api)
  → api container (FastAPI, private Compose network)
  → SQLite DB file
```

## Before exposing the API

| Step | Action |
|------|--------|
| 1 | Choose an auth mode: external auth in front of `web`, or trusted reverse proxy that injects an upstream `X-API-Key`. Do **not** bake a shared API key into static Angular files. |
| 2 | Bind the API privately or place it behind a reverse proxy with TLS and auth. Do not run `uvicorn` on `0.0.0.0` on a public host without protection. |
| 3 | Set **`CORS_ORIGINS`** to your UI origin(s) only (comma-separated). Avoid `*`. |
| 4 | **`allow_credentials=True`** is enabled in CORS today for dev; with cookie-less API keys this is harmless. If you add cookie sessions later, keep origins explicit and never combine `*` with credentials. |
| 5 | Set **`DISABLE_OPENAPI=1`** to hide `/docs` and `/redoc` on exposed hosts. |
| 6 | Optional **`RATE_LIMIT_PER_MIN=60`** to throttle `POST /api/planning/v1/runs` and import preview/commit. |
| 7 | **`ALEMBIC_STRICT=1`** (default): fail startup if migrations cannot upgrade. |

## Data & backups

- SQLite file: `backend/finance.db` (see [BACKUP.md](./BACKUP.md)).
- Copy the DB before upgrades or `make reset-db`.
- **OPS-009:** Single SQLite file = no built-in HA or replication; use file backups and one writer process.

## Docker website (localhost)

```bash
docker compose up --build
```

UI: http://127.0.0.1:8080

The API is private to the Compose network and is reached through the web
container at `/api`.

Default Docker persistence is repo-local:

```bash
data/finance.db
```

The app reads `DATABASE_URL`, so you can override the DB location:

```bash
DATABASE_URL=sqlite:////absolute/path/to/finance.db docker compose up --build
```

If the DB path is outside the repo/container default, update the Compose volume
mount too. The default bind mount is the parent data directory:

```yaml
./data:/data
```

The API container uses `sqlite:////data/finance.db`, so the SQLite database is
still a normal file on the host.

## Domain recipe with Caddy

Run Compose on the Pi, then put Caddy on the same host:

```caddyfile
finance.example.com {
  basicauth {
    your-user $2a$14$replace-with-caddy-hash
  }

  reverse_proxy 127.0.0.1:8080
}
```

Generate the password hash:

```bash
caddy hash-password
```

For this mode, keep `API_KEY` unset because Caddy protects the whole website.
If you set `API_KEY`, configure Caddy to inject it only on upstream `/api/*`
requests after user auth:

```caddyfile
handle /api/* {
  reverse_proxy 127.0.0.1:8080 {
    header_up X-API-Key {env.FINANCE_API_KEY}
  }
}
```

Static browser JavaScript should never contain the API key.

## Environment reference

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | SQLite path (default `sqlite:///./finance.db`) |
| `API_KEY` | Optional shared secret for `/api/*` |
| `CORS_ORIGINS` | Allowed browser origins |
| `RATE_LIMIT_PER_MIN` | Optional POST throttle |
| `DEBUG_HEALTH=1` | Include `cache_size` in `/api/health` (dev only; BE-017 / OPS-008) |
| `LOG_SQL` | **Avoid in prod** — logs SQL with financial row data (SEC-006) |
| `ALEMBIC_STRICT` | `1` (default) fail startup on migration errors |
| `DISABLE_OPENAPI` | `1` hides `/docs` on exposed hosts |

## Logging (OPS-011)

- Uvicorn access logs go to stdout; rotate or ship via your process manager (systemd `journald`, Docker logging driver, or a sidecar).
- Application logs use the `finance_api` logger family; set `LOG_LEVEL=WARNING` in production to reduce noise.
- Access logs redact `search=` on `/api/transactions` (SEC-007). HTTP exception handlers may still log `detail` strings (SEC-008); avoid putting user PII in raised `HTTPException` messages.

## Config validation (OPS-012)

Before go-live, confirm:

- `API_KEY` set when the API is not loopback-only.
- `CORS_ORIGINS` lists only your UI origin(s).
- `DATABASE_URL` points at a backed-up SQLite file or mounted volume.
- `ALEMBIC_STRICT=1` and startup logs show successful migration.
- `LOG_SQL` unset; `DEBUG_HEALTH` unset on exposed hosts.
- Optional `RATE_LIMIT_PER_MIN` for heavy POST endpoints.

## Current non-goals

- No app-native household login yet; use Caddy, Cloudflare Access, Tailscale, or
  another external auth layer for domain exposure.
- No automated backup job yet; the user manages backups manually for now.
- No Plaid integration planned. SimpleFIN is the likely future aggregation path.
