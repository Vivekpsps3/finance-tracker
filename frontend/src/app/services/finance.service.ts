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
import { environment } from '../../environments/environment';
import {
  Holding,
  HoldingCreate,
  NetWorth,
  MarketPriceQuote,
  BankImportOption,
  ImportCommitResult,
  ImportPreviewResult,
  ImportPreviewRow,
  NetWorthHistoryPoint,
  Transaction,
  TransactionCreate,
} from '../models/transaction.model';

export type DashboardLoadResult = [
  Transaction[],
  Holding[],
  NetWorth,
  NetWorthHistoryPoint[],
];

@Injectable({ providedIn: 'root' })
export class FinanceService {
  private apiUrl = environment.apiUrl;

  private _transactions = new BehaviorSubject<Transaction[]>([]);
  private _holdings = new BehaviorSubject<Holding[]>([]);
  private _netWorth = new BehaviorSubject<NetWorth | null>(null);
  private _history = new BehaviorSubject<NetWorthHistoryPoint[]>([]);

  transactions$ = this._transactions.asObservable();
  holdings$ = this._holdings.asObservable();
  netWorth$ = this._netWorth.asObservable();
  netWorthHistory$ = this._history.asObservable();

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
        this.getTransactions(),
        this.getHoldings(false),
        this.getNetWorth(),
        this.getNetWorthHistory(),
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
    forkJoin([this.getNetWorth(), this.getNetWorthHistory()])
      .pipe(take(1))
      .subscribe();
  }

  private invalidateDashboardCache(): void {
    this.dashboardLoad$ = null;
  }

  private refreshAfterImport(): void {
    this.invalidateDashboardCache();
    forkJoin([this.getTransactions(), this.getNetWorth(), this.getNetWorthHistory()])
      .pipe(take(1))
      .subscribe();
  }

  /**
   * Reload transactions, holdings (cached prices), net worth, and history.
   * Use refreshAllHoldingPrices() on Portfolio when live quotes are needed.
   */
  refreshAll(): Observable<DashboardLoadResult> {
    this.dashboardLoad$ = null;
    this.isLoading.next(true);
    return forkJoin([
      this.getTransactions(),
      this.getHoldings(false),
      this.getNetWorth(),
      this.getNetWorthHistory(),
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

  getTransactions(search?: string): Observable<Transaction[]> {
    let params = new HttpParams().set('limit', '5000');
    if (search?.trim()) {
      params = params.set('search', search.trim());
    }
    return this.http.get<Transaction[]>(`${this.apiUrl}/transactions/`, { params }).pipe(
      tap(data => this._transactions.next(data))
    );
  }

  addTransaction(tx: TransactionCreate): Observable<Transaction> {
    return this.http.post<Transaction>(`${this.apiUrl}/transactions/`, tx).pipe(
      tap(created => {
        this._transactions.next([created, ...this._transactions.value]);
        this.refreshDerivedMetrics();
      })
    );
  }

  updateTransaction(id: number, tx: Partial<TransactionCreate>): Observable<Transaction> {
    return this.http.put<Transaction>(`${this.apiUrl}/transactions/${id}`, tx).pipe(
      tap(updated => {
        this._transactions.next(
          this._transactions.value.map(t => (t.id === id ? updated : t))
        );
        this.refreshDerivedMetrics();
      })
    );
  }

  deleteTransaction(id: number): Observable<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(`${this.apiUrl}/transactions/${id}`).pipe(
      tap(() => {
        this._transactions.next(this._transactions.value.filter(t => t.id !== id));
        this.refreshDerivedMetrics();
      })
    );
  }

  getHoldings(refreshPrices = false): Observable<Holding[]> {
    let params = new HttpParams();
    if (refreshPrices) {
      params = params.set('refresh_prices', 'true');
    }
    return this.http.get<Holding[]>(`${this.apiUrl}/holdings/`, { params }).pipe(
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
      .post<Holding>(`${this.apiUrl}/holdings/${holdingId}/refresh-price`, {})
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
    return this.http.get<MarketPriceQuote>(`${this.apiUrl}/market/price/${encodeURIComponent(upper)}`, {
      params,
    });
  }

  addHolding(holding: HoldingCreate): Observable<Holding> {
    return this.http.post<Holding>(`${this.apiUrl}/holdings/`, holding).pipe(
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
    return this.http.put<Holding>(`${this.apiUrl}/holdings/${id}`, holding).pipe(
      tap(updated => {
        this._holdings.next(this._holdings.value.map(h => (h.id === id ? updated : h)));
        this.invalidateDashboardCache();
        this.refreshDerivedMetrics();
      })
    );
  }

  deleteHolding(id: number): Observable<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(`${this.apiUrl}/holdings/${id}`).pipe(
      tap(() => {
        this._holdings.next(this._holdings.value.filter(h => h.id !== id));
        this.invalidateDashboardCache();
        this.refreshDerivedMetrics();
      })
    );
  }

  getNetWorth(): Observable<NetWorth> {
    return this.http.get<NetWorth>(`${this.apiUrl}/net-worth/`).pipe(
      tap(data => this._netWorth.next(data))
    );
  }

  getNetWorthHistory(): Observable<NetWorthHistoryPoint[]> {
    return this.http.get<NetWorthHistoryPoint[]>(`${this.apiUrl}/net-worth/history`).pipe(
      tap(data => this._history.next(data))
    );
  }

  getImportBanks(): Observable<BankImportOption[]> {
    return this.http.get<BankImportOption[]>(`${this.apiUrl}/imports/banks`);
  }

  previewBankImport(bankSlug: string, file: File): Observable<ImportPreviewResult> {
    const form = new FormData();
    form.append('file', file, file.name);
    return this.http.post<ImportPreviewResult>(
      `${this.apiUrl}/imports/${encodeURIComponent(bankSlug)}/preview`,
      form
    );
  }

  commitBankImport(
    bankSlug: string,
    filename: string,
    rows: ImportPreviewRow[]
  ): Observable<ImportCommitResult> {
    return this.http
      .post<ImportCommitResult>(`${this.apiUrl}/imports/${encodeURIComponent(bankSlug)}/commit`, {
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
}