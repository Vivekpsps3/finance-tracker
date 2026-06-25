import { environment } from '../../environments/environment';

/** Dev default `/api` — proxied to FastAPI; avoids clashing with SPA routes. */
export function apiBaseUrl(): string {
  return (environment.apiUrl || '').replace(/\/$/, '');
}

export function apiUrl(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`;
  const base = apiBaseUrl();
  return base ? `${base}${p}` : p;
}