import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from './auth.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const mutating = !['GET', 'HEAD', 'OPTIONS'].includes(req.method.toUpperCase());
  const headers = mutating && auth.csrfToken ? req.headers.set('X-CSRF-Token', auth.csrfToken) : req.headers;
  const authReq = req.clone({ withCredentials: true, headers });
  return next(authReq).pipe(
    catchError((err: HttpErrorResponse) => {
      const isAuthAttempt =
        req.url.includes('/auth/login') ||
        req.url.includes('/auth/passwordless') ||
        req.url.includes('/auth/bootstrap') ||
        req.url.includes('/auth/invitations') ||
        req.url.includes('/health');
      if (err.status === 401 && !isAuthAttempt) {
        auth.clearLocalSession();
        router.navigate(['/login']);
      }
      return throwError(() => err);
    })
  );
};
