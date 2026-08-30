# Finance Tracker Frontend

Angular 19 standalone app for the encrypted client-side finance store.

Use the root project commands:

```bash
make frontend
cd frontend && npx ng build --configuration development
cd frontend && npm test -- --watch=false --browsers=ChromeHeadless
cd frontend && npm run e2e
```

Routes, shared UI conventions, and vault-era behavior are documented in
[`../docs/FRONTEND.md`](../docs/FRONTEND.md). General setup is in
[`../README.md`](../README.md).
