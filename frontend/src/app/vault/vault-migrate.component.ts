import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { EncryptedStoreService } from '../crypto/encrypted-store.service';
import { VaultService } from '../crypto/vault.service';
import { UiButtonComponent, UiCardComponent, UiPageHeaderComponent } from '../shared/ui';

@Component({
  selector: 'app-vault-migrate',
  standalone: true,
  imports: [CommonModule, UiPageHeaderComponent, UiCardComponent, UiButtonComponent],
  template: `
    <div class="page vault-page">
      <ui-page-header
        title="Encrypt existing data"
        subtitle="Your browser will download legacy plaintext, encrypt it locally, upload ciphertext, verify, then delete server plaintext." />
      <ui-card title="Migration">
        <p class="muted">
          After migration, the server cannot read your finance records. Keep your vault passphrase and recovery key safe.
        </p>
        @if (log.length) {
          <ul>
            @for (line of log; track line) {
              <li>{{ line }}</li>
            }
          </ul>
        }
        @if (error) {
          <p class="error">{{ error }}</p>
        }
        <div class="form-actions">
          <ui-button [disabled]="busy || !vault.isUnlocked" (clicked)="run()">
            {{ busy ? 'Migrating…' : 'Start migration' }}
          </ui-button>
        </div>
      </ui-card>
    </div>
  `,
  styles: [
    `
      .vault-page {
        max-width: 44rem;
      }
      .error {
        color: var(--danger);
      }
      ul {
        margin: 1rem 0;
        padding-left: 1.2rem;
      }
    `,
  ],
})
export class VaultMigrateComponent implements OnInit {
  busy = false;
  error = '';
  log: string[] = [];

  constructor(
    public vault: VaultService,
    private store: EncryptedStoreService,
    private http: HttpClient,
    private router: Router
  ) {}

  async ngOnInit(): Promise<void> {
    const status = await this.vault.refreshStatus();
    if (!status.exists) {
      await this.router.navigateByUrl('/vault/setup');
      return;
    }
    if (!this.vault.isUnlocked) {
      await this.router.navigateByUrl('/vault/unlock');
      return;
    }
    if (status.migrated) {
      await this.router.navigateByUrl('/');
    }
  }

  async run(): Promise<void> {
    this.busy = true;
    this.error = '';
    this.log = [];
    try {
      this.log.push('Marking migration in progress…');
      await firstValueFrom(this.vault.updateMigration({ status: 'in_progress' }));

      this.log.push('Encrypting legacy records in the browser…');
      const { legacy, encrypted } = await this.store.migrateFromLegacy({
        get: async <T,>(url: string) => firstValueFrom(this.http.get<T>(url)),
      });
      this.log.push(`Legacy counts: ${JSON.stringify(legacy)}`);
      this.log.push(`Encrypted counts: ${JSON.stringify(encrypted)}`);

      this.log.push('Verifying uploaded ciphertext counts…');
      const remote = await firstValueFrom(this.vault.getCounts());
      for (const [key, count] of Object.entries(encrypted)) {
        const remoteCount = remote.counts[key] ?? 0;
        if (remoteCount < count) {
          throw new Error(`Verification failed for ${key}: local ${count}, remote ${remoteCount}`);
        }
      }

      await firstValueFrom(
        this.vault.updateMigration({
          status: 'verified',
          legacy_counts: legacy,
          encrypted_counts: encrypted,
        })
      );
      this.log.push('Verified. Completing migration and deleting server plaintext…');
      await firstValueFrom(
        this.vault.updateMigration({
          status: 'completed',
          legacy_counts: legacy,
          encrypted_counts: encrypted,
        })
      );
      await this.vault.refreshStatus();
      this.log.push('Migration complete.');
      await this.router.navigateByUrl('/');
    } catch (e: any) {
      this.error = e?.error?.detail || e?.message || 'Migration failed';
      try {
        await firstValueFrom(
          this.vault.updateMigration({ status: 'failed', error_message: this.error })
        );
      } catch {
        /* ignore */
      }
    } finally {
      this.busy = false;
    }
  }
}
