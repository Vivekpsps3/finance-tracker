import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, firstValueFrom, Observable } from 'rxjs';
import { apiUrl } from '../core/api-url';
import {
  createVaultMaterial,
  decryptJson,
  encryptJson,
  hmacBlindIndex,
  recordAad,
  rewrapDekWithPassphrase,
  unlockWithPassphrase,
  unlockWithRecoveryKey,
} from './vault-crypto';
import { rewrapSigningKeyWithPassphrase, WrappedSigningKey } from './auth-crypto';

export interface VaultStatus {
  exists: boolean;
  kdf_algorithm?: string | null;
  kdf_salt_b64?: string | null;
  kdf_iterations?: number | null;
  wrapped_dek_b64?: string | null;
  recovery_wrapped_dek_b64?: string | null;
  key_version?: number | null;
  migration_status: string;
  migrated: boolean;
}

export interface EncryptedRecordDto {
  collection: string;
  client_id: string;
  ciphertext_b64: string;
  schema_version: number;
  key_version: number;
  revision: number;
  updated_at: string;
}

export interface LegacyMigrationExport {
  counts: Record<string, number>;
  records: Array<{ collection: string; data: Record<string, unknown> }>;
}

@Injectable({ providedIn: 'root' })
export class VaultService {
  private dek: CryptoKey | null = null;
  private statusSubject = new BehaviorSubject<VaultStatus | null>(null);
  private unlockedSubject = new BehaviorSubject<boolean>(false);
  private lastRecoveryKey: string | null = null;
  private authWrap: WrappedSigningKey | null = null;

  readonly status$ = this.statusSubject.asObservable();
  readonly unlocked$ = this.unlockedSubject.asObservable();

  constructor(private http: HttpClient) {}

  get isUnlocked(): boolean {
    return this.unlockedSubject.value && !!this.dek;
  }

  get usesEncryptedStore(): boolean {
    // All users are on the encrypted path once the vault is unlocked.
    return this.isUnlocked;
  }

  get currentStatus(): VaultStatus | null {
    return this.statusSubject.value;
  }

  /** Shown once after setup; caller must display then clear. */
  consumeRecoveryKey(): string | null {
    const key = this.lastRecoveryKey;
    this.lastRecoveryKey = null;
    return key;
  }

  async refreshStatus(): Promise<VaultStatus> {
    const status = await firstValueFrom(this.http.get<VaultStatus>(apiUrl('/vault/status')));
    this.statusSubject.next(status);
    return status;
  }

  loadPublicStatus(status: VaultStatus | Omit<VaultStatus, 'exists' | 'migration_status' | 'migrated'> & Partial<VaultStatus>): void {
    const hasWraps = !!(status.kdf_salt_b64 && status.wrapped_dek_b64 && status.kdf_iterations);
    this.statusSubject.next({
      exists: status.exists ?? hasWraps,
      migration_status: status.migration_status ?? (hasWraps ? 'complete' : 'none'),
      migrated: status.migrated ?? hasWraps,
      kdf_algorithm: status.kdf_algorithm ?? null,
      kdf_salt_b64: status.kdf_salt_b64 ?? null,
      kdf_iterations: status.kdf_iterations ?? null,
      wrapped_dek_b64: status.wrapped_dek_b64 ?? null,
      recovery_wrapped_dek_b64: status.recovery_wrapped_dek_b64 ?? null,
      key_version: status.key_version ?? null,
    });
  }

  loadAuthWrap(wrap: WrappedSigningKey): void {
    this.authWrap = wrap;
  }

  lock(): void {
    this.dek = null;
    this.unlockedSubject.next(false);
  }

  async setup(passphrase: string): Promise<{ recoveryKey: string }> {
    const material = await createVaultMaterial(passphrase);
    const status = await firstValueFrom(
      this.http.post<VaultStatus>(apiUrl('/vault/setup'), material.setupPayload)
    );
    this.statusSubject.next(status);
    this.dek = material.dek;
    this.unlockedSubject.next(true);
    this.lastRecoveryKey = material.recoveryKey;
    return { recoveryKey: material.recoveryKey };
  }

  /** Completes an atomically-created vault after passwordless account bootstrap. */
  async adoptBootstrapVault(dek: CryptoKey, recoveryKey: string): Promise<void> {
    await this.refreshStatus();
    this.dek = dek;
    this.unlockedSubject.next(true);
    this.lastRecoveryKey = recoveryKey;
  }

  async unlock(passphrase: string): Promise<void> {
    const status = this.statusSubject.value ?? (await this.refreshStatus());
    if (!status.exists || !status.kdf_salt_b64 || !status.wrapped_dek_b64 || !status.kdf_iterations) {
      throw new Error('Vault is not set up');
    }
    this.dek = await unlockWithPassphrase(
      passphrase,
      status.kdf_salt_b64,
      status.kdf_iterations,
      status.wrapped_dek_b64
    );
    this.unlockedSubject.next(true);
  }

  async unlockWithRecovery(recoveryKey: string, newPassphrase: string): Promise<void> {
    const status = this.statusSubject.value ?? (await this.refreshStatus());
    if (!status.exists || !status.recovery_wrapped_dek_b64 || !status.kdf_iterations) {
      throw new Error('Vault is not set up');
    }
    const dek = await unlockWithRecoveryKey(
      recoveryKey,
      status.recovery_wrapped_dek_b64,
      status.kdf_iterations
    );
    if (!this.authWrap) throw new Error('Vault authentication material is unavailable; sign in again before recovering your passphrase');
    const wraps = await rewrapDekWithPassphrase(dek, newPassphrase, status.kdf_iterations);
    const authWrap = await rewrapSigningKeyWithPassphrase(recoveryKey, this.authWrap, newPassphrase);
    const updated = await firstValueFrom(
      this.http.put<VaultStatus>(apiUrl('/vault/wraps'), wraps)
    );
    await firstValueFrom(this.http.put(apiUrl('/auth/passwordless/wraps'), authWrap));
    this.statusSubject.next(updated);
    this.authWrap = authWrap;
    this.dek = dek;
    this.unlockedSubject.next(true);
  }

  requireDek(): CryptoKey {
    if (!this.dek) throw new Error('Vault is locked');
    return this.dek;
  }

  async encryptPayload(
    value: unknown,
    collection: string,
    clientId: string,
    schemaVersion: number,
    keyVersion: number
  ): Promise<string> {
    return encryptJson(this.requireDek(), value, this.recordAdditionalData(collection, clientId, schemaVersion, keyVersion));
  }

  async decryptPayload<T>(
    ciphertextB64: string,
    collection: string,
    clientId: string,
    schemaVersion: number,
    keyVersion: number
  ): Promise<T> {
    return decryptJson<T>(
      this.requireDek(),
      ciphertextB64,
      this.recordAdditionalData(collection, clientId, schemaVersion, keyVersion)
    );
  }

  private recordAdditionalData(
    collection: string,
    clientId: string,
    schemaVersion: number,
    keyVersion: number
  ): Uint8Array | undefined {
    if (schemaVersion === 1) return undefined;
    if (schemaVersion === 2) return recordAad(collection, clientId, schemaVersion, keyVersion);
    throw new Error(`Unsupported record schema version: ${schemaVersion}`);
  }

  async blindIndex(value: string): Promise<string> {
    return hmacBlindIndex(this.requireDek(), value);
  }

  listRecords(collection?: string): Observable<EncryptedRecordDto[]> {
    const q = collection ? `?collection=${encodeURIComponent(collection)}` : '';
    return this.http.get<EncryptedRecordDto[]>(apiUrl(`/vault/records${q}`));
  }

  upsertRecords(
    records: Array<{
      collection: string;
      client_id: string;
      ciphertext_b64: string;
      schema_version?: number;
      key_version?: number;
      expected_revision?: number | null;
      indexes?: Array<{ index_name: string; index_value_b64: string }>;
    }>
  ): Observable<EncryptedRecordDto[]> {
    return this.http.post<EncryptedRecordDto[]>(apiUrl('/vault/records/upsert'), { records });
  }

  deleteRecords(
    records: Array<{ collection: string; client_id: string; expected_revision: number }>
  ): Observable<{ deleted: number }> {
    return this.http.post<{ deleted: number }>(apiUrl('/vault/records/delete'), { records });
  }

  getCounts(): Observable<{ counts: Record<string, number> }> {
    return this.http.get<{ counts: Record<string, number> }>(apiUrl('/vault/counts'));
  }

  exportLegacyRecords(): Observable<LegacyMigrationExport> {
    return this.http.get<LegacyMigrationExport>(apiUrl('/vault/migration/export'));
  }

  completeLegacyMigration(
    counts: Record<string, number>,
    records: Array<{ collection: string; client_id: string }>
  ): Observable<{ status: string }> {
    return this.http.post<{ status: string }>(apiUrl('/vault/migration/complete'), { counts, records });
  }
}
