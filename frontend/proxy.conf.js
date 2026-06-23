/**
 * Dev server proxy — same-origin API calls (avoids CORS when using localhost or 127.0.0.1).
 * Requires environment.development.ts with apiUrl: ''.
 */
const target = process.env.API_PROXY_TARGET || 'http://127.0.0.1:8000';

/**
 * Proxy API paths only. Use a function matcher so client routes
 * (e.g. /balance-sheet) never collide with API prefixes like /assets.
 * This ensures ng serve's SPA fallback can serve index.html on full reloads.
 */
const API_PREFIXES = ['/transactions', '/holdings', '/net-worth', '/assets', '/liabilities', '/imports', '/market', '/health'];

function isApiPath(pathname) {
  return API_PREFIXES.some(p => pathname === p || pathname.startsWith(p + '/'));
}

module.exports = [{
  context: isApiPath,
  target,
  secure: false,
  changeOrigin: true,
  logLevel: 'warn',
}];