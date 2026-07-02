import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import {
  BehaviorSubject,
  Observable,
  forkJoin,
  tap,
  timeout,
  catchError,
  throwError,
  shareReplay,
  take,
} from 'rxjs';
import { apiUrl } from '../core/api-url';
import {
  Holding,
  HoldingCreate,
  NetWorth,
  MarketPriceQuote,
  Asset,
  AssetCreate,
  BankImportOption,
  FidelityImportOption,
  FidelityPreviewResult,
  FidelityPreviewRow,
  FidelityCommitResult,
  ImportCommitResult,
  ImportPreviewResult,
  ImportPreviewRow,
  Liability,
  LiabilityCreate,
  NetWorthSnapshot,
  TaxDocument,
  TaxDocumentType,
  TaxSummaryValues,
  TaxYearSummary,
  Transaction,
  TransactionCreate,
} from '../models/transaction.model';

export type DashboardLoadResult = [
  Transaction[],
  Holding[],
  NetWorth,
  NetWorthSnapshot[],
];

@Injectable({ providedIn: 'root' })
export class FinanceService {
  private _transactions = new BehaviorSubject<Transaction[]>([]);
  private _holdings = new BehaviorSubject<Holding[]>([]);
  private _netWorth = new BehaviorSubject<NetWorth | null>(null);
  private _netWorthSnapshots = new BehaviorSubject<NetWorthSnapshot[]>([]);
  private _assets = new BehaviorSubject<Asset[]>([]);
  private _liabilities = new BehaviorSubject<Liability[]>([]);

  transactions$ = this._transactions.asObservable();
  holdings$ = this._holdings.asObservable();
  netWorth$ = this._netWorth.asObservable();
  netWorthSnapshots$ = this._netWorthSnapshots.asObservable();
  assets$ = this._assets.asObservable();
  liabilities$ = this._liabilities.asObservable();

  private isLoading = new BehaviorSubject<boolean>(false);
  isLoading$ = this.isLoading.asObservable();

  private dashboardLoad$: Observable<DashboardLoadResult> | null = null;

  constructor(private http: HttpClient) {}

  /**
   * One coordinated fetch for dashboard + embedded charts (deduped via shareReplay).
   */
  loadDashboard(force = false): Observable<DashboardLoadResult> {
    if (force) {
      this.dashboardLoad$ = null;
    }
    if (!this.dashboardLoad$) {
      this.dashboardLoad$ = forkJoin([
        this.getTransactions({ limit: 5000 }),
        this.getHoldings(false),
        this.getNetWorth(),
        this.getNetWorthSnapshots(),
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
      this.getTransactions({ limit: 5000 }),
      this.getHoldings(false),
      this.getNetWorth(),
      this.getNetWorthSnapshots(),
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

  addTransaction(tx: TransactionCreate): Observable<Transaction> {
    return this.http.post<Transaction>(apiUrl('/transactions/'), tx).pipe(
      tap(created => {
        this._transactions.next([created, ...this._transactions.value]);
      })
    );
  }

  updateTransaction(id: number, tx: Partial<TransactionCreate>): Observable<Transaction> {
    return this.http.put<Transaction>(apiUrl(`/transactions/${id}`), tx).pipe(
      tap(updated => {
        this._transactions.next(
          this._transactions.value.map(t => (t.id === id ? updated : t))
        );
      })
    );
  }

  deleteTransaction(id: number): Observable<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(apiUrl(`/transactions/${id}`)).pipe(
      tap(() => {
        this._transactions.next(this._transactions.value.filter(t => t.id !== id));
      })
    );
  }

  getHoldings(refreshPrices = false): Observable<Holding[]> {
    let params = new HttpParams();
    if (refreshPrices) {
      params = params.set('refresh_prices', 'true');
    }
    return this.http.get<Holding[]>(apiUrl('/holdings/'), { params }).pipe(
      tap(data => this._holdings.next(data))
    );
  }

  refreshAllHoldingPrices(): Observable<Holding[]> {
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
    return this.http.put<Holding>(apiUrl(`/holdings/${id}`), holding).pipe(
      tap(updated => {
        this._holdings.next(this._holdings.value.map(h => (h.id === id ? updated : h)));
        this.invalidateDashboardCache();
        this.refreshDerivedMetrics();
      })
    );
  }

  deleteHolding(id: number): Observable<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(apiUrl(`/holdings/${id}`)).pipe(
      tap(() => {
        this._holdings.next(this._holdings.value.filter(h => h.id !== id));
        this.invalidateDashboardCache();
        this.refreshDerivedMetrics();
      })
    );
  }

  getNetWorth(): Observable<NetWorth> {
    return this.http.get<NetWorth>(apiUrl('/net-worth/')).pipe(
      tap(data => this._netWorth.next(data))
    );
  }

  getNetWorthSnapshots(limit = 120): Observable<NetWorthSnapshot[]> {
    const params = new HttpParams().set('limit', String(limit));
    return this.http.get<NetWorthSnapshot[]>(apiUrl('/net-worth/snapshots'), { params }).pipe(
      tap(data => this._netWorthSnapshots.next(data))
    );
  }

  recordNetWorthSnapshot(note?: string): Observable<NetWorthSnapshot> {
    return this.http.post<NetWorthSnapshot>(apiUrl('/net-worth/snapshots'), {
      note: note?.trim() || undefined,
    }).pipe(
      tap(created => {
        this._netWorthSnapshots.next([created, ...this._netWorthSnapshots.value]);
      })
    );
  }

  getAssets(): Observable<Asset[]> {
    return this.http.get<Asset[]>(apiUrl('/assets/')).pipe(
      tap(data => this._assets.next(data))
    );
  }

  addAsset(body: AssetCreate): Observable<Asset> {
    return this.http.post<Asset>(apiUrl('/assets/'), body).pipe(
      tap(created => {
        this._assets.next([...this._assets.value, created]);
        this.refreshDerivedMetrics();
        this.invalidateDashboardCache();
      })
    );
  }

  updateAsset(id: number, body: Partial<AssetCreate>): Observable<Asset> {
    return this.http.put<Asset>(apiUrl(`/assets/${id}`), body).pipe(
      tap(updated => {
        this._assets.next(this._assets.value.map(a => (a.id === id ? updated : a)));
        this.refreshDerivedMetrics();
        this.invalidateDashboardCache();
      })
    );
  }

  deleteAsset(id: number): Observable<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(apiUrl(`/assets/${id}`)).pipe(
      tap(() => {
        this._assets.next(this._assets.value.filter(a => a.id !== id));
        this.refreshDerivedMetrics();
        this.invalidateDashboardCache();
      })
    );
  }

  getLiabilities(): Observable<Liability[]> {
    return this.http.get<Liability[]>(apiUrl('/liabilities/')).pipe(
      tap(data => this._liabilities.next(data))
    );
  }

  addLiability(body: LiabilityCreate): Observable<Liability> {
    return this.http.post<Liability>(apiUrl('/liabilities/'), body).pipe(
      tap(created => {
        this._liabilities.next([...this._liabilities.value, created]);
        this.refreshDerivedMetrics();
        this.invalidateDashboardCache();
      })
    );
  }

  updateLiability(id: number, body: Partial<LiabilityCreate>): Observable<Liability> {
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

  getTaxDocuments(taxYear?: number): Observable<TaxDocument[]> {
    let params = new HttpParams();
    if (taxYear) {
      params = params.set('tax_year', String(taxYear));
    }
    return this.http.get<TaxDocument[]>(apiUrl('/taxes/documents'), { params });
  }

  getTaxYearSummary(taxYear: number): Observable<TaxYearSummary> {
    return this.http.get<TaxYearSummary>(apiUrl(`/taxes/years/${taxYear}/summary`));
  }

  uploadTaxDocument(body: {
    taxYear: number;
    documentType: TaxDocumentType;
    file: File;
    issuer?: string;
    taxpayer?: string;
    notes?: string;
    summary?: TaxSummaryValues;
  }): Observable<TaxDocument> {
    const form = new FormData();
    form.append('tax_year', String(body.taxYear));
    form.append('document_type', body.documentType);
    form.append('file', body.file, body.file.name);
    if (body.issuer?.trim()) form.append('issuer', body.issuer.trim());
    if (body.taxpayer?.trim()) form.append('taxpayer', body.taxpayer.trim());
    if (body.notes?.trim()) form.append('notes', body.notes.trim());
    if (body.summary) form.append('summary_json', JSON.stringify(body.summary));
    return this.http.post<TaxDocument>(apiUrl('/taxes/documents'), form);
  }

  downloadTaxDocument(documentId: number): Observable<Blob> {
    return this.http.get(apiUrl(`/taxes/documents/${documentId}/download`), {
      responseType: 'blob',
    });
  }

  deleteTaxDocument(documentId: number): Observable<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(apiUrl(`/taxes/documents/${documentId}`));
  }
}
