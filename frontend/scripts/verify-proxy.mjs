#!/usr/bin/env node
/**
 * Quick check: dev server proxies /api/* to FastAPI.
 * Usage: node scripts/verify-proxy.mjs [port]
 */
const port = Number(process.argv[2] || 4200);
const base = `http://127.0.0.1:${port}`;

async function check(path, parseJson = false) {
  const url = `${base}${path}`;
  const res = await fetch(url);
  const ct = res.headers.get('content-type') || '';
  const text = await res.text();
  let ok = res.ok && ct.includes('application/json');
  if (ok && parseJson) {
    try {
      JSON.parse(text);
    } catch {
      ok = false;
    }
  }
  if (ok && path.includes('health')) {
    ok = text.includes('"status"');
  }
  return { url, status: res.status, ct, ok, text: text.slice(0, 120) };
}

const health = await check('/api/health');
const tx = await check('/api/transactions/?limit=1', true);

console.log('Dev proxy check (port %s)\n', port);
for (const r of [health, tx]) {
  console.log(r.ok ? 'OK' : 'FAIL', r.status, r.ct, r.url);
  if (!r.ok) console.log('  body:', r.text);
}

if (!health.ok || !tx.ok) {
  console.log('\nFix: stop ng serve, run `make dev` or `npm start`, then retry.');
  process.exit(1);
}
console.log('\nProxy OK — dashboard API calls should work.');