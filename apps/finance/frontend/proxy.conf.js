/**
 * Dev proxy (Vite / Angular 19+). Frontend uses apiUrl: '/api' so SPA routes
 * (/transactions, /planning, etc.) never collide with API paths.
 */
const target = process.env.API_PROXY_TARGET || 'http://127.0.0.1:8000';

const common = {
  target,
  secure: false,
  changeOrigin: true,
};

module.exports = {
  '/api': common,
  '/api/**': common,
};