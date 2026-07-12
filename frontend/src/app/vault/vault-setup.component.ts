import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { VaultService } from '../crypto/vault.service';
import { UiButtonComponent, UiCardComponent, UiPageHeaderComponent } from '../shared/ui';

@Component({
  selector: 'app-vault-setup',
  standalone: true,
  imports: [CommonModule, FormsModule, UiPageHeaderComponent, UiCardComponent, UiButtonComponent],
  template: `
    <div class="page vault-page">
      <ui-page-header
        title="Create your vault"
        subtitle="Your finance data is encrypted in the browser. The server only stores ciphertext." />
      <ui-card title="Vault passphrase">
          <p class="muted">
            Choose a strong vault passphrase. Together with your username it signs you in and unlocks encrypted
            finance data on any browser. If you lose both the passphrase and recovery key, your data cannot be
            recovered—administrators cannot reset vault access.
          </p>
        <label>
          Vault passphrase
          <input type="password" [(ngModel)]="passphrase" autocomplete="new-password" minlength="12" />
        </label>
        <label>
          Confirm passphrase
          <input type="password" [(ngModel)]="confirm" autocomplete="new-password" minlength="12" />
        </label>
        @if (error) {
          <p class="error" role="alert">{{ error }}</p>
        }
        @if (recoveryKey) {
          <div class="recovery">
            <strong>Save this recovery key now</strong>
             <code>{{ recoveryKey }}</code>
             <p class="muted">It will not be shown again. Store it offline.</p>
            <div class="form-actions">
              <ui-button variant="secondary" (clicked)="copyRecoveryKey()">Copy recovery key</ui-button>
              <ui-button variant="secondary" (clicked)="downloadRecoveryKey()">Download recovery key</ui-button>
            </div>
            @if (recoveryAction) {
              <p class="muted" role="status">{{ recoveryAction }}</p>
            }
            <label class="acknowledgement">
              <input type="checkbox" [(ngModel)]="recoveryAcknowledged" />
              <span>I saved this key somewhere I can access without this app.</span>
            </label>
            <ui-button [disabled]="!recoveryAcknowledged" (clicked)="continueAfterRecovery()">Continue</ui-button>
          </div>
        } @else {
          <div class="form-actions">
            <ui-button [disabled]="busy" (clicked)="setup()">Create vault</ui-button>
          </div>
        }
      </ui-card>
    </div>
  `,
  styles: [
    `
      .vault-page {
        max-width: 40rem;
      }
      label {
        display: grid;
        gap: 0.4rem;
        margin: 1rem 0;
      }
      .error {
        color: var(--danger);
      }
      .recovery {
        display: grid;
        gap: 0.75rem;
        margin-top: 1rem;
        padding: 1rem;
        border: 1px solid var(--border);
        border-radius: 12px;
      }
      code {
        word-break: break-all;
        font-size: 1rem;
      }
    `,
  ],
})
export class VaultSetupComponent implements OnInit {
  passphrase = '';
  confirm = '';
  error = '';
  busy = false;
  recoveryKey = '';
  recoveryAcknowledged = false;
  recoveryAction = '';

  constructor(
    private vault: VaultService,
    private router: Router
  ) {}

  async ngOnInit(): Promise<void> {
    const status = await this.vault.refreshStatus();
    if (status.exists) {
      await this.router.navigateByUrl('/vault/unlock');
    }
  }

  async setup(): Promise<void> {
    this.error = '';
    if (this.passphrase.length < 12) {
      this.error = 'Passphrase must be at least 12 characters.';
      return;
    }
    if (this.passphrase !== this.confirm) {
      this.error = 'Passphrases do not match.';
      return;
    }
    this.busy = true;
    try {
      const { recoveryKey } = await this.vault.setup(this.passphrase);
      this.recoveryKey = recoveryKey;
    } catch (e: any) {
      this.error = e?.error?.detail || e?.message || 'Vault setup failed';
    } finally {
      this.busy = false;
    }
  }

  async continueAfterRecovery(): Promise<void> {
    await this.vault.refreshStatus();
    await this.router.navigateByUrl('/');
  }

  async copyRecoveryKey(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.recoveryKey);
      this.recoveryAction = 'Recovery key copied. Paste it into an offline password manager or document.';
    } catch {
      this.recoveryAction = 'Copy is unavailable in this browser. Select the key and store it offline.';
    }
  }

  downloadRecoveryKey(): void {
    const blob = new Blob([`Finance recovery key\n\n${this.recoveryKey}\n`], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'finance-recovery-key.txt';
    link.click();
    URL.revokeObjectURL(url);
    this.recoveryAction = 'Recovery key download created. Store the file offline.';
  }
}
