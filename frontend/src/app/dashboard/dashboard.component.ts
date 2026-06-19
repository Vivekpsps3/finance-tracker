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
import { Subject, combineLatest, finalize, takeUntil } from 'rxjs';
import { FinanceService } from '../services/finance.service';
import { DateFilter, NetWorth, NetWorthHistoryPoint, Transaction } from '../models/transaction.model';
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
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardComponent implements OnInit, OnDestroy {
  netWorth: NetWorth | null = null;
  transactions: Transaction[] = [];
  history: NetWorthHistoryPoint[] = [];
  isLoading = true;
  chartsReady = false;
  error: string | null = null;
  savingsRate: number | null = null;
  asOfLabel = '';

  filter: DateFilter = getDefaultDateFilter();
  filteredTransactions: Transaction[] = [];
  filteredHistory: NetWorthHistoryPoint[] = [];
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
      this.financeService.netWorthHistory$,
    ])
      .pipe(takeUntil(this.destroy$))
      .subscribe(([nw, txs, hist]) => {
        this.netWorth = nw;
        this.transactions = txs;
        this.history = hist;
        this.applyDateFilter();
        this.cdr.markForCheck();
      });

    this.financeService
      .loadDashboard()
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.isLoading = false;
          this.chartsReady = true;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        error: () => {
          this.error =
            'Could not load dashboard. Start the API (uvicorn) and run ng serve with the dev proxy, then open http://localhost:4200.';
          this.cdr.markForCheck();
        },
      });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private computeInsights() {
    const income = this.filteredTransactions
      .filter(t => t.type === 'income')
      .reduce((s, t) => s + t.amount, 0);
    const expense = this.filteredTransactions
      .filter(t => t.type === 'expense')
      .reduce((s, t) => s + t.amount, 0);
    this.savingsRate = income > 0 ? Math.round(((income - expense) / income) * 1000) / 10 : null;

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
        finalize(() => {
          this.isLoading = false;
          this.chartsReady = true;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        error: () => {
          this.error =
            'Could not load dashboard. Start the API (uvicorn) and run ng serve with the dev proxy.';
          this.cdr.markForCheck();
        },
      });
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
    this.filteredHistory = filterByDate(this.history, this.filter);
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
}