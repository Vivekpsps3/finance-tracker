/**
 * Dev server proxy — same-origin API calls (avoids CORS when using localhost or 127.0.0.1).
 * Requires environment.development.ts with apiUrl: ''.
 */
const target = process.env.API_PROXY_TARGET || 'http://127.0.0.1:8000';

const paths = ['/transactions', '/holdings', '/net-worth', '/imports', '/market', '/health'];

module.exports = paths.map((context) => ({
  context: [context],
  target,
  secure: false,
  changeOrigin: true,
  logLevel: 'warn',
}));