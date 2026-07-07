import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { VaultService } from '../crypto/vault.service';
import { UiButtonComponent, UiCardComponent, UiPageHeaderComponent } from '../shared/ui';

@Component({
  selector: 'app-vault-unlock',
  standalone: true,
  imports: [CommonModule, FormsModule, UiPageHeaderComponent, UiCardComponent, UiButtonComponent],
  template: `
    <div class="page vault-page">
      <ui-page-header
        title="Unlock vault"
        subtitle="Decrypt your finance data in this browser session. Nothing sensitive is sent to the server." />
      <ui-card [title]="mode === 'passphrase' ? 'Passphrase' : 'Recovery key'">
        @if (mode === 'passphrase') {
          <label>
            Vault passphrase
            <input type="password" [(ngModel)]="passphrase" autocomplete="current-password" />
          </label>
        } @else {
          <label>
            Recovery key
            <input type="text" [(ngModel)]="recoveryKey" autocomplete="off" />
          </label>
          <label>
            New vault passphrase
            <input type="password" [(ngModel)]="passphrase" autocomplete="new-password" />
          </label>
        }
        @if (error) {
          <p class="error">{{ error }}</p>
        }
        <div class="form-actions">
          <ui-button [disabled]="busy" (clicked)="unlock()">Unlock</ui-button>
          <ui-button variant="ghost" (clicked)="toggleMode()">
            {{ mode === 'passphrase' ? 'Use recovery key' : 'Use passphrase' }}
          </ui-button>
        </div>
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
    `,
  ],
})
export class VaultUnlockComponent implements OnInit {
  mode: 'passphrase' | 'recovery' = 'passphrase';
  passphrase = '';
  recoveryKey = '';
  error = '';
  busy = false;

  constructor(
    private vault: VaultService,
    private router: Router
  ) {}

  async ngOnInit(): Promise<void> {
    const status = await this.vault.refreshStatus();
    if (!status.exists) {
      await this.router.navigateByUrl('/vault/setup');
      return;
    }
    if (this.vault.isUnlocked) {
      await this.router.navigateByUrl(status.migrated ? '/' : '/vault/migrate');
    }
  }

  toggleMode(): void {
    this.mode = this.mode === 'passphrase' ? 'recovery' : 'passphrase';
    this.error = '';
  }

  async unlock(): Promise<void> {
    this.error = '';
    this.busy = true;
    try {
      if (this.mode === 'passphrase') {
        await this.vault.unlock(this.passphrase);
      } else {
        if (this.passphrase.length < 12) throw new Error('New passphrase must be at least 12 characters');
        await this.vault.unlockWithRecovery(this.recoveryKey.trim(), this.passphrase);
      }
      const status = await this.vault.refreshStatus();
      await this.router.navigateByUrl(status.migrated ? '/' : '/vault/migrate');
    } catch (e: any) {
      this.error = e?.error?.detail || e?.message || 'Unlock failed';
    } finally {
      this.busy = false;
    }
  }
}
