import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, firstValueFrom, Observable } from 'rxjs';
import { apiUrl } from '../core/api-url';
import {
  createVaultMaterial,
  decryptJson,
  encryptJson,
  hmacBlindIndex,
  rewrapDekWithPassphrase,
  unlockWithPassphrase,
  unlockWithRecoveryKey,
} from './vault-crypto';

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

@Injectable({ providedIn: 'root' })
export class VaultService {
  private dek: CryptoKey | null = null;
  private statusSubject = new BehaviorSubject<VaultStatus | null>(null);
  private unlockedSubject = new BehaviorSubject<boolean>(false);
  private lastRecoveryKey: string | null = null;

  readonly status$ = this.statusSubject.asObservable();
  readonly unlocked$ = this.unlockedSubject.asObservable();

  constructor(private http: HttpClient) {}

  get isUnlocked(): boolean {
    return this.unlockedSubject.value && !!this.dek;
  }

  get isMigrated(): boolean {
    return !!this.statusSubject.value?.migrated;
  }

  get usesEncryptedStore(): boolean {
    return this.isUnlocked && this.isMigrated;
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
    const wraps = await rewrapDekWithPassphrase(dek, newPassphrase, status.kdf_iterations);
    const updated = await firstValueFrom(
      this.http.put<VaultStatus>(apiUrl('/vault/wraps'), wraps)
    );
    this.statusSubject.next(updated);
    this.dek = dek;
    this.unlockedSubject.next(true);
  }

  requireDek(): CryptoKey {
    if (!this.dek) throw new Error('Vault is locked');
    return this.dek;
  }

  async encryptPayload(value: unknown): Promise<string> {
    return encryptJson(this.requireDek(), value);
  }

  async decryptPayload<T>(ciphertextB64: string): Promise<T> {
    return decryptJson<T>(this.requireDek(), ciphertextB64);
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

  deleteRecords(records: Array<{ collection: string; client_id: string }>): Observable<{ deleted: number }> {
    return this.http.post<{ deleted: number }>(apiUrl('/vault/records/delete'), { records });
  }

  updateMigration(body: {
    status: string;
    legacy_counts?: Record<string, number>;
    encrypted_counts?: Record<string, number>;
    error_message?: string;
  }): Observable<{ status: string }> {
    return this.http.put<{ status: string }>(apiUrl('/vault/migration'), body);
  }

  getCounts(): Observable<{ counts: Record<string, number> }> {
    return this.http.get<{ counts: Record<string, number> }>(apiUrl('/vault/counts'));
  }
}
