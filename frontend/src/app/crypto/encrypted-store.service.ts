import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  Asset,
  FixedExpense,
  Holding,
  JobIncome,
  Liability,
  ObservedNetWorthSnapshot,
  Subscription,
  Transaction,
} from '../models/transaction.model';
import { buildObservedSnapshot } from '../utils/observed-snapshot.util';
import { StockLabScenario } from '../models/stock-lab.model';
import {
  computeCashflowSummary,
  computeNetWorth,
  enrichFixedExpense,
  enrichHolding,
  enrichJobIncome,
  enrichSubscription,
} from './client-finance';
import { randomClientId } from './vault-crypto';
import { VaultService } from './vault.service';

type CollectionName =
  | 'transactions'
  | 'assets'
  | 'liabilities'
  | 'holdings'
  | 'job_incomes'
  | 'fixed_expenses'
  | 'subscriptions'
  | 'bank_accounts'
  | 'brokerage_accounts'
  | 'import_batches'
  | 'net_worth_snapshots'
  | 'planning_profiles'
  | 'planning_runs'
  | 'stock_lab_scenarios';

interface StoredEnvelope<T> {
  id: number;
  client_id: string;
  revision: number;
  schema_version: number;
  key_version: number;
  data: T;
}

const CURRENT_RECORD_SCHEMA_VERSION = 2;

@Injectable({ providedIn: 'root' })
export class EncryptedStoreService {
  private loaded = false;
  private nextId = 1;
  private bags: Record<string, Map<string, StoredEnvelope<any>>> = {
    transactions: new Map(),
    assets: new Map(),
    liabilities: new Map(),
    holdings: new Map(),
    job_incomes: new Map(),
    fixed_expenses: new Map(),
    subscriptions: new Map(),
    bank_accounts: new Map(),
    brokerage_accounts: new Map(),
    import_batches: new Map(),
    net_worth_snapshots: new Map(),
    planning_profiles: new Map(),
    planning_runs: new Map(),
    stock_lab_scenarios: new Map(),
  };

  constructor(private vault: VaultService) {}

  clear(): void {
    this.loaded = false;
    this.nextId = 1;
    for (const key of Object.keys(this.bags)) this.bags[key] = new Map();
  }

  async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    if (!this.vault.isUnlocked) throw new Error('Vault locked');
    const rows = await firstValueFrom(this.vault.listRecords());
    for (const key of Object.keys(this.bags)) this.bags[key] = new Map();
    let maxId = 0;
    for (const row of rows) {
      if (!this.bags[row.collection]) continue;
      const data = await this.vault.decryptPayload<any>(
        row.ciphertext_b64,
        row.collection,
        row.client_id,
        row.schema_version,
        row.key_version
      );
      const id = Number(data.id) || this.allocateId();
      maxId = Math.max(maxId, id);
      const envelope: StoredEnvelope<any> = {
        id,
        client_id: row.client_id,
        revision: row.revision,
        schema_version: row.schema_version,
        key_version: row.key_version,
        data: { ...data, id },
      };
      this.bags[row.collection].set(row.client_id, envelope);
    }
    this.loaded = true;
    this.nextId = maxId + 1;
    await this.rewriteLegacyRecords();
    await this.migrateLegacyPlaintext();
  }

  private allocateId(): number {
    const id = this.nextId;
    this.nextId += 1;
    return id;
  }

  private list<T>(collection: CollectionName): T[] {
    return Array.from(this.bags[collection].values()).map(v => v.data as T);
  }

  private async upsert<T extends { id?: number }>(
    collection: CollectionName,
    payload: T,
    clientId?: string
  ): Promise<T> {
    await this.ensureLoaded();
    const existing = clientId
      ? this.bags[collection].get(clientId)
      : payload.id
        ? Array.from(this.bags[collection].values()).find(v => v.id === payload.id)
        : undefined;
    const id = existing?.id ?? payload.id ?? this.allocateId();
    this.nextId = Math.max(this.nextId, id + 1);
    const cid = existing?.client_id ?? clientId ?? randomClientId(collection.slice(0, 3));
    const data = { ...payload, id };
    const schemaVersion = CURRENT_RECORD_SCHEMA_VERSION;
    const keyVersion = existing?.key_version ?? 1;
    const ciphertext = await this.vault.encryptPayload(data, collection, cid, schemaVersion, keyVersion);
    const indexes =
      collection === 'transactions' && (data as any).dedupe_key
        ? [
            {
              index_name: 'dedupe_key',
              index_value_b64: await this.vault.blindIndex(String((data as any).dedupe_key)),
            },
          ]
        : [];
    const saved = await firstValueFrom(
      this.vault.upsertRecords([
        {
          collection,
          client_id: cid,
          ciphertext_b64: ciphertext,
          schema_version: schemaVersion,
          key_version: keyVersion,
          expected_revision: existing?.revision ?? null,
          indexes,
        },
      ])
    );
    const row = saved[0];
    this.bags[collection].set(cid, {
      id,
      client_id: cid,
      revision: row.revision,
      schema_version: schemaVersion,
      key_version: keyVersion,
      data,
    });
    return data;
  }

  private async rewriteLegacyRecords(): Promise<void> {
    const migrated: Array<{ collection: string; client_id: string }> = [];
    for (const collection of Object.keys(this.bags) as CollectionName[]) {
      for (const envelope of this.bags[collection].values()) {
        // Version 1 records did not authenticate their server-owned identity.
        // Rewrite them once with version 2 AAD after successful local decryption.
        if (envelope.schema_version < CURRENT_RECORD_SCHEMA_VERSION) {
          await this.upsert(collection, envelope.data, envelope.client_id);
          migrated.push({ collection, client_id: envelope.client_id });
        }
      }
    }
    // Plaintext migration owns completion while legacy database rows still exist.
    if (migrated.length && this.vault.currentStatus?.migration_status !== 'vault_ready') {
      const counts = migrated.reduce<Record<string, number>>((out, record) => {
        out[record.collection] = (out[record.collection] ?? 0) + 1;
        return out;
      }, {});
      await firstValueFrom(this.vault.completeLegacyMigration(counts, migrated));
    }
  }

  private async migrateLegacyPlaintext(): Promise<void> {
    if (this.vault.currentStatus?.migration_status !== 'vault_ready') return;
    const exported = await firstValueFrom(this.vault.exportLegacyRecords());
    const migrated: Array<{ collection: string; client_id: string }> = [];
    for (const record of exported.records) {
      if (!this.bags[record.collection]) throw new Error(`Unsupported legacy collection: ${record.collection}`);
      const clientId = `legacy:${record.collection}:${record.data['id']}`;
      await this.upsert(record.collection as CollectionName, record.data as { id?: number }, clientId);
      migrated.push({ collection: record.collection, client_id: clientId });
    }
    await firstValueFrom(this.vault.completeLegacyMigration(exported.counts, migrated));
  }

  private async remove(collection: CollectionName, id: number): Promise<void> {
    await this.ensureLoaded();
    const found = Array.from(this.bags[collection].values()).find(v => v.id === id);
    if (!found) return;
    await firstValueFrom(
      this.vault.deleteRecords([
        { collection, client_id: found.client_id, expected_revision: found.revision },
      ])
    );
    this.bags[collection].delete(found.client_id);
  }

  async getTransactions(): Promise<Transaction[]> {
    await this.ensureLoaded();
    return this.list<Transaction>('transactions').sort((a, b) => b.date.localeCompare(a.date));
  }

  async addTransaction(tx: Omit<Transaction, 'id'> & { dedupe_key?: string }): Promise<Transaction> {
    return this.upsert('transactions', { ...tx, source: tx.source || 'manual' } as Transaction);
  }

  async updateTransaction(id: number, tx: Partial<Transaction>): Promise<Transaction> {
    await this.ensureLoaded();
    const current = this.list<Transaction>('transactions').find(t => t.id === id);
    if (!current) throw new Error('Transaction not found');
    return this.upsert('transactions', { ...current, ...tx, id });
  }

  async deleteTransaction(id: number): Promise<void> {
    return this.remove('transactions', id);
  }

  async bulkRenameTransactionCategories(renames: { fromCategory: string; toCategory: string }[]): Promise<{ updated: number; conflicts: number }> {
    const lookup = new Map(renames.map(row => [row.fromCategory, row.toCategory]));
    const rows = (await this.getTransactions()).filter(row => lookup.has(row.category));
    let updated = 0;
    let conflicts = 0;
    for (const row of rows) {
      try {
        await this.updateTransaction(row.id, { category: lookup.get(row.category)! });
        updated += 1;
      } catch {
        conflicts += 1;
      }
    }
    return { updated, conflicts };
  }

  async getAssets(): Promise<Asset[]> {
    await this.ensureLoaded();
    return this.list<Asset>('assets');
  }

  async addAsset(body: any): Promise<Asset> {
    return this.upsert('assets', body);
  }

  async updateAsset(id: number, body: any): Promise<Asset> {
    const current = (await this.getAssets()).find(a => a.id === id);
    if (!current) throw new Error('Asset not found');
    return this.upsert('assets', { ...current, ...body, id });
  }

  async deleteAsset(id: number): Promise<void> {
    return this.remove('assets', id);
  }

  async getLiabilities(): Promise<Liability[]> {
    await this.ensureLoaded();
    return this.list<Liability>('liabilities');
  }

  async addLiability(body: any): Promise<Liability> {
    return this.upsert('liabilities', body);
  }

  async updateLiability(id: number, body: any): Promise<Liability> {
    const current = (await this.getLiabilities()).find(a => a.id === id);
    if (!current) throw new Error('Liability not found');
    return this.upsert('liabilities', { ...current, ...body, id });
  }

  async deleteLiability(id: number): Promise<void> {
    return this.remove('liabilities', id);
  }

  async getHoldings(): Promise<Holding[]> {
    await this.ensureLoaded();
    const accounts = this.list<{
      id: number;
      broker_name?: string;
      account_mask?: string;
      nickname?: string | null;
      label?: string | null;
    }>('brokerage_accounts');
    const labels = new Map(
      accounts.map(acc => [
        acc.id,
        acc.nickname?.trim() ||
          acc.label?.trim() ||
          `${acc.broker_name || 'Fidelity'} ···${acc.account_mask || ''}`.trim(),
      ])
    );
    return this.list<Holding>('holdings').map(h =>
      enrichHolding({
        ...h,
        account_display:
          (h.brokerage_account_id != null ? labels.get(h.brokerage_account_id) : null) ||
          h.account_display ||
          null,
      })
    );
  }

  async addHolding(body: any): Promise<Holding> {
    const row = await this.upsert('holdings', {
      ...body,
      current_price: body.current_price ?? body.purchase_price,
      price_source: body.price_source ?? 'manual',
    });
    return enrichHolding(row);
  }

  async updateHolding(id: number, body: any): Promise<Holding> {
    const current = (await this.getHoldings()).find(a => a.id === id);
    if (!current) throw new Error('Holding not found');
    return enrichHolding(await this.upsert('holdings', { ...current, ...body, id }));
  }

  async updateHoldingPrice(
    id: number,
    quote: { price: number; price_source: string; price_as_of?: string | null }
  ): Promise<Holding> {
    return this.updateHolding(id, {
      current_price: quote.price,
      price_source: quote.price_source,
      price_as_of: quote.price_as_of ?? null,
    });
  }

  async deleteHolding(id: number): Promise<void> {
    return this.remove('holdings', id);
  }

  async getBrokerageAccounts(): Promise<
    Array<{
      id: number;
      broker_slug: string;
      broker_name: string;
      account_mask: string;
      account_name?: string;
      nickname?: string | null;
      label?: string | null;
    }>
  > {
    await this.ensureLoaded();
    return this.list('brokerage_accounts');
  }

  async upsertBrokerageAccount(body: {
    id?: number;
    broker_slug: string;
    broker_name: string;
    account_mask: string;
    account_name?: string;
    nickname?: string | null;
    label?: string | null;
  }): Promise<{
    id: number;
    broker_slug: string;
    broker_name: string;
    account_mask: string;
    account_name?: string;
    nickname?: string | null;
    label?: string | null;
  }> {
    const row = await this.upsert('brokerage_accounts', body);
    return { ...row, id: Number(row.id) };
  }

  async setBrokerageAccountNickname(accountId: number, nickname: string | null) {
    const accounts = await this.getBrokerageAccounts();
    const current = accounts.find(a => a.id === accountId);
    if (!current) throw new Error('Brokerage account not found');
    const nextNickname = nickname?.trim() || null;
    const label =
      nextNickname ||
      current.label ||
      `${current.broker_name || 'Fidelity'} ···${current.account_mask}`;
    const updated = await this.upsertBrokerageAccount({
      ...current,
      nickname: nextNickname,
      label,
    });
    const holdings = await this.getHoldings();
    for (const holding of holdings.filter(h => h.brokerage_account_id === accountId)) {
      await this.updateHolding(holding.id, { account_display: label });
    }
    return updated;
  }

  async getJobIncomes(): Promise<JobIncome[]> {
    await this.ensureLoaded();
    return this.list<JobIncome>('job_incomes').map(enrichJobIncome);
  }

  async addJobIncome(body: any): Promise<JobIncome> {
    return enrichJobIncome(await this.upsert('job_incomes', body));
  }

  async updateJobIncome(id: number, body: any): Promise<JobIncome> {
    const current = (await this.getJobIncomes()).find(a => a.id === id);
    if (!current) throw new Error('Income not found');
    return enrichJobIncome(await this.upsert('job_incomes', { ...current, ...body, id }));
  }

  async deleteJobIncome(id: number): Promise<void> {
    return this.remove('job_incomes', id);
  }

  async getFixedExpenses(): Promise<FixedExpense[]> {
    await this.ensureLoaded();
    return this.list<FixedExpense>('fixed_expenses').map(enrichFixedExpense);
  }

  async addFixedExpense(body: any): Promise<FixedExpense> {
    return enrichFixedExpense(await this.upsert('fixed_expenses', body));
  }

  async updateFixedExpense(id: number, body: any): Promise<FixedExpense> {
    const current = (await this.getFixedExpenses()).find(a => a.id === id);
    if (!current) throw new Error('Expense not found');
    return enrichFixedExpense(await this.upsert('fixed_expenses', { ...current, ...body, id }));
  }

  async deleteFixedExpense(id: number): Promise<void> {
    return this.remove('fixed_expenses', id);
  }

  async getSubscriptions(): Promise<Subscription[]> {
    await this.ensureLoaded();
    return this.list<Subscription>('subscriptions').map(enrichSubscription);
  }

  async addSubscription(body: any): Promise<Subscription> {
    return enrichSubscription(await this.upsert('subscriptions', body));
  }

  async updateSubscription(id: number, body: any): Promise<Subscription> {
    const current = (await this.getSubscriptions()).find(a => a.id === id);
    if (!current) throw new Error('Subscription not found');
    return enrichSubscription(await this.upsert('subscriptions', { ...current, ...body, id }));
  }

  async deleteSubscription(id: number): Promise<void> {
    return this.remove('subscriptions', id);
  }

  async getNetWorth() {
    const [assets, liabilities, holdings] = await Promise.all([
      this.getAssets(),
      this.getLiabilities(),
      this.getHoldings(),
    ]);
    return computeNetWorth(assets, liabilities, holdings);
  }

  async listObservedNetWorthSnapshots(): Promise<ObservedNetWorthSnapshot[]> {
    await this.ensureLoaded();
    return this.list<ObservedNetWorthSnapshot>('net_worth_snapshots').sort((a, b) =>
      b.recorded_at.localeCompare(a.recorded_at)
    );
  }

  async recordObservedNetWorthSnapshot(options: {
    note?: string;
    attribution?: string;
  } = {}): Promise<ObservedNetWorthSnapshot> {
    const nw = await this.getNetWorth();
    return this.upsert(
      'net_worth_snapshots',
      buildObservedSnapshot(nw, options) as ObservedNetWorthSnapshot
    );
  }

  async deleteObservedNetWorthSnapshot(id: number): Promise<void> {
    return this.remove('net_worth_snapshots', id);
  }

  async getCashflowSummary(start: string, end: string) {
    const [txs, incomes, fixed, subs] = await Promise.all([
      this.getTransactions(),
      this.getJobIncomes(),
      this.getFixedExpenses(),
      this.getSubscriptions(),
    ]);
    const base = computeCashflowSummary(start, end, txs, incomes, fixed, subs);
    return {
      ...base,
    };
  }

  async listPlanningProfiles(): Promise<any[]> {
    await this.ensureLoaded();
    return this.list<any>('planning_profiles');
  }

  async savePlanningProfile(body: any, id?: number): Promise<any> {
    if (id != null) {
      const current = (await this.listPlanningProfiles()).find(p => p.id === id) || { id };
      return this.upsert('planning_profiles', { ...current, ...body, id });
    }
    return this.upsert('planning_profiles', body);
  }

  async deletePlanningProfile(id: number): Promise<void> {
    return this.remove('planning_profiles', id);
  }

  async getStockLabScenarios(): Promise<StockLabScenario[]> {
    await this.ensureLoaded();
    return this.list<StockLabScenario>('stock_lab_scenarios').sort((a, b) =>
      b.updated_at.localeCompare(a.updated_at)
    );
  }

  async saveStockLabScenario(body: StockLabScenario, id?: number): Promise<StockLabScenario> {
    const current = id
      ? (await this.getStockLabScenarios()).find(row => row.id === id)
      : undefined;
    const now = new Date().toISOString();
    return this.upsert('stock_lab_scenarios', {
      ...current,
      ...body,
      id: id ?? body.id,
      created_at: current?.created_at ?? body.created_at ?? now,
      updated_at: now,
    });
  }

  async deleteStockLabScenario(id: number): Promise<void> {
    return this.remove('stock_lab_scenarios', id);
  }
}
