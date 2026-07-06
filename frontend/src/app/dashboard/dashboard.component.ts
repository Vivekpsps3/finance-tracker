import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Subject, combineLatest, finalize, takeUntil, tap } from 'rxjs';
import { FinanceService } from '../services/finance.service';
import {
  CashflowSummary,
  DateFilter,
  FixedExpense,
  JobIncome,
  NetWorth,
  Subscription,
  Transaction,
} from '../models/transaction.model';
import { ChartsComponent } from '../charts/charts.component';
import {
  UiBadgeComponent,
  UiBadgeVariant,
  UiButtonComponent,
  UiCardComponent,
  UiEmptyStateComponent,
  UiPageHeaderComponent,
  UiSelectComponent,
  UiSelectOption,
  UiSkeletonComponent,
  UiIconComponent,
} from '../shared/ui';
import { filterByDate, getDateRange, getDefaultDateFilter } from '../utils/date.util';

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
    UiEmptyStateComponent,
    UiSelectComponent,
    UiIconComponent,
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
  periodNetCashflow = 0;
  periodSavingsRate: number | null = null;
  averageDailySpend = 0;
  largestCategory = '';
  largestCategoryTotal = 0;
  asOfLabel = '';

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
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    combineLatest([
      this.financeService.netWorth$,
      this.financeService.dashboardTransactions$,
      this.financeService.cashflowSummary$,
      this.financeService.jobIncomes$,
      this.financeService.fixedExpenses$,
      this.financeService.subscriptions$,
    ])
      .pipe(takeUntil(this.destroy$))
      .subscribe(([nw, txs, summary, jobIncomes, fixedExpenses, subscriptions]) => {
        this.netWorth = nw;
        this.transactions = txs;
        this.cashflowSummary = summary;
        this.jobIncomes = jobIncomes;
        this.fixedExpenses = fixedExpenses;
        this.subscriptions = subscriptions;
        this.applyDateFilter();
        this.cdr.markForCheck();
      });

    this.financeService
      .loadDashboard()
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
      this.periodIncomeTotal = this.cashflowSummary.total_income;
      this.periodExpenseTotal = this.cashflowSummary.total_expenses;
      this.periodNetCashflow = this.cashflowSummary.net_cashflow;
      this.periodSavingsRate = this.cashflowSummary.savings_rate;
      this.averageDailySpend = this.cashflowSummary.average_daily_spend;
    } else {
      this.periodJobNetIncomeTotal = 0;
      this.periodFixedExpenseTotal = 0;
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
    return this.onboardingCompleteCount < 5;
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
    return 'Mixed sources';
  }

  freshnessBadgeVariant(): UiBadgeVariant {
    const label = this.portfolioFreshness();
    if (label === 'Live prices') return 'success';
    if (label === 'Cached prices' || label === 'Mixed sources') return 'warning';
    return 'default';
  }

  onFilterChange() {
    if (this.filter.mode === 'month' && !this.filter.month) {
      this.filter.month = this.getCurrentMonth();
    }
    if (this.filter.mode === 'year' && !this.filter.year) {
      this.filter.year = new Date().getFullYear();
    }
    this.applyDateFilter();
    this.loadCashflowForFilter();
    this.cdr.markForCheck();
  }

  resetFilter() {
    this.filter = getDefaultDateFilter();
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
    const { start, end } = getDateRange(this.filter);
    if (!start || !end) {
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
