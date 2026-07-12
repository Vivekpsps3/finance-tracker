import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subject, combineLatest, finalize, takeUntil, tap } from 'rxjs';
import { FinanceService } from '../services/finance.service';
import {
  Asset,
  CashflowSummary,
  DateFilter,
  FixedExpense,
  Holding,
  JobIncome,
  NetWorth,
  ObservedNetWorthSnapshot,
  Subscription,
  Transaction,
} from '../models/transaction.model';
import { attributeSnapshotDelta } from '../utils/observed-snapshot.util';
import { ChartsComponent } from '../charts/charts.component';
import {
  UiBadgeComponent,
  UiBadgeVariant,
  UiButtonComponent,
  UiCardComponent,
  UiPageHeaderComponent,
  UiSelectComponent,
  UiSelectOption,
  UiSkeletonComponent,
  UiIconComponent,
  UiSourceBadgeComponent,
} from '../shared/ui';
import { filterByDate, getDateRange, getDefaultDateFilter } from '../utils/date.util';
import { buildLocalFinancialSnapshot } from '../signals/build-local-snapshot';
import { runLocalDetectors } from '../signals/detectors';
import { FinancialSignal, SignalActionId } from '../signals/financial-signal';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    ChartsComponent,
    UiPageHeaderComponent,
    UiButtonComponent,
    UiCardComponent,
    UiBadgeComponent,
    UiSkeletonComponent,
    UiSelectComponent,
    UiIconComponent,
    UiSourceBadgeComponent,
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardComponent implements OnInit, OnDestroy {
  netWorth: NetWorth | null = null;
  transactions: Transaction[] = [];
  jobIncomes: JobIncome[] = [];
  fixedExpenses: FixedExpense[] = [];
  subscriptions: Subscription[] = [];
  cashflowSummary: CashflowSummary | null = null;
  isLoading = true;
  chartsReady = false;
  error: string | null = null;
  periodIncomeTotal = 0;
  periodExpenseTotal = 0;
  periodTransactionIncomeTotal = 0;
  periodTransactionExpenseTotal = 0;
  periodJobNetIncomeTotal = 0;
  periodFixedExpenseTotal = 0;
  periodObservedNetCashflow = 0;
  periodScheduledNetCashflow = 0;
  periodNetCashflow = 0;
  periodSavingsRate: number | null = null;
  averageDailySpend = 0;
  largestCategory = '';
  largestCategoryTotal = 0;
  asOfLabel = '';
  localSignals: FinancialSignal[] = [];
  observedSnapshots: ObservedNetWorthSnapshot[] = [];
  snapshotBusy = false;
  snapshotMessage: string | null = null;
  private assets: Asset[] = [];
  private holdings: Holding[] = [];

  filter: DateFilter = getDefaultDateFilter();
  filteredTransactions: Transaction[] = [];
  dashboardCashflowTransactions: Transaction[] = [];
  filterSummary = '';

  readonly periodOptions: UiSelectOption[] = [
    { value: 'month', label: 'By month' },
    { value: 'year', label: 'By year' },
    { value: 'custom', label: 'Custom range' },
    { value: 'all', label: 'All time' },
  ];

  readonly onboardingSteps = [
    { label: 'Balance sheet', path: '/balance-sheet', detail: 'Add cash, assets, debts, loans, and mortgages.' },
    { label: 'Transactions', path: '/transactions', detail: 'Import card and bank CSVs for spending review.' },
    { label: 'Income', path: '/income', detail: 'Add jobs and realistic tax/deduction estimates.' },
    { label: 'Bills', path: '/fixed-expenses', detail: 'Record rent, utilities, insurance, and debt minimums.' },
    { label: 'Subscriptions', path: '/subscriptions', detail: 'Capture recurring software, media, and memberships.' },
    { label: 'Portfolio', path: '/portfolio', detail: 'Import or enter investments for market-value net worth.' },
  ];

  private destroy$ = new Subject<void>();

  constructor(
    private financeService: FinanceService,
    private cdr: ChangeDetectorRef,
    private route: ActivatedRoute,
    private router: Router
  ) {}

  ngOnInit() {
    this.readFilterFromQuery(this.route.snapshot.queryParamMap);
    this.route.queryParamMap.pipe(takeUntil(this.destroy$)).subscribe(params => {
      this.readFilterFromQuery(params);
      this.applyDateFilter();
      this.loadCashflowForFilter();
      this.cdr.markForCheck();
    });

    combineLatest([
      this.financeService.netWorth$,
      this.financeService.dashboardTransactions$,
      this.financeService.cashflowSummary$,
      this.financeService.jobIncomes$,
      this.financeService.fixedExpenses$,
      this.financeService.subscriptions$,
      this.financeService.assets$,
      this.financeService.holdings$,
    ])
      .pipe(takeUntil(this.destroy$))
      .subscribe(([nw, txs, summary, jobIncomes, fixedExpenses, subscriptions, assets, holdings]) => {
        this.netWorth = nw;
        this.transactions = txs;
        this.cashflowSummary = summary;
        this.jobIncomes = jobIncomes;
        this.fixedExpenses = fixedExpenses;
        this.subscriptions = subscriptions;
        this.assets = assets;
        this.holdings = holdings;
        this.applyDateFilter();
        this.refreshLocalSignals();
        this.cdr.markForCheck();
      });

    this.financeService
      .loadDashboard()
      .pipe(
        takeUntil(this.destroy$),
        tap(() => {
          this.chartsReady = true;
          this.error = null;
          this.reloadObservedSnapshots();
        }),
        finalize(() => {
          this.isLoading = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        error: (err: Error) => {
          this.chartsReady = false;
          const detail = err?.message ? ` ${err.message}` : '';
          this.error = `Could not load dashboard. Is the API running?${detail}`;
          this.cdr.markForCheck();
        },
      });
  }

  recordObservedSnapshot(): void {
    if (this.snapshotBusy || !this.netWorth) return;
    this.snapshotBusy = true;
    this.snapshotMessage = null;
    this.financeService
      .recordObservedNetWorthSnapshot({ attribution: 'unknown' })
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.snapshotBusy = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: () => {
          this.snapshotMessage = 'Encrypted observed snapshot saved (attribution: unknown).';
          this.reloadObservedSnapshots();
        },
        error: (err: Error) => {
          this.snapshotMessage = err?.message || 'Could not save snapshot';
        },
      });
  }

  snapshotDeltaLabel(snap: ObservedNetWorthSnapshot, index: number): string {
    const older = this.observedSnapshots[index + 1];
    if (!older) return 'First recorded observation';
    const delta = attributeSnapshotDelta(older, snap);
    const sign = delta.deltaTotal >= 0 ? '+' : '';
    return `${sign}$${delta.deltaTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} · cause: ${delta.attribution}`;
  }

  private reloadObservedSnapshots(): void {
    this.financeService
      .listObservedNetWorthSnapshots()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: rows => {
          this.observedSnapshots = rows;
          this.cdr.markForCheck();
        },
        error: () => {
          this.observedSnapshots = [];
          this.cdr.markForCheck();
        },
      });
  }

  private readFilterFromQuery(params: { get(name: string): string | null }): void {
    const mode = params.get('mode');
    if (mode === 'month' || mode === 'year' || mode === 'custom' || mode === 'all') {
      this.filter.mode = mode;
    }
    const month = params.get('month');
    if (month) this.filter.month = month;
    const year = params.get('year');
    if (year && !Number.isNaN(Number(year))) this.filter.year = Number(year);
    const start = params.get('start');
    if (start) this.filter.start = start;
    const end = params.get('end');
    if (end) this.filter.end = end;
  }

  private writeFilterToQuery(): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        mode: this.filter.mode === 'month' ? null : this.filter.mode,
        month: this.filter.mode === 'month' ? this.filter.month || null : null,
        year: this.filter.mode === 'year' ? this.filter.year || null : null,
        start: this.filter.mode === 'custom' ? this.filter.start || null : null,
        end: this.filter.mode === 'custom' ? this.filter.end || null : null,
      },
      queryParamsHandling: '',
      replaceUrl: true,
    });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private computeInsights() {
    this.periodTransactionIncomeTotal = this.filteredTransactions
      .filter(t => t.type === 'income')
      .reduce((s, t) => s + t.amount, 0);
    this.periodTransactionExpenseTotal = this.filteredTransactions
      .filter(t => t.type === 'expense')
      .reduce((s, t) => s + t.amount, 0);
    if (this.cashflowSummary) {
      this.periodTransactionIncomeTotal = this.cashflowSummary.transaction_income;
      this.periodTransactionExpenseTotal = this.cashflowSummary.transaction_expenses;
      this.periodJobNetIncomeTotal = this.cashflowSummary.planned_income;
      this.periodFixedExpenseTotal = this.cashflowSummary.fixed_expenses + this.cashflowSummary.subscriptions;
      this.periodObservedNetCashflow = this.cashflowSummary.observed_net_cashflow;
      this.periodScheduledNetCashflow = this.cashflowSummary.scheduled_net_cashflow;
      this.periodIncomeTotal = this.cashflowSummary.total_income;
      this.periodExpenseTotal = this.cashflowSummary.total_expenses;
      this.periodNetCashflow = this.cashflowSummary.net_cashflow;
      this.periodSavingsRate = this.cashflowSummary.savings_rate;
      this.averageDailySpend = this.cashflowSummary.average_daily_spend;
    } else {
      this.periodJobNetIncomeTotal = 0;
      this.periodFixedExpenseTotal = 0;
      this.periodObservedNetCashflow = this.periodTransactionIncomeTotal - this.periodTransactionExpenseTotal;
      this.periodScheduledNetCashflow = 0;
      this.periodIncomeTotal = this.periodTransactionIncomeTotal;
      this.periodExpenseTotal = this.periodTransactionExpenseTotal;
      this.periodNetCashflow = this.periodIncomeTotal - this.periodExpenseTotal;
      this.periodSavingsRate = this.periodIncomeTotal > 0
        ? (this.periodNetCashflow / this.periodIncomeTotal) * 100
        : null;
      const days = this.daysInFilter();
      this.averageDailySpend = days > 0 ? this.periodExpenseTotal / days : 0;
    }

    const categoryTotals = new Map<string, number>();
    for (const tx of this.filteredTransactions) {
      if (tx.type !== 'expense') continue;
      categoryTotals.set(tx.category, (categoryTotals.get(tx.category) || 0) + tx.amount);
    }
    if (this.cashflowSummary) {
      for (const event of this.cashflowSummary.fixed_occurrences) {
        const category = `Fixed: ${event.category}`;
        categoryTotals.set(category, (categoryTotals.get(category) || 0) + event.amount);
      }
      for (const event of this.cashflowSummary.subscription_occurrences) {
        const category = `Subscription: ${event.category}`;
        categoryTotals.set(category, (categoryTotals.get(category) || 0) + event.amount);
      }
    }
    const top = [...categoryTotals.entries()].sort((a, b) => b[1] - a[1])[0];
    this.largestCategory = top?.[0] || '';
    this.largestCategoryTotal = top?.[1] || 0;

    if (this.netWorth?.as_of) {
      const d = new Date(this.netWorth.as_of);
      this.asOfLabel = d.toLocaleString();
    } else {
      this.asOfLabel = 'Just now';
    }
  }

  retryLoad() {
    this.isLoading = true;
    this.chartsReady = false;
    this.error = null;
    this.cdr.markForCheck();
    this.financeService
      .loadDashboard(true)
      .pipe(
        takeUntil(this.destroy$),
        tap(() => {
          this.chartsReady = true;
          this.error = null;
        }),
        finalize(() => {
          this.isLoading = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        error: (err: Error) => {
          this.chartsReady = false;
          const detail = err?.message ? ` ${err.message}` : '';
          this.error = `Could not load dashboard. Is the API running?${detail}`;
          this.cdr.markForCheck();
        },
      });
  }

  abs(value: number): number {
    return Math.abs(value);
  }

  formatPercent(value: number | null): string {
    if (value === null || Number.isNaN(value)) {
      return '-';
    }
    return `${value.toFixed(1)}%`;
  }

  get onboardingCompleteCount(): number {
    let count = 0;
    if ((this.netWorth?.total_assets || 0) > 0 || (this.netWorth?.liabilities || 0) > 0) count += 1;
    if (this.transactions.length > 0) count += 1;
    if (this.jobIncomes.length > 0) count += 1;
    if (this.fixedExpenses.length > 0) count += 1;
    if (this.subscriptions.length > 0) count += 1;
    if ((this.netWorth?.portfolio || 0) > 0) count += 1;
    return count;
  }

  get showOnboardingChecklist(): boolean {
    return this.onboardingCompleteCount < 6;
  }

  isOnboardingStepDone(label: string): boolean {
    if (label === 'Balance sheet') return (this.netWorth?.total_assets || 0) > 0 || (this.netWorth?.liabilities || 0) > 0;
    if (label === 'Transactions') return this.transactions.length > 0;
    if (label === 'Income') return this.jobIncomes.length > 0;
    if (label === 'Bills') return this.fixedExpenses.length > 0;
    if (label === 'Subscriptions') return this.subscriptions.length > 0;
    if (label === 'Portfolio') return (this.netWorth?.portfolio || 0) > 0;
    return false;
  }

  portfolioFreshness(): string {
    const sources = this.netWorth?.portfolio_sources;
    if (!sources || !Object.keys(sources).length) return 'No holdings';
    const values = Object.values(sources);
    if (values.every(s => s === 'live')) return 'Live prices';
    if (values.some(s => s === 'cached')) return 'Cached prices';
    if (values.every(s => s === 'manual' || s === 'import')) return 'Manual / import prices';
    return 'Mixed sources';
  }

  freshnessBadgeVariant(): UiBadgeVariant {
    const label = this.portfolioFreshness();
    if (label === 'Live prices') return 'success';
    if (label === 'Cached prices' || label === 'Mixed sources' || label === 'Manual / import prices') return 'warning';
    return 'default';
  }

  private refreshLocalSignals(): void {
    try {
      const snap = buildLocalFinancialSnapshot(
        this.assets,
        [],
        this.holdings,
        this.transactions
      );
      this.localSignals = runLocalDetectors(snap);
    } catch {
      this.localSignals = [];
    }
  }

  signalActionPath(action: SignalActionId): string {
    if (action === 'review-balance-sheet') return '/balance-sheet';
    if (action === 'refresh-portfolio-prices') return '/portfolio';
    if (action === 'open-transactions') return '/transactions';
    return '/';
  }

  signalActionLabel(action: SignalActionId): string {
    if (action === 'review-balance-sheet') return 'Review balance sheet';
    if (action === 'refresh-portfolio-prices') return 'Refresh portfolio';
    if (action === 'open-transactions') return 'Open transactions';
    return 'Dismiss';
  }

  netWorthCompleteness(): string {
    const sources = this.netWorth?.portfolio_sources;
    const holdingCount = sources ? Object.keys(sources).length : 0;
    const assetPart = this.netWorth?.other_assets
      ? `Manual assets $${(this.netWorth.other_assets).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
      : 'No manual assets';
    const holdingPart = holdingCount
      ? `${holdingCount} holding${holdingCount === 1 ? '' : 's'} priced (${this.portfolioFreshness().toLowerCase()})`
      : 'No holdings priced';
    const liabilityPart = this.netWorth?.liabilities
      ? `Liabilities $${(this.netWorth.liabilities).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
      : 'No liabilities';
    return `${assetPart} · ${holdingPart} · ${liabilityPart}`;
  }

  onFilterChange() {
    if (this.filter.mode === 'month' && !this.filter.month) {
      this.filter.month = this.getCurrentMonth();
    }
    if (this.filter.mode === 'year' && !this.filter.year) {
      this.filter.year = new Date().getFullYear();
    }
    this.writeFilterToQuery();
    this.applyDateFilter();
    this.loadCashflowForFilter();
    this.cdr.markForCheck();
  }

  resetFilter() {
    this.filter = getDefaultDateFilter();
    this.writeFilterToQuery();
    this.applyDateFilter();
    this.loadCashflowForFilter();
    this.cdr.markForCheck();
  }

  private getCurrentMonth(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  private applyDateFilter() {
    this.filteredTransactions = filterByDate(this.transactions, this.filter);
    this.updateFilterSummary();
    this.computeInsights();
    this.dashboardCashflowTransactions = this.buildDashboardCashflowTransactions();
  }

  private loadCashflowForFilter() {
    let { start, end } = getDateRange(this.filter);
    if (this.filter.mode === 'all') {
      const dates = this.transactions.map(row => row.date).sort();
      start = dates[0] ?? null;
      end = dates.at(-1) ?? null;
    }
    if (!start || !end) {
      this.cashflowSummary = null;
      return;
    }
    this.financeService
      .getCashflowSummary(start, end)
      .pipe(takeUntil(this.destroy$))
      .subscribe({ error: () => this.cdr.markForCheck() });
  }

  private updateFilterSummary() {
    const f = this.filter;
    if (f.mode === 'all') {
      this.filterSummary = 'All time';
      return;
    }
    if (f.mode === 'month' && f.month) {
      const [y, m] = f.month.split('-');
      const date = new Date(parseInt(y), parseInt(m) - 1);
      this.filterSummary = date.toLocaleString(undefined, { month: 'long', year: 'numeric' });
      return;
    }
    if (f.mode === 'year' && f.year) {
      this.filterSummary = `Year ${f.year}`;
      return;
    }
    if (f.mode === 'custom' && f.start && f.end) {
      this.filterSummary = `${f.start} to ${f.end}`;
      return;
    }
    if (f.mode === 'custom') {
      this.filterSummary = 'Custom range (set start and end)';
      return;
    }
    this.filterSummary = '';
  }

  private daysInFilter(): number {
    const f = this.filter;
    if (f.mode === 'month' && f.month) {
      const [year, month] = f.month.split('-').map(Number);
      return new Date(year, month, 0).getDate();
    }
    if (f.mode === 'year' && f.year) {
      const start = new Date(f.year, 0, 1);
      const end = new Date(f.year, 11, 31);
      return this.inclusiveDays(start, end);
    }
    if (f.mode === 'custom' && f.start && f.end) {
      return this.inclusiveDays(new Date(`${f.start}T00:00:00`), new Date(`${f.end}T00:00:00`));
    }
    if (!this.filteredTransactions.length) {
      return 0;
    }
    const dates = this.filteredTransactions.map(t => new Date(`${t.date}T00:00:00`).getTime());
    return this.inclusiveDays(new Date(Math.min(...dates)), new Date(Math.max(...dates)));
  }

  private buildDashboardCashflowTransactions(): Transaction[] {
    const synthetic: Transaction[] = [];
    if (!this.cashflowSummary) {
      return this.filteredTransactions;
    }

    const months = this.monthsInCurrentFilter();
    const incomePerMonth = months.length ? this.cashflowSummary.planned_income / months.length : 0;
    const fixedPerMonth = months.length ? this.cashflowSummary.fixed_expenses / months.length : 0;
    const subscriptionPerMonth = months.length ? this.cashflowSummary.subscriptions / months.length : 0;
    months.forEach((month, index) => {
      if (incomePerMonth > 0) {
        synthetic.push({
          id: -1_000_000 - index,
          date: `${month}-15`,
          type: 'income',
          category: 'Job net income',
          amount: Math.round(incomePerMonth * 100) / 100,
          description: 'Active job income net of taxes and deductions',
          source: 'manual',
          account_display: null,
        });
      }
      if (fixedPerMonth > 0) {
        synthetic.push({
          id: -2_000_000 - index,
          date: `${month}-15`,
          type: 'expense',
          category: 'Fixed expenses',
          amount: Math.round(fixedPerMonth * 100) / 100,
          description: 'Active rent and fixed expenses',
          source: 'manual',
          account_display: null,
        });
      }
      if (subscriptionPerMonth > 0) {
        synthetic.push({
          id: -3_000_000 - index,
          date: `${month}-15`,
          type: 'expense',
          category: 'Subscriptions',
          amount: Math.round(subscriptionPerMonth * 100) / 100,
          description: 'Active recurring subscriptions',
          source: 'manual',
          account_display: null,
        });
      }
    });

    return [...this.filteredTransactions, ...synthetic];
  }

  private monthsInCurrentFilter(): string[] {
    const { start, end } = getDateRange(this.filter);
    if (!start || !end) {
      const now = new Date();
      const months: string[] = [];
      for (let i = 11; i >= 0; i -= 1) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
      }
      return months;
    }
    const startDate = new Date(`${start}T00:00:00`);
    const endDate = new Date(`${end}T00:00:00`);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      return [];
    }
    const months: string[] = [];
    const cursor = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
    const last = new Date(endDate.getFullYear(), endDate.getMonth(), 1);
    while (cursor <= last) {
      months.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`);
      cursor.setMonth(cursor.getMonth() + 1);
    }
    return months;
  }

  private inclusiveDays(start: Date, end: Date): number {
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return 0;
    }
    return Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1);
  }
}
