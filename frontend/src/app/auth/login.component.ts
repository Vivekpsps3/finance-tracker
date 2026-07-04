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
    if (!this.email.trim() || !this.password || (this.setupMode && !this.displayName.trim())) return;
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
        this.error = err?.error?.detail || (this.setupMode ? 'Setup failed' : this.signupMode ? 'Signup failed' : 'Login failed');
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

  get passwordHint(): string {
    return this.needsDisplayName ? 'Use at least 12 characters.' : '';
  }
}

