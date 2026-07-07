import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  Asset,
  FixedExpense,
  Holding,
  JobIncome,
  Liability,
  Subscription,
  Transaction,
} from '../models/transaction.model';
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
  | 'planning_profiles';

interface StoredEnvelope<T> {
  id: number;
  client_id: string;
  revision: number;
  data: T;
}

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
    planning_profiles: new Map(),
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
      const data = await this.vault.decryptPayload<any>(row.ciphertext_b64);
      const id = Number(data.id) || this.allocateId();
      maxId = Math.max(maxId, id);
      const envelope: StoredEnvelope<any> = {
        id,
        client_id: row.client_id,
        revision: row.revision,
        data: { ...data, id },
      };
      this.bags[row.collection].set(row.client_id, envelope);
    }
    this.nextId = maxId + 1;
    this.loaded = true;
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
    const id = existing?.id ?? this.allocateId();
    const cid = existing?.client_id ?? clientId ?? randomClientId(collection.slice(0, 3));
    const data = { ...payload, id };
    const ciphertext = await this.vault.encryptPayload(data);
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
      data,
    });
    return data;
  }

  private async remove(collection: CollectionName, id: number): Promise<void> {
    await this.ensureLoaded();
    const found = Array.from(this.bags[collection].values()).find(v => v.id === id);
    if (!found) return;
    await firstValueFrom(
      this.vault.deleteRecords([{ collection, client_id: found.client_id }])
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
    return this.list<Holding>('holdings').map(enrichHolding);
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

  async deleteHolding(id: number): Promise<void> {
    return this.remove('holdings', id);
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

  async getCashflowSummary(start: string, end: string) {
    const [txs, incomes, fixed, subs] = await Promise.all([
      this.getTransactions(),
      this.getJobIncomes(),
      this.getFixedExpenses(),
      this.getSubscriptions(),
    ]);
    const base = computeCashflowSummary(start, end, txs, incomes, fixed, subs);
    // Normalize to API field names used by the UI.
    const fixedAmt = fixed.map(enrichFixedExpense).reduce((s, f) => s + (f.monthly_amount || 0), 0);
    const subAmt = subs.map(enrichSubscription).reduce((s, f) => s + (f.monthly_amount || 0), 0);
    const total_income = base.transaction_income + base.planned_income;
    const total_expenses = base.transaction_expenses + fixedAmt + subAmt;
    const days = Math.max(
      1,
      (new Date(end).getTime() - new Date(start).getTime()) / (1000 * 60 * 60 * 24) + 1
    );
    return {
      start_date: start,
      end_date: end,
      transaction_income: base.transaction_income,
      transaction_expenses: base.transaction_expenses,
      planned_income: base.planned_income,
      fixed_expenses: fixedAmt,
      subscriptions: subAmt,
      total_income,
      total_expenses,
      net_cashflow: total_income - total_expenses,
      savings_rate: total_income > 0 ? ((total_income - total_expenses) / total_income) * 100 : null,
      average_daily_spend: total_expenses / days,
      fixed_occurrences: [],
      subscription_occurrences: [],
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

  async migrateFromLegacy(http: {
    get: <T>(url: string) => Promise<T>;
  }): Promise<{ legacy: Record<string, number>; encrypted: Record<string, number> }> {
    const legacy: Record<string, number> = {};
    const encrypted: Record<string, number> = {};

    const loadList = async <T>(path: string, collection: CollectionName, map?: (x: T) => any) => {
      try {
        const rows = await http.get<T[]>(path);
        legacy[collection] = rows.length;
        for (const row of rows) {
          const payload = map ? map(row) : row;
          await this.upsert(collection, payload as any);
        }
        encrypted[collection] = this.bags[collection].size;
      } catch {
        legacy[collection] = 0;
        encrypted[collection] = this.bags[collection].size;
      }
    };

    this.clear();
    this.loaded = true; // start empty; we're writing fresh

    await loadList('/api/transactions/?skip=0&limit=10000', 'transactions');
    await loadList('/api/assets/', 'assets');
    await loadList('/api/liabilities/', 'liabilities');
    await loadList('/api/holdings/', 'holdings');
    await loadList('/api/income/', 'job_incomes');
    await loadList('/api/fixed-expenses/', 'fixed_expenses');
    await loadList('/api/subscriptions/', 'subscriptions');

    return { legacy, encrypted };
  }
}
