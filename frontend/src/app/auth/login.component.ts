import { ChangeDetectionStrategy, ChangeDetectorRef, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';
import { UiButtonComponent, UiCardComponent, UiInputComponent } from '../shared/ui';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, UiButtonComponent, UiCardComponent, UiInputComponent],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginComponent {
  private auth = inject(AuthService);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);

  email = '';
  username = '';
  displayName = '';
  password = '';
  recoveryKey = '';
  setupMode = false;
  legacyMode = false;
  loading = false;
  error = '';

  ngOnInit(): void {
    this.auth.bootstrapStatus().subscribe({
      next: status => { this.setupMode = status.needs_setup; this.cdr.markForCheck(); },
      error: () => { this.setupMode = false; this.cdr.markForCheck(); },
    });
  }

  submit(): void {
    if (!this.canSubmit) return;
    this.loading = true;
    this.error = '';
    this.cdr.markForCheck();
    if (this.setupMode) {
      this.auth.bootstrapPasswordless(this.username, this.displayName, this.password).then(
        () => {
          this.loading = false;
          this.cdr.markForCheck();
          return this.router.navigate(['/']);
        },
        err => {
          this.error = this.errorMessage(err);
          this.loading = false;
          this.cdr.markForCheck();
        }
      );
      return;
    }
    const request = this.legacyMode ? this.auth.login(this.email, this.password) : null;
    if (!request) {
      this.auth.loginWithVault(this.username, this.password).then(
        () => {
          this.loading = false;
          this.cdr.markForCheck();
          return this.router.navigate(['/']);
        },
        err => {
          this.error = this.errorMessage(err);
          this.loading = false;
          this.cdr.markForCheck();
        }
      );
      return;
    }
    request.subscribe({
      next: () => {
        this.cdr.markForCheck();
        if (!this.legacyMode) {
          this.router.navigate(['/']);
          return;
        }
          this.auth.enrollPasswordless(this.email, this.password, this.recoveryKey).then(
          () => this.router.navigate(['/']),
          () => {
            this.error = 'Signed in, but vault authentication enrollment failed. Try the migration again.';
            this.loading = false;
            this.cdr.markForCheck();
          }
        );
      },
      error: err => {
        this.error = this.errorMessage(err);
        this.loading = false;
        this.cdr.markForCheck();
      },
    });
  }

  toggleLegacyMode(): void {
    this.legacyMode = !this.legacyMode;
    this.error = '';
  }

  get needsDisplayName(): boolean {
    return this.setupMode;
  }

  get canSubmit(): boolean {
    if (this.loading || !(this.legacyMode ? this.email.trim() : this.username.trim()) || !this.password) return false;
    if (this.needsDisplayName && !this.displayName.trim()) return false;
    if (this.legacyMode && !this.recoveryKey.trim()) return false;
    if (this.needsDisplayName && this.password.length < 12) return false;
    return true;
  }

  get passwordHint(): string {
    if (this.needsDisplayName) {
      return 'Use at least 12 characters. Username + vault passphrase sign you in and unlock finance data on any browser. Admins cannot reset your vault.';
    }
    if (this.legacyMode) {
      return 'One-time only: sign in with the old password, then enroll vault authentication with a new recovery key. Day-to-day sign-in is username + vault passphrase.';
    }
    return 'Sign in with username and vault passphrase. If you forget the passphrase, use your recovery key on Unlock vault—nobody else can reset access.';
  }

  private errorMessage(err: any): string {
    if (err instanceof Error && err.message) return err.message;
    const detail = err?.error?.detail;
    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail) && detail.length) {
      return detail
        .map(item => {
          const field = Array.isArray(item?.loc) ? item.loc[item.loc.length - 1] : null;
          const message = item?.msg || 'Invalid value';
          return field ? `${field}: ${message}` : message;
        })
        .join('; ');
    }
    return this.setupMode ? 'Setup failed' : this.legacyMode ? 'Login failed' : 'Vault authentication failed';
  }
}
