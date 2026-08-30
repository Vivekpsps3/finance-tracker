import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { createSigningKey, signChallenge, type WrappedSigningKey } from '@vivek/auth';

@Component({
  selector: 'app-login',
  imports: [FormsModule],
  styles: [`
    main { min-height: 100dvh; display: grid; place-items: center; padding: 32px; }
    form { display: flex; flex-direction: column; gap: 16px; width: min(100%, 22rem); }
  `],
  template: `
    <main>
      <form class="ui-card" (ngSubmit)="submit()">
        <h1 class="ui-card__title">{{ needsSetup ? 'Create unlock' : 'Unlock' }}</h1>
        <label>Username <input name="username" [(ngModel)]="username" autocomplete="username" /></label>
        <label>Passphrase <input name="passphrase" type="password" [(ngModel)]="passphrase" autocomplete="current-password" /></label>
        @if (error) { <p style="color: var(--danger)">{{ error }}</p> }
        <button class="ui-btn ui-btn--primary ui-btn--md" type="submit">Unlock</button>
      </form>
    </main>
  `,
})
export class LoginComponent {
  private http = inject(HttpClient);
  private router = inject(Router);
  username = '';
  passphrase = '';
  error = '';
  needsSetup = false;

  constructor() {
    firstValueFrom(this.http.get<{ needs_setup: boolean }>('/api/auth/bootstrap-status'))
      .then(s => (this.needsSetup = s.needs_setup))
      .catch(() => (this.needsSetup = false));
  }

  async submit() {
    this.error = '';
    const username = this.username.trim().toLowerCase();
    try {
      if (this.needsSetup) {
        const key = await createSigningKey(this.passphrase);
        await firstValueFrom(
          this.http.post('/api/auth/bootstrap/passwordless', {
            username,
            public_key_b64: key.publicKeyB64,
            auth: key.wrapped,
          })
        );
      } else {
        const lookup = await firstValueFrom(
          this.http.post<{ auth: WrappedSigningKey }>('/api/auth/passwordless/lookup', { username })
        );
        const challenge = await firstValueFrom(
          this.http.post<{ challenge_id: string; challenge: string; message: string }>(
            '/api/auth/passwordless/challenge',
            { username }
          )
        );
        const signature_b64 = await signChallenge(this.passphrase, lookup.auth, challenge.message);
        await firstValueFrom(
          this.http.post('/api/auth/passwordless/verify', {
            username,
            challenge_id: challenge.challenge_id,
            challenge: challenge.challenge,
            message: challenge.message,
            signature_b64,
          })
        );
      }
      await this.router.navigateByUrl('/');
    } catch {
      this.error = 'Could not unlock.';
    }
  }
}
