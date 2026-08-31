import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { HttpInterceptorFn, provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';

const csrfInterceptor: HttpInterceptorFn = (req, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    const match = document.cookie.match(/(?:^|;\s*)me_csrf=([^;]*)/);
    if (match) {
      req = req.clone({ setHeaders: { 'X-CSRF-Token': decodeURIComponent(match[1]) } });
    }
  }
  return next(req);
};

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideHttpClient(withFetch(), withInterceptors([csrfInterceptor])),
  ],
};
