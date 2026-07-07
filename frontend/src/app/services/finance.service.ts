import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import {
  BehaviorSubject,
  Observable,
  forkJoin,
  from,
  tap,
  timeout,
  catchError,
  throwError,
  shareReplay,
  take,
} from 'rxjs';
import { apiUrl } from '../core/api-url';
import { EncryptedStoreService } from '../crypto/encrypted-store.service';
import { VaultService } from '../crypto/vault.service';
import {
  Holding,
  HoldingCreate,
  NetWorth,
  MarketPriceQuote,
  Asset,
  AssetCreate,
  BankImportOption,
  CashflowSummary,
  CategoryBulkRenameResult,
  CategoryRenameResult,
  FixedExpense,
  FixedExpenseCreate,
  FidelityImportOption,
  FidelityPreviewResult,
  FidelityPreviewRow,
  FidelityCommitResult,
  ImportCommitResult,
  ImportPreviewResult,
  ImportPreviewRow,
  JobIncome,
  JobIncomeCreate,
  Liability,
  LiabilityCreate,
  Subscription,
  SubscriptionCreate,
  Transaction,
  TransactionCreate,
} from '../models/transaction.model';

export type DashboardLoadResult = [
  Transaction[],
  Holding[],
  NetWorth,
  CashflowSummary,
  JobIncome[],
  FixedExpense[],
  Subscription[],
];

@Injectable({ providedIn: 'root' })
export class FinanceService {
  private _transactions = new BehaviorSubject<Transaction[]>([]);
  private _dashboardTransactions = new BehaviorSubject<Transaction[]>([]);
  private _holdings = new BehaviorSubject<Holding[]>([]);
  private _netWorth = new BehaviorSubject<NetWorth | null>(null);
  private _assets = new BehaviorSubject<Asset[]>([]);
  private _liabilities = new BehaviorSubject<Liability[]>([]);
  private _jobIncomes = new BehaviorSubject<JobIncome[]>([]);
  private _fixedExpenses = new BehaviorSubject<FixedExpense[]>([]);
  private _subscriptions = new BehaviorSubject<Subscription[]>([]);
  private _cashflowSummary = new BehaviorSubject<CashflowSummary | null>(null);

  transactions$ = this._transactions.asObservable();
  dashboardTransactions$ = this._dashboardTransactions.asObservable();
  holdings$ = this._holdings.asObservable();
  netWorth$ = this._netWorth.asObservable();
  assets$ = this._assets.asObservable();
  liabilities$ = this._liabilities.asObservable();
  jobIncomes$ = this._jobIncomes.asObservable();
  fixedExpenses$ = this._fixedExpenses.asObservable();
  subscriptions$ = this._subscriptions.asObservable();
  cashflowSummary$ = this._cashflowSummary.asObservable();

  private isLoading = new BehaviorSubject<boolean>(false);
  isLoading$ = this.isLoading.asObservable();

  private dashboardLoad$: Observable<DashboardLoadResult> | null = null;

  constructor(
    private http: HttpClient,
    private vault: VaultService,
    private encStore: EncryptedStoreService
  ) {}

  private get encMode(): boolean {
    return this.vault.usesEncryptedStore;
  }

  /**
   * One coordinated fetch for dashboard + embedded charts (deduped via shareReplay).
   */
  loadDashboard(force = false): Observable<DashboardLoadResult> {
    if (force) {
      this.dashboardLoad$ = null;
    }
    if (!this.dashboardLoad$) {
      this.dashboardLoad$ = forkJoin([
        this.getDashboardTransactions({ limit: 5000 }),
        this.getHoldings(false),
        this.getNetWorth(),
        this.getCashflowSummaryForCurrentMonth(),
        this.getJobIncomes(),
        this.getFixedExpenses(),
        this.getSubscriptions(),
      ]).pipe(
        shareReplay({ bufferSize: 1, refCount: false }),
        catchError(err => {
          this.dashboardLoad$ = null;
          return throwError(() => err);
        })
      );
    }
    return this.dashboardLoad$;
  }

  private refreshDerivedMetrics(): void {
    this.getNetWorth().pipe(take(1)).subscribe();
  }

  private invalidateDashboardCache(): void {
    this.dashboardLoad$ = null;
  }

  private refreshAfterImport(): void {
    this.invalidateDashboardCache();
    this.getDashboardTransactions({ limit: 5000 }).pipe(take(1)).subscribe();
    this.getTransactions({ limit: 5000 }).pipe(take(1)).subscribe();
  }

  /**
   * Reload transactions, holdings (cached prices), and current net worth.
   * Use refreshAllHoldingPrices() on Portfolio when live quotes are needed.
   */
  refreshAll(): Observable<DashboardLoadResult> {
    this.dashboardLoad$ = null;
    this.isLoading.next(true);
    return forkJoin([
      this.getDashboardTransactions({ limit: 5000 }),
      this.getHoldings(false),
      this.getNetWorth(),
      this.getCashflowSummaryForCurrentMonth(),
      this.getJobIncomes(),
      this.getFixedExpenses(),
      this.getSubscriptions(),
    ]).pipe(
      timeout(60_000),
      tap({
        next: () => this.isLoading.next(false),
        error: () => this.isLoading.next(false),
      }),
      catchError(err => {
        if (err?.name === 'TimeoutError') {
          return throwError(() => new Error('Refresh timed out. Check the API and try again.'));
        }
        return throwError(() => err);
      })
    );
  }

  /**
   * List transactions. Dashboard uses a high limit; the transactions page paginates with skip/limit.
   */
  getTransactions(options?: {
    search?: string;
    skip?: number;
    limit?: number;
    append?: boolean;
  }): Observable<Transaction[]> {
    if (this.encMode) {
      return from(this.encStore.getTransactions().then(rows => {
        let out = rows;
        if (options?.search) {
          const q = options.search.toLowerCase();
          out = out.filter(r =>
            (r.description || '').toLowerCase().includes(q) ||
            (r.category || '').toLowerCase().includes(q)
          );
        }
        const skip = options?.skip ?? 0;
        const limit = options?.limit ?? out.length;
        out = out.slice(skip, skip + limit);
        if (options?.append) this._transactions.next([...this._transactions.value, ...out]);
        else this._transactions.next(out);
        return out;
      }));
    }

    const search = options?.search?.trim();
    const skip = options?.skip ?? 0;
    const limit = options?.limit ?? 5000;
    const append = options?.append ?? false;

    let params = new HttpParams().set('skip', String(skip)).set('limit', String(limit));
    if (search) {
      params = params.set('search', search);
    }
    return this.http.get<Transaction[]>(apiUrl('/transactions/'), { params }).pipe(
      tap(data => {
        if (append) {
          const existing = this._transactions.value;
          const seen = new Set(existing.map(t => t.id));
          const merged = [...existing];
          for (const t of data) {
            if (!seen.has(t.id)) {
              merged.push(t);
              seen.add(t.id);
            }
          }
          this._transactions.next(merged);
        } else {
          this._transactions.next(data);
        }
      })
    );
  }

  getDashboardTransactions(options?: { limit?: number }): Observable<Transaction[]> {
    if (this.encMode) {
      return from(this.encStore.getTransactions().then(rows => {
        const out = rows.slice(0, options?.limit ?? 5000);
        this._dashboardTransactions.next(out);
        return out;
      }));
    }

    const limit = options?.limit ?? 5000;
    const params = new HttpParams().set('skip', '0').set('limit', String(limit));
    return this.http.get<Transaction[]>(apiUrl('/transactions/'), { params }).pipe(
      tap(data => this._dashboardTransactions.next(data))
    );
  }

  getCashflowSummary(startDate: string, endDate: string): Observable<CashflowSummary> {
    if (this.encMode) {
      return from(this.encStore.getCashflowSummary(startDate, endDate).then(s => {
        this._cashflowSummary.next(s as any);
        return s as any;
      }));
    }

    const params = new HttpParams().set('start_date', startDate).set('end_date', endDate);
    return this.http.get<CashflowSummary>(apiUrl('/cashflow/summary'), { params }).pipe(
      tap(summary => this._cashflowSummary.next(summary))
    );
  }

  getCashflowSummaryForCurrentMonth(): Observable<CashflowSummary> {
    const now = new Date();
    const start = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const end = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`;
    return this.getCashflowSummary(start, end);
  }

  addTransaction(tx: TransactionCreate): Observable<Transaction> {
    if (this.encMode) {
      return from(this.encStore.addTransaction(tx as any).then(async row => {
        this._transactions.next(await this.encStore.getTransactions());
        this.invalidateDashboardCache();
        return row;
      }));
    }

    return this.http.post<Transaction>(apiUrl('/transactions/'), tx).pipe(
      tap(created => {
        this._transactions.next([created, ...this._transactions.value]);
      })
    );
  }

  updateTransaction(id: number, tx: Partial<TransactionCreate>): Observable<Transaction> {
    if (this.encMode) {
      return from(this.encStore.updateTransaction(id, tx as any).then(async row => {
        this._transactions.next(await this.encStore.getTransactions());
        this.invalidateDashboardCache();
        return row;
      }));
    }

    return this.http.put<Transaction>(apiUrl(`/transactions/${id}`), tx).pipe(
      tap(updated => {
        this._transactions.next(
          this._transactions.value.map(t => (t.id === id ? updated : t))
        );
      })
    );
  }

  deleteTransaction(id: number): Observable<{ ok: boolean }> {
    if (this.encMode) {
      return from(this.encStore.deleteTransaction(id).then(async () => {
        this._transactions.next(await this.encStore.getTransactions());
        this.invalidateDashboardCache();
        return { ok: true };
      }));
    }

    return this.http.delete<{ ok: boolean }>(apiUrl(`/transactions/${id}`)).pipe(
      tap(() => {
        this._transactions.next(this._transactions.value.filter(t => t.id !== id));
      })
    );
  }

  getJobIncomes(): Observable<JobIncome[]> {
    if (this.encMode) {
      return from(this.encStore.getJobIncomes().then(rows => {
        this._jobIncomes.next(rows);
        return rows;
      }));
    }

    return this.http.get<JobIncome[]>(apiUrl('/income/')).pipe(
      tap(data => this._jobIncomes.next(data))
    );
  }

  addJobIncome(body: JobIncomeCreate): Observable<JobIncome> {
    if (this.encMode) {
      return from(this.encStore.addJobIncome(body).then(async row => {
        this._jobIncomes.next(await this.encStore.getJobIncomes());
        return row;
      }));
    }

    return this.http.post<JobIncome>(apiUrl('/income/'), body).pipe(
      tap(created => {
        this._jobIncomes.next([created, ...this._jobIncomes.value]);
        this.invalidateDashboardCache();
      })
    );
  }

  updateJobIncome(id: number, body: Partial<JobIncomeCreate>): Observable<JobIncome> {
    if (this.encMode) {
      return from(this.encStore.updateJobIncome(id, body).then(async row => {
        this._jobIncomes.next(await this.encStore.getJobIncomes());
        return row;
      }));
    }

    return this.http.put<JobIncome>(apiUrl(`/income/${id}`), body).pipe(
      tap(updated => {
        this._jobIncomes.next(this._jobIncomes.value.map(row => (row.id === id ? updated : row)));
        this.invalidateDashboardCache();
      })
    );
  }

  deleteJobIncome(id: number): Observable<{ ok: boolean }> {
    if (this.encMode) {
      return from(this.encStore.deleteJobIncome(id).then(async () => {
        this._jobIncomes.next(await this.encStore.getJobIncomes());
        return { ok: true };
      }));
    }

    return this.http.delete<{ ok: boolean }>(apiUrl(`/income/${id}`)).pipe(
      tap(() => {
        this._jobIncomes.next(this._jobIncomes.value.filter(row => row.id !== id));
        this.invalidateDashboardCache();
      })
    );
  }

  getFixedExpenses(): Observable<FixedExpense[]> {
    if (this.encMode) {
      return from(this.encStore.getFixedExpenses().then(rows => {
        this._fixedExpenses.next(rows);
        return rows;
      }));
    }

    return this.http.get<FixedExpense[]>(apiUrl('/fixed-expenses/')).pipe(
      tap(data => this._fixedExpenses.next(data))
    );
  }

  getSubscriptions(): Observable<Subscription[]> {
    if (this.encMode) {
      return from(this.encStore.getSubscriptions().then(rows => {
        this._subscriptions.next(rows);
        return rows;
      }));
    }

    return this.http.get<Subscription[]>(apiUrl('/subscriptions/')).pipe(
      tap(data => this._subscriptions.next(data))
    );
  }

  addSubscription(body: SubscriptionCreate): Observable<Subscription> {
    if (this.encMode) {
      return from(this.encStore.addSubscription(body).then(async row => {
        this._subscriptions.next(await this.encStore.getSubscriptions());
        return row;
      }));
    }

    return this.http.post<Subscription>(apiUrl('/subscriptions/'), body).pipe(
      tap(created => {
        this._subscriptions.next([created, ...this._subscriptions.value]);
        this.invalidateDashboardCache();
      })
    );
  }

  updateSubscription(id: number, body: Partial<SubscriptionCreate>): Observable<Subscription> {
    if (this.encMode) {
      return from(this.encStore.updateSubscription(id, body).then(async row => {
        this._subscriptions.next(await this.encStore.getSubscriptions());
        return row;
      }));
    }

    return this.http.put<Subscription>(apiUrl(`/subscriptions/${id}`), body).pipe(
      tap(updated => {
        this._subscriptions.next(this._subscriptions.value.map(row => (row.id === id ? updated : row)));
        this.invalidateDashboardCache();
      })
    );
  }

  deleteSubscription(id: number): Observable<{ ok: boolean }> {
    if (this.encMode) {
      return from(this.encStore.deleteSubscription(id).then(async () => {
        this._subscriptions.next(await this.encStore.getSubscriptions());
        return { ok: true };
      }));
    }

    return this.http.delete<{ ok: boolean }>(apiUrl(`/subscriptions/${id}`)).pipe(
      tap(() => {
        this._subscriptions.next(this._subscriptions.value.filter(row => row.id !== id));
        this.invalidateDashboardCache();
      })
    );
  }

  clearSessionState(): void {
    this.encStore.clear();
    this.vault.lock();
    this.dashboardLoad$ = null;
    this._transactions.next([]);
    this._dashboardTransactions.next([]);
    this._holdings.next([]);
    this._netWorth.next(null);
    this._assets.next([]);
    this._liabilities.next([]);
    this._jobIncomes.next([]);
    this._fixedExpenses.next([]);
    this._subscriptions.next([]);
    this._cashflowSummary.next(null);
  }

  resetMyData(): Observable<{ ok: boolean }> {
    return this.http.post<{ ok: boolean }>(apiUrl('/auth/reset-data'), { confirm: 'CLEAR MY DATA' }).pipe(
      tap(() => this.clearSessionState())
    );
  }

  addFixedExpense(body: FixedExpenseCreate): Observable<FixedExpense> {
    if (this.encMode) {
      return from(this.encStore.addFixedExpense(body).then(async row => {
        this._fixedExpenses.next(await this.encStore.getFixedExpenses());
        return row;
      }));
    }

    return this.http.post<FixedExpense>(apiUrl('/fixed-expenses/'), body).pipe(
      tap(created => {
        this._fixedExpenses.next([created, ...this._fixedExpenses.value]);
        this.invalidateDashboardCache();
      })
    );
  }

  updateFixedExpense(id: number, body: Partial<FixedExpenseCreate>): Observable<FixedExpense> {
    if (this.encMode) {
      return from(this.encStore.updateFixedExpense(id, body).then(async row => {
        this._fixedExpenses.next(await this.encStore.getFixedExpenses());
        return row;
      }));
    }

    return this.http.put<FixedExpense>(apiUrl(`/fixed-expenses/${id}`), body).pipe(
      tap(updated => {
        this._fixedExpenses.next(this._fixedExpenses.value.map(row => (row.id === id ? updated : row)));
        this.invalidateDashboardCache();
      })
    );
  }

  deleteFixedExpense(id: number): Observable<{ ok: boolean }> {
    if (this.encMode) {
      return from(this.encStore.deleteFixedExpense(id).then(async () => {
        this._fixedExpenses.next(await this.encStore.getFixedExpenses());
        return { ok: true };
      }));
    }

    return this.http.delete<{ ok: boolean }>(apiUrl(`/fixed-expenses/${id}`)).pipe(
      tap(() => {
        this._fixedExpenses.next(this._fixedExpenses.value.filter(row => row.id !== id));
        this.invalidateDashboardCache();
      })
    );
  }

  renameCategory(fromCategory: string, toCategory: string): Observable<CategoryRenameResult> {
    const from_category = fromCategory.trim();
    const to_category = toCategory.trim();
    return this.http
      .put<CategoryRenameResult>(apiUrl('/transactions/categories/rename'), {
        from_category,
        to_category,
      })
      .pipe(
        tap(result => {
          if (result.updated <= 0) return;
          this.invalidateDashboardCache();
          this._transactions.next(
            this._transactions.value.map(t =>
              t.category === result.from_category ? { ...t, category: result.to_category } : t
            )
          );
        })
      );
  }

  bulkRenameCategories(
    renames: { fromCategory: string; toCategory: string }[]
  ): Observable<CategoryBulkRenameResult> {
    const payload = {
      renames: renames.map(row => ({
        from_category: row.fromCategory.trim(),
        to_category: row.toCategory.trim(),
      })),
    };
    return this.http
      .put<CategoryBulkRenameResult>(apiUrl('/transactions/categories/bulk-rename'), payload)
      .pipe(
        tap(result => {
          if (result.updated <= 0) return;
          this.invalidateDashboardCache();
          const lookup = new Map(result.renames.map(row => [row.from_category, row.to_category]));
          this._transactions.next(
            this._transactions.value.map(t => {
              const to = lookup.get(t.category);
              return to ? { ...t, category: to } : t;
            })
          );
        })
      );
  }

  getHoldings(refreshPrices = false): Observable<Holding[]> {
    if (this.encMode) {
      return from(this.encStore.getHoldings().then(rows => {
        this._holdings.next(rows);
        return rows;
      }));
    }

    let params = new HttpParams();
    if (refreshPrices) {
      params = params.set('refresh_prices', 'true');
    }
    return this.http.get<Holding[]>(apiUrl('/holdings/'), { params }).pipe(
      tap(data => this._holdings.next(data))
    );
  }

  refreshAllHoldingPrices(): Observable<Holding[]> {
    if (this.encMode) {
      // Server-blind: no per-user symbol disclosure for quote refresh.
      return this.getHoldings(false);
    }

    this.isLoading.next(true);
    return this.getHoldings(true).pipe(
      tap({
        next: () => {
          this.refreshDerivedMetrics();
          this.isLoading.next(false);
        },
        error: () => this.isLoading.next(false),
      })
    );
  }

  refreshHoldingPrice(holdingId: number): Observable<Holding> {
    if (this.encMode) {
      return from(this.encStore.getHoldings().then(rows => {
        const row = rows.find(r => r.id === holdingId);
        if (!row) throw new Error('Holding not found');
        return row;
      }));
    }

    return this.http
      .post<Holding>(apiUrl(`/holdings/${holdingId}/refresh-price`), {})
      .pipe(
        tap(updated => {
          this._holdings.next(
            this._holdings.value.map(h => (h.id === holdingId ? updated : h))
          );
          this.getNetWorth().pipe(take(1)).subscribe();
        })
      );
  }

  lookupSharePrice(symbol: string, refresh = true): Observable<MarketPriceQuote> {
    const upper = symbol.trim().toUpperCase();
    let params = new HttpParams();
    if (refresh) {
      params = params.set('refresh', 'true');
    }
    return this.http.get<MarketPriceQuote>(apiUrl(`/market/price/${encodeURIComponent(upper)}`), {
      params,
    });
  }

  addHolding(holding: HoldingCreate): Observable<Holding> {
    if (this.encMode) {
      return from(this.encStore.addHolding(holding).then(async row => {
        this._holdings.next(await this.encStore.getHoldings());
        this.refreshDerivedMetrics();
        return row;
      }));
    }

    return this.http.post<Holding>(apiUrl('/holdings/'), holding).pipe(
      tap(created => {
        this._holdings.next([...this._holdings.value, created]);
        this.invalidateDashboardCache();
        this.refreshDerivedMetrics();
      })
    );
  }

  updateHolding(
    id: number,
    holding: Partial<HoldingCreate>
  ): Observable<Holding> {
    if (this.encMode) {
      return from(this.encStore.updateHolding(id, holding as any).then(async row => {
        this._holdings.next(await this.encStore.getHoldings());
        this.refreshDerivedMetrics();
        return row;
      }));
    }

    return this.http.put<Holding>(apiUrl(`/holdings/${id}`), holding).pipe(
      tap(updated => {
        this._holdings.next(this._holdings.value.map(h => (h.id === id ? updated : h)));
        this.invalidateDashboardCache();
        this.refreshDerivedMetrics();
      })
    );
  }

  deleteHolding(id: number): Observable<{ ok: boolean }> {
    if (this.encMode) {
      return from(this.encStore.deleteHolding(id).then(async () => {
        this._holdings.next(await this.encStore.getHoldings());
        this.refreshDerivedMetrics();
        return { ok: true };
      }));
    }

    return this.http.delete<{ ok: boolean }>(apiUrl(`/holdings/${id}`)).pipe(
      tap(() => {
        this._holdings.next(this._holdings.value.filter(h => h.id !== id));
        this.invalidateDashboardCache();
        this.refreshDerivedMetrics();
      })
    );
  }

  getNetWorth(): Observable<NetWorth> {
    if (this.encMode) {
      return from(this.encStore.getNetWorth().then(nw => {
        this._netWorth.next(nw);
        return nw;
      }));
    }

    return this.http.get<NetWorth>(apiUrl('/net-worth/')).pipe(
      tap(data => this._netWorth.next(data))
    );
  }

  getAssets(): Observable<Asset[]> {
    if (this.encMode) {
      return from(this.encStore.getAssets().then(rows => {
        this._assets.next(rows);
        return rows;
      }));
    }

    return this.http.get<Asset[]>(apiUrl('/assets/')).pipe(
      tap(data => this._assets.next(data))
    );
  }

  addAsset(body: AssetCreate): Observable<Asset> {
    if (this.encMode) {
      return from(this.encStore.addAsset(body).then(async row => {
        this._assets.next(await this.encStore.getAssets());
        this.refreshDerivedMetrics();
        return row;
      }));
    }

    return this.http.post<Asset>(apiUrl('/assets/'), body).pipe(
      tap(created => {
        this._assets.next([...this._assets.value, created]);
        this.refreshDerivedMetrics();
        this.invalidateDashboardCache();
      })
    );
  }

  updateAsset(id: number, body: Partial<AssetCreate>): Observable<Asset> {
    if (this.encMode) {
      return from(this.encStore.updateAsset(id, body).then(async row => {
        this._assets.next(await this.encStore.getAssets());
        this.refreshDerivedMetrics();
        return row;
      }));
    }

    return this.http.put<Asset>(apiUrl(`/assets/${id}`), body).pipe(
      tap(updated => {
        this._assets.next(this._assets.value.map(a => (a.id === id ? updated : a)));
        this.refreshDerivedMetrics();
        this.invalidateDashboardCache();
      })
    );
  }

  deleteAsset(id: number): Observable<{ ok: boolean }> {
    if (this.encMode) {
      return from(this.encStore.deleteAsset(id).then(async () => {
        this._assets.next(await this.encStore.getAssets());
        this.refreshDerivedMetrics();
        return { ok: true };
      }));
    }

    return this.http.delete<{ ok: boolean }>(apiUrl(`/assets/${id}`)).pipe(
      tap(() => {
        this._assets.next(this._assets.value.filter(a => a.id !== id));
        this.refreshDerivedMetrics();
        this.invalidateDashboardCache();
      })
    );
  }

  getLiabilities(): Observable<Liability[]> {
    if (this.encMode) {
      return from(this.encStore.getLiabilities().then(rows => {
        this._liabilities.next(rows);
        return rows;
      }));
    }

    return this.http.get<Liability[]>(apiUrl('/liabilities/')).pipe(
      tap(data => this._liabilities.next(data))
    );
  }

  addLiability(body: LiabilityCreate): Observable<Liability> {
    if (this.encMode) {
      return from(this.encStore.addLiability(body).then(async row => {
        this._liabilities.next(await this.encStore.getLiabilities());
        this.refreshDerivedMetrics();
        return row;
      }));
    }

    return this.http.post<Liability>(apiUrl('/liabilities/'), body).pipe(
      tap(created => {
        this._liabilities.next([...this._liabilities.value, created]);
        this.refreshDerivedMetrics();
        this.invalidateDashboardCache();
      })
    );
  }

  updateLiability(id: number, body: Partial<LiabilityCreate>): Observable<Liability> {
    if (this.encMode) {
      return from(this.encStore.updateLiability(id, body).then(async row => {
        this._liabilities.next(await this.encStore.getLiabilities());
        this.refreshDerivedMetrics();
        return row;
      }));
    }

    return this.http.put<Liability>(apiUrl(`/liabilities/${id}`), body).pipe(
      tap(updated => {
        this._liabilities.next(
          this._liabilities.value.map(li => (li.id === id ? updated : li))
        );
        this.refreshDerivedMetrics();
        this.invalidateDashboardCache();
      })
    );
  }

  deleteLiability(id: number): Observable<{ ok: boolean }> {
    if (this.encMode) {
      return from(this.encStore.deleteLiability(id).then(async () => {
        this._liabilities.next(await this.encStore.getLiabilities());
        this.refreshDerivedMetrics();
        return { ok: true };
      }));
    }

    return this.http.delete<{ ok: boolean }>(apiUrl(`/liabilities/${id}`)).pipe(
      tap(() => {
        this._liabilities.next(this._liabilities.value.filter(li => li.id !== id));
        this.refreshDerivedMetrics();
        this.invalidateDashboardCache();
      })
    );
  }

  getImportBanks(): Observable<BankImportOption[]> {
    return this.http.get<BankImportOption[]>(apiUrl('/imports/banks'));
  }

  previewBankImport(bankSlug: string, file: File): Observable<ImportPreviewResult> {
    const form = new FormData();
    form.append('file', file, file.name);
    return this.http.post<ImportPreviewResult>(
      apiUrl(`/imports/${encodeURIComponent(bankSlug)}/preview`),
      form
    );
  }

  commitBankImport(
    bankSlug: string,
    filename: string,
    rows: ImportPreviewRow[]
  ): Observable<ImportCommitResult> {
    return this.http
      .post<ImportCommitResult>(apiUrl(`/imports/${encodeURIComponent(bankSlug)}/commit`), {
        filename,
        rows: rows.map(r => ({
          dedupe_key: r.dedupe_key,
          date: r.date,
          account_mask: r.account_mask,
          description: r.description,
          category: r.category,
          amount: r.amount,
        })),
      })
      .pipe(tap(() => this.refreshAfterImport()));
  }

  // Fidelity portfolio import (replaces positions per account)
  getBrokerageImports(): Observable<FidelityImportOption[]> {
    return this.http.get<FidelityImportOption[]>(apiUrl('/imports/brokerages'));
  }

  previewFidelityImport(file: File): Observable<FidelityPreviewResult> {
    const form = new FormData();
    form.append('file', file, file.name);
    return this.http.post<FidelityPreviewResult>(
      apiUrl('/imports/fidelity/preview'),
      form
    );
  }

  commitFidelityImport(
    filename: string,
    rows: FidelityPreviewRow[]
  ): Observable<FidelityCommitResult> {
    return this.http
      .post<FidelityCommitResult>(apiUrl('/imports/fidelity/commit'), {
        filename,
        rows: rows.map(r => ({
          account_mask: r.account_mask,
          symbol: r.symbol,
          shares: r.shares,
          avg_cost_basis: r.avg_cost_basis,
        })),
      })
      .pipe(
        tap(() => {
          // refresh holdings and net worth (current only)
          this.invalidateDashboardCache();
          this.getHoldings().pipe(take(1)).subscribe();
          this.getNetWorth().pipe(take(1)).subscribe();
        })
      );
  }

  setAccountNickname(accountId: number, nickname: string | null): Observable<any> {
    return this.http.put(apiUrl(`/imports/brokerage-accounts/${accountId}/nickname`), {
      nickname: nickname || null,
    }).pipe(
      tap(() => {
        this.getHoldings().pipe(take(1)).subscribe();
      })
    );
  }

}
