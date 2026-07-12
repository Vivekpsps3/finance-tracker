import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from './auth.service';
import { UiButtonComponent, UiCardComponent, UiInputComponent } from '../shared/ui';

@Component({
  selector: 'app-signup',
  standalone: true,
  imports: [FormsModule, RouterLink, UiButtonComponent, UiCardComponent, UiInputComponent],
  templateUrl: './signup.component.html',
  styleUrl: './login.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SignupComponent implements OnInit {
  private auth = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private cdr = inject(ChangeDetectorRef);

  token = '';
  passphrase = '';
  confirmPassphrase = '';
  recoveryKey = '';
  loading = false;
  error = '';

  ngOnInit(): void {
    this.token = this.route.snapshot.queryParamMap.get('token') || '';
    this.route.queryParamMap.subscribe(params => {
      this.token = params.get('token') || this.token;
      this.cdr.markForCheck();
    });
  }

  get canSubmit(): boolean {
    return (
      !this.loading &&
      !this.recoveryKey &&
      this.token.trim().length > 0 &&
      this.passphrase.length >= 12 &&
      this.passphrase === this.confirmPassphrase
    );
  }

  submit(): void {
    if (!this.canSubmit) return;
    this.loading = true;
    this.error = '';
    this.cdr.markForCheck();
    this.auth.enrollInvitation(this.token.trim(), this.passphrase).then(
      recoveryKey => {
        this.recoveryKey = recoveryKey;
        this.loading = false;
        this.cdr.markForCheck();
      },
      err => {
        this.error = this.errorMessage(err);
        this.loading = false;
        this.cdr.markForCheck();
      }
    );
  }

  finish(): void {
    void this.router.navigate(['/']);
  }

  private errorMessage(err: any): string {
    if (err instanceof Error && err.message) return err.message;
    const detail = err?.error?.detail;
    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail) && detail.length) {
      return detail.map((item: any) => item?.msg || 'Invalid value').join('; ');
    }
    return 'Invitation signup failed. Check the token and try again.';
  }
}
