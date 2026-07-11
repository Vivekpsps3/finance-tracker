import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, catchError, map, of, tap } from 'rxjs';
import { Router } from '@angular/router';
import { apiUrl } from '../core/api-url';
import { AuthUser, LoginResponse, MeResponse } from './auth.models';
import { FinanceService } from '../services/finance.service';
import { createSigningKey, signChallenge, WrappedSigningKey } from '../crypto/auth-crypto';
import { createVaultMaterial } from '../crypto/vault-crypto';
import { VaultService } from '../crypto/vault.service';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private router = inject(Router);
  private finance = inject(FinanceService);
  private vault = inject(VaultService);
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

  async bootstrapPasswordless(username: string, displayName: string, vaultPassphrase: string): Promise<AuthUser> {
    const normalized = username.trim().toLowerCase();
    const vaultMaterial = await createVaultMaterial(vaultPassphrase);
    const signingMaterial = await createSigningKey(vaultPassphrase, vaultMaterial.recoveryKey);
    const response = await this.http.post<LoginResponse>(apiUrl('/auth/bootstrap/passwordless'), {
      username: normalized,
      display_name: displayName.trim(),
      public_key_b64: signingMaterial.publicKeyB64,
      vault: vaultMaterial.setupPayload,
      auth: signingMaterial.wrapped,
    }, { withCredentials: true }).toPromise();
    if (!response) throw new Error('Unable to create passwordless account');
    await this.vault.adoptBootstrapVault(vaultMaterial.dek, vaultMaterial.recoveryKey);
    this.checkedSession = true;
    this.finance.clearSessionState();
    this.userSubject.next(response.user);
    return response.user;
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
      .post<LoginResponse>(apiUrl('/auth/login/migrate'), { email, password }, { withCredentials: true })
      .pipe(
        tap(res => {
          this.checkedSession = true;
          this.finance.clearSessionState();
          this.userSubject.next(res.user);
        }),
        map(res => res.user)
      );
  }

  async enrollPasswordless(username: string, vaultPassphrase: string, recoveryKey: string): Promise<void> {
    const material = await createSigningKey(vaultPassphrase, recoveryKey);
    await this.http.post(apiUrl('/auth/passwordless/enroll'), {
      username,
      public_key_b64: material.publicKeyB64,
      auth: material.wrapped,
    }, { withCredentials: true }).toPromise();
  }

  async loginWithVault(username: string, vaultPassphrase: string): Promise<AuthUser> {
    const normalized = username.trim().toLowerCase();
    const lookup = await this.http.post<{ vault: import('../crypto/vault.service').VaultStatus; auth: WrappedSigningKey }>(
      apiUrl('/auth/passwordless/lookup'), { username: normalized }, { withCredentials: true }
    ).toPromise();
    if (!lookup) throw new Error('Unable to retrieve vault authentication material');
    this.vault.loadPublicStatus(lookup.vault);
    this.vault.loadAuthWrap(lookup.auth);
    const challenge = await this.http.post<{ challenge_id: string; challenge: string; message: string }>(
      apiUrl('/auth/passwordless/challenge'), { username: normalized }, { withCredentials: true }
    ).toPromise();
    if (!challenge) throw new Error('Unable to request vault authentication challenge');
    const signature_b64 = await signChallenge(vaultPassphrase, lookup.auth, challenge.message);
    const response = await this.http.post<LoginResponse>(apiUrl('/auth/passwordless/verify'), {
      username: normalized,
      challenge_id: challenge.challenge_id,
      challenge: challenge.challenge,
      message: challenge.message,
      signature_b64,
    }, { withCredentials: true }).toPromise();
    if (!response) throw new Error('Unable to complete vault authentication');
    this.checkedSession = true;
    this.finance.clearSessionState();
    this.userSubject.next(response.user);
    try {
      await this.vault.unlock(vaultPassphrase);
    } catch (error) {
      this.clearLocalSession();
      throw new Error('Vault authentication succeeded, but this passphrase cannot unlock the vault.');
    }
    return response.user;
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
