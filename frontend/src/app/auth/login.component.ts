import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
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

  email = '';
  displayName = '';
  password = '';
  setupMode = false;
  signupMode = false;
  loading = false;
  error = '';

  ngOnInit(): void {
    this.auth.bootstrapStatus().subscribe({
      next: status => this.setupMode = status.needs_setup,
      error: () => this.setupMode = false,
    });
  }

  submit(): void {
    if (!this.canSubmit) return;
    this.loading = true;
    this.error = '';
    const request = this.setupMode
      ? this.auth.bootstrap(this.email, this.displayName, this.password)
      : this.signupMode
        ? this.auth.signup(this.email, this.displayName, this.password)
        : this.auth.login(this.email, this.password);
    request.subscribe({
      next: () => this.router.navigate(['/']),
      error: err => {
        this.error = this.errorMessage(err);
        this.loading = false;
      },
    });
  }

  toggleSignup(): void {
    if (this.setupMode) return;
    this.signupMode = !this.signupMode;
    this.error = '';
  }

  get needsDisplayName(): boolean {
    return this.setupMode || this.signupMode;
  }

  get canSubmit(): boolean {
    if (this.loading || !this.email.trim() || !this.password) return false;
    if (this.needsDisplayName && !this.displayName.trim()) return false;
    if (this.needsDisplayName && this.password.length < 12) return false;
    return true;
  }

  get passwordHint(): string {
    return this.needsDisplayName ? 'Use at least 12 characters.' : '';
  }

  private errorMessage(err: any): string {
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
    return this.setupMode ? 'Setup failed' : this.signupMode ? 'Signup failed' : 'Login failed';
  }
}
