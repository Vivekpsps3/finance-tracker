import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, catchError, map, of, tap } from 'rxjs';
import { Router } from '@angular/router';
import { apiUrl } from '../core/api-url';
import { AuthUser, LoginResponse, MeResponse } from './auth.models';
import { FinanceService } from '../services/finance.service';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private router = inject(Router);
  private finance = inject(FinanceService);
  private userSubject = new BehaviorSubject<AuthUser | null>(null);
  private checkedSession = false;

  readonly user$ = this.userSubject.asObservable();

  get currentUser(): AuthUser | null {
    return this.userSubject.value;
  }

  get csrfToken(): string | null {
    return readCookie('finance_csrf');
  }

  isAdmin(): boolean {
    return this.currentUser?.role === 'admin';
  }

  loadSession(): Observable<AuthUser | null> {
    if (this.checkedSession) {
      return of(this.currentUser);
    }
    return this.http.get<MeResponse>(apiUrl('/auth/me'), { withCredentials: true }).pipe(
      tap(res => {
        this.checkedSession = true;
        this.finance.clearSessionState();
        this.userSubject.next(res.user);
      }),
      map(res => res.user),
      catchError(() => {
        this.checkedSession = true;
        this.finance.clearSessionState();
        this.userSubject.next(null);
        return of(null);
      })
    );
  }

  bootstrapStatus(): Observable<{ needs_setup: boolean }> {
    return this.http.get<{ needs_setup: boolean }>(apiUrl('/auth/bootstrap-status'), { withCredentials: true });
  }

  bootstrap(email: string, displayName: string, password: string): Observable<AuthUser> {
    return this.http
      .post<LoginResponse>(apiUrl('/auth/bootstrap'), { email, display_name: displayName, password }, { withCredentials: true })
      .pipe(
        tap(res => {
          this.checkedSession = true;
          this.finance.clearSessionState();
          this.userSubject.next(res.user);
        }),
        map(res => res.user)
      );
  }

  signup(email: string, displayName: string, password: string): Observable<AuthUser> {
    return this.http
      .post<LoginResponse>(apiUrl('/auth/signup'), { email, display_name: displayName, password }, { withCredentials: true })
      .pipe(
        tap(res => {
          this.checkedSession = true;
          this.finance.clearSessionState();
          this.userSubject.next(res.user);
        }),
        map(res => res.user)
      );
  }

  login(email: string, password: string): Observable<AuthUser> {
    return this.http
      .post<LoginResponse>(apiUrl('/auth/login'), { email, password }, { withCredentials: true })
      .pipe(
        tap(res => {
          this.checkedSession = true;
          this.finance.clearSessionState();
          this.userSubject.next(res.user);
        }),
        map(res => res.user)
      );
  }

  logout(): void {
    this.http.post(apiUrl('/auth/logout'), {}, { withCredentials: true }).subscribe({
      next: () => this.finishLogout(),
      error: () => this.finishLogout(),
    });
  }

  clearLocalSession(): void {
    this.checkedSession = true;
    this.finance.clearSessionState();
    this.userSubject.next(null);
  }

  private finishLogout(): void {
    this.clearLocalSession();
    this.router.navigate(['/login']);
  }
}

function readCookie(name: string): string | null {
  const prefix = `${name}=`;
  return document.cookie
    .split(';')
    .map(part => part.trim())
    .find(part => part.startsWith(prefix))
    ?.slice(prefix.length) ?? null;
}
