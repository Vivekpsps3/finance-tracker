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
import { DateFilter, NetWorth, NetWorthSnapshot, Transaction } from '../models/transaction.model';
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
import { filterByDate, getDefaultDateFilter } from '../utils/date.util';

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
  netWorthSnapshots: NetWorthSnapshot[] = [];
  isLoading = true;
  chartsReady = false;
  isRecordingSnapshot = false;
  error: string | null = null;
  periodIncomeTotal = 0;
  periodExpenseTotal = 0;
  periodNetCashflow = 0;
  periodSavingsRate: number | null = null;
  averageDailySpend = 0;
  largestCategory = '';
  largestCategoryTotal = 0;
  asOfLabel = '';

  filter: DateFilter = getDefaultDateFilter();
  filteredTransactions: Transaction[] = [];
  filterSummary = '';

  readonly periodOptions: UiSelectOption[] = [
    { value: 'month', label: 'By month' },
    { value: 'year', label: 'By year' },
    { value: 'custom', label: 'Custom range' },
    { value: 'all', label: 'All time' },
  ];

  private destroy$ = new Subject<void>();

  constructor(
    private financeService: FinanceService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    combineLatest([
      this.financeService.netWorth$,
      this.financeService.transactions$,
      this.financeService.netWorthSnapshots$,
    ])
      .pipe(takeUntil(this.destroy$))
      .subscribe(([nw, txs, snapshots]) => {
        this.netWorth = nw;
        this.transactions = txs;
        this.netWorthSnapshots = snapshots;
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
    this.periodIncomeTotal = this.filteredTransactions
      .filter(t => t.type === 'income')
      .reduce((s, t) => s + t.amount, 0);
    this.periodExpenseTotal = this.filteredTransactions
      .filter(t => t.type === 'expense')
      .reduce((s, t) => s + t.amount, 0);
    this.periodNetCashflow = this.periodIncomeTotal - this.periodExpenseTotal;
    this.periodSavingsRate = this.periodIncomeTotal > 0
      ? (this.periodNetCashflow / this.periodIncomeTotal) * 100
      : null;

    const days = this.daysInFilter();
    this.averageDailySpend = days > 0 ? this.periodExpenseTotal / days : 0;

    const categoryTotals = new Map<string, number>();
    for (const tx of this.filteredTransactions) {
      if (tx.type !== 'expense') continue;
      categoryTotals.set(tx.category, (categoryTotals.get(tx.category) || 0) + tx.amount);
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

  recordSnapshot() {
    this.isRecordingSnapshot = true;
    this.cdr.markForCheck();
    this.financeService
      .recordNetWorthSnapshot('Manual dashboard snapshot')
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.isRecordingSnapshot = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        error: (err: Error) => {
          const detail = err?.message ? ` ${err.message}` : '';
          this.error = `Could not record net worth snapshot.${detail}`;
          this.cdr.markForCheck();
        },
      });
  }

  latestSnapshotDelta(): number | null {
    if (!this.netWorth || this.netWorthSnapshots.length < 2) {
      return null;
    }
    return this.netWorth.total - this.netWorthSnapshots[1].total;
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
    this.cdr.markForCheck();
  }

  resetFilter() {
    this.filter = getDefaultDateFilter();
    this.applyDateFilter();
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

  private inclusiveDays(start: Date, end: Date): number {
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return 0;
    }
    return Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1);
  }
}
