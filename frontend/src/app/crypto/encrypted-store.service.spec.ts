import { of } from 'rxjs';
import { EncryptedStoreService } from './encrypted-store.service';
import { VaultService } from './vault.service';

describe('EncryptedStoreService', () => {
  it('uses scheduled occurrences rather than monthly rates in encrypted cashflow summaries', async () => {
    const vault = {
      isUnlocked: true,
      listRecords: () => of([]),
      decryptPayload: async () => ({}),
      encryptPayload: async () => 'ciphertext',
      blindIndex: async () => 'index',
      upsertRecords: (records: any[]) => of(records.map(record => ({ ...record, revision: 1, updated_at: '' }))),
    } as unknown as VaultService;
    const store = new EncryptedStoreService(vault);

    await store.addFixedExpense({
      name: 'Quarterly insurance', category: 'insurance', amount: 300, frequency: 'quarterly',
      start_date: '2026-01-15', is_active: true,
    });
    await store.addSubscription({
      name: 'Annual software', category: 'software', amount: 120, frequency: 'annual',
      next_bill_date: '2026-01-20', is_active: true,
    });

    const summary = await store.getCashflowSummary('2026-01-01', '2026-01-31');

    expect(summary.fixed_expenses).toBe(300);
    expect(summary.subscriptions).toBe(120);
    expect((summary.fixed_occurrences as any[]).map(event => event.date)).toEqual(['2026-01-15']);
    expect((summary.subscription_occurrences as any[]).map(event => event.date)).toEqual(['2026-01-20']);
  });

  it('exports vault-ready legacy records to encrypt locally before completing migration', async () => {
    const completeLegacyMigration = jasmine.createSpy('completeLegacyMigration').and.returnValue(of({ status: 'completed' }));
    const upsertRecords = jasmine.createSpy('upsertRecords').and.callFake((records: any[]) =>
      of(records.map(record => ({ ...record, revision: 1, updated_at: '' })))
    );
    const vault = {
      isUnlocked: true,
      currentStatus: { exists: true, migration_status: 'vault_ready' },
      listRecords: () => of([]),
      exportLegacyRecords: () => of({
        counts: { assets: 1 },
        records: [{ collection: 'assets', data: { id: 7, name: 'Legacy cash' } }],
      }),
      decryptPayload: async () => ({}),
      encryptPayload: async () => 'ciphertext',
      blindIndex: async () => 'index',
      upsertRecords,
      completeLegacyMigration,
    } as unknown as VaultService;
    const store = new EncryptedStoreService(vault);

    expect(await store.getAssets()).toEqual([jasmine.objectContaining({ id: 7, name: 'Legacy cash' })]);
    expect(upsertRecords).toHaveBeenCalledWith([
      jasmine.objectContaining({ collection: 'assets', schema_version: 2, key_version: 1 }),
    ]);
    expect(completeLegacyMigration).toHaveBeenCalledWith(
      { assets: 1 },
      [jasmine.objectContaining({ collection: 'assets' })]
    );
  });

  it('rewrites schema-1 records with their key version and revision before completing migration', async () => {
    const completeLegacyMigration = jasmine.createSpy('completeLegacyMigration').and.returnValue(
      of({ status: 'completed' })
    );
    const vault = {
      isUnlocked: true,
      listRecords: () =>
        of([
          {
            collection: 'assets',
            client_id: 'asset-001',
            ciphertext_b64: 'legacy',
            schema_version: 1,
            key_version: 7,
            revision: 4,
            updated_at: '',
          },
        ]),
      decryptPayload: async () => ({ id: 1, name: 'Cash' }),
      encryptPayload: async () => 'schema2',
      blindIndex: async () => 'index',
      upsertRecords: (records: any[]) => {
        expect(records).toEqual([
          jasmine.objectContaining({
            collection: 'assets',
            client_id: 'asset-001',
            schema_version: 2,
            key_version: 7,
            expected_revision: 4,
          }),
        ]);
        return of([{ ...records[0], revision: 5, updated_at: '' }]);
      },
      completeLegacyMigration,
    } as unknown as VaultService;
    const store = new EncryptedStoreService(vault);

    await store.getAssets();
    expect(completeLegacyMigration).toHaveBeenCalledWith(
      { assets: 1 },
      [{ collection: 'assets', client_id: 'asset-001' }]
    );
  });
});
