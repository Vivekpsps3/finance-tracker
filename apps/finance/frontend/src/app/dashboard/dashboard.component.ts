import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Subject, combineLatest, finalize, takeUntil } from 'rxjs';
import { ChartsComponent } from '../charts/charts.component';
import { CashflowSummary, Holding, NetWorth, Transaction } from '../models/transaction.model';
import { FinanceService } from '../services/finance.service';
import { UiButtonComponent, UiCardComponent, UiSkeletonComponent } from '../shared/ui';
import { holdingGain, holdingGainPercent, totalPortfolioValue } from '../utils/portfolio.util';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    ChartsComponent,
    UiButtonComponent,
    UiCardComponent,
    UiSkeletonComponent,
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardComponent implements OnInit, OnDestroy {
  netWorth: NetWorth | null = null;
  cashflow: CashflowSummary | null = null;
  holdings: Holding[] = [];
  transactions: Transaction[] = [];
  isLoading = true;
  error: string | null = null;
  holdingsOpen = true;

  private destroy$ = new Subject<void>();

  constructor(
    private finance: FinanceService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    combineLatest([
      this.finance.netWorth$,
      this.finance.cashflowSummary$,
      this.finance.holdings$,
      this.finance.dashboardTransactions$,
    ])
      .pipe(takeUntil(this.destroy$))
      .subscribe(([netWorth, cashflow, holdings, transactions]) => {
        this.netWorth = netWorth;
        this.cashflow = cashflow;
        this.holdings = holdings;
        this.transactions = transactions;
        this.cdr.markForCheck();
      });
    this.load();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get have(): number {
    return this.netWorth?.total ?? 0;
  }

  get monthPay(): number {
    return this.cashflow?.observed_income ?? 0;
  }

  get monthSpend(): number {
    return this.cashflow?.observed_expenses ?? 0;
  }

  get repeatPay(): number {
    return this.cashflow?.scheduled_income ?? 0;
  }

  get repeatSpend(): number {
    return this.cashflow?.scheduled_expenses ?? 0;
  }

  get portfolioValue(): number {
    return totalPortfolioValue(this.holdings);
  }

  get topHoldings(): Holding[] {
    return [...this.holdings].sort((a, b) => (b.value ?? 0) - (a.value ?? 0)).slice(0, 6);
  }

  holdingValue(row: Holding): number {
    return row.value ?? 0;
  }

  holdingShare(row: Holding): number {
    const total = this.portfolioValue;
    return total > 0 ? ((row.value ?? 0) / total) * 100 : 0;
  }

  gain(row: Holding): number {
    return holdingGain(row);
  }

  gainPct(row: Holding): number {
    return holdingGainPercent(row);
  }

  abs(value: number): number {
    return Math.abs(value);
  }

  retryLoad(): void {
    this.load(true);
  }

  private load(force = false): void {
    this.isLoading = true;
    this.error = null;
    this.cdr.markForCheck();
    this.finance
      .loadDashboard(force)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.isLoading = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        error: (err: Error) => {
          const detail = err?.message ? ` ${err.message}` : '';
          this.error = `The app could not load Home.${detail}`;
          this.cdr.markForCheck();
        },
      });
  }
}
