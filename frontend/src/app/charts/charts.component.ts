import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  Input,
  OnDestroy,
  OnInit,
  ElementRef,
  ViewChild,
  AfterViewInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FinanceService } from '../services/finance.service';
import { Transaction, Holding } from '../models/transaction.model';
import { Subject, debounceTime, takeUntil } from 'rxjs';
import type { Chart as ChartInstance, ChartItem } from 'chart.js';
import { UiCardComponent, UiEmptyStateComponent } from '../shared/ui';
import {
  chartColorAt,
  chartCartesianScales,
  chartLegendBottom,
  chartSuccessColor,
  chartDangerColor,
  chartAccentColor,
  chartTooltipTheme,
} from '../../theme/chart-colors';

type TooltipCtx = { raw: number; dataIndex: number };
type ChartConstructor = new (
  item: ChartItem,
  config: unknown
) => ChartInstance;

@Component({
  selector: 'app-charts',
  standalone: true,
  imports: [CommonModule, UiCardComponent, UiEmptyStateComponent],
  templateUrl: './charts.component.html',
  styleUrl: './charts.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChartsComponent implements OnInit, AfterViewInit, OnDestroy {
  @Input() embedded = false;

  @ViewChild('incomeExpenseChart') incomeExpenseCanvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('categoryChart') categoryCanvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('portfolioChart') portfolioCanvas!: ElementRef<HTMLCanvasElement>;

  transactions: Transaction[] = [];
  holdings: Holding[] = [];
  loading = true;

  incomeTotal = 0;
  expenseTotal = 0;
  netCashflow = 0;
  monthlyRows: { label: string; income: number; expense: number; net: number }[] = [];
  categoryRows: { label: string; value: number; pct: number }[] = [];
  allocationRows: { label: string; value: number; pct: number; companyName?: string | null }[] = [];

  private incomeChart?: ChartInstance;
  private categoryChart?: ChartInstance;
  private portfolioChart?: ChartInstance;
  private render$ = new Subject<void>();
  private destroy$ = new Subject<void>();
  private viewReady = false;
  private chartCtor: ChartConstructor | null = null;
  chartDimmed = false;

  private txOverride: Transaction[] | null = null;

  get hasTxData(): boolean {
    const txs = this.txOverride ?? this.transactions;
    return txs.length > 0;
  }

  @Input() set overrideTransactions(value: Transaction[] | undefined | null) {
    this.txOverride = value ?? null;
    this.computeDerived();
    this.render$.next();
  }

  @Input() set dataReady(value: boolean) {
    if (!this.embedded) {
      return;
    }
    this.loading = !value;
    if (value) {
      this.render$.next();
    }
    this.cdr.markForCheck();
  }

  constructor(
    private financeService: FinanceService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.render$
      .pipe(debounceTime(120), takeUntil(this.destroy$))
      .subscribe(() => void this.schedulePaint());

    this.financeService.transactions$.pipe(takeUntil(this.destroy$)).subscribe(data => {
      this.transactions = data;
      this.computeDerived();
      this.render$.next();
      this.cdr.markForCheck();
    });

    this.financeService.holdings$.pipe(takeUntil(this.destroy$)).subscribe(data => {
      this.holdings = data;
      this.computeDerived();
      this.render$.next();
      this.cdr.markForCheck();
    });

    if (!this.embedded) {
      this.financeService.getTransactions().pipe(takeUntil(this.destroy$)).subscribe();
      this.financeService.getHoldings().pipe(takeUntil(this.destroy$)).subscribe();
      this.loading = false;
      this.cdr.markForCheck();
    }
  }

  ngAfterViewInit() {
    this.viewReady = true;
    void this.schedulePaint();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
    this.incomeChart?.destroy();
    this.categoryChart?.destroy();
    this.portfolioChart?.destroy();
  }

  private async ensureChartCtor(): Promise<ChartConstructor> {
    if (!this.chartCtor) {
      const mod = await import('chart.js/auto');
      this.chartCtor = mod.default as ChartConstructor;
    }
    return this.chartCtor;
  }

  private schedulePaint(): void {
    if (this.embedded && this.loading) {
      return;
    }
    void this.paintCharts();
  }

  private computeDerived() {
    const txs = this.txOverride ?? this.transactions;

    this.incomeTotal = txs
      .filter(t => t.type === 'income')
      .reduce((s, t) => s + t.amount, 0);
    this.expenseTotal = txs
      .filter(t => t.type === 'expense')
      .reduce((s, t) => s + t.amount, 0);
    this.netCashflow = this.incomeTotal - this.expenseTotal;

    const byMonth = new Map<string, { income: number; expense: number }>();
    const byCategory = new Map<string, number>();
    for (const tx of txs) {
      const month = tx.date.slice(0, 7);
      const bucket = byMonth.get(month) || { income: 0, expense: 0 };
      if (tx.type === 'income') {
        bucket.income += tx.amount;
      } else {
        bucket.expense += tx.amount;
        byCategory.set(tx.category, (byCategory.get(tx.category) || 0) + tx.amount);
      }
      byMonth.set(month, bucket);
    }
    this.monthlyRows = [...byMonth.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-12)
      .map(([month, totals]) => ({
        label: this.formatMonth(month),
        income: totals.income,
        expense: totals.expense,
        net: totals.income - totals.expense,
      }));

    const categoryTotal = [...byCategory.values()].reduce((s, v) => s + v, 0);
    this.categoryRows = [...byCategory.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([label, value]) => ({
        label,
        value,
        pct: categoryTotal ? (value / categoryTotal) * 100 : 0,
      }));

    const totalVal = this.holdings.reduce((s, h) => s + (h.value || 0), 0);
    this.allocationRows = [...this.holdings]
      .sort((a, b) => (b.value || 0) - (a.value || 0))
      .map(h => ({
        label: h.symbol,
        value: h.value || 0,
        pct: totalVal ? ((h.value || 0) / totalVal) * 100 : 0,
        companyName: h.company_name || null,
      }));
  }

  private async paintCharts() {
    if (!this.viewReady) {
      return;
    }
    this.chartDimmed = true;
    this.cdr.markForCheck();
    const Chart = await this.ensureChartCtor();
    this.updateIncomeExpense(Chart);
    this.updateCategorySpending(Chart);
    this.updatePortfolio(Chart);
    this.chartDimmed = false;
    this.cdr.markForCheck();
  }

  private chartColors(n: number): string[] {
    return Array.from({ length: n }, (_, i) => chartColorAt(i));
  }

  private upsertChart(
    Chart: ChartConstructor,
    existing: ChartInstance | undefined,
    canvas: HTMLCanvasElement | undefined,
    config: { type: string; data: object; options?: object }
  ): ChartInstance | undefined {
    if (!canvas) return existing;
    const ctx = canvas.getContext('2d');
    if (!ctx) return existing;
    if (existing) {
      existing.data = config.data as typeof existing.data;
      if (config.options) {
        existing.options = config.options as typeof existing.options;
      }
      existing.update('none');
      return existing;
    }
    return new Chart(ctx, config as never);
  }

  private updateIncomeExpense(Chart: ChartConstructor) {
    const canvas = this.incomeExpenseCanvas?.nativeElement;
    if (!canvas || this.monthlyRows.length === 0) {
      this.incomeChart?.destroy();
      this.incomeChart = undefined;
      return;
    }
    this.incomeChart = this.upsertChart(Chart, this.incomeChart, canvas, {
      type: 'bar',
      data: {
        labels: this.monthlyRows.map(r => r.label),
        datasets: [
          {
            label: 'Income',
            data: this.monthlyRows.map(r => r.income),
            backgroundColor: chartSuccessColor(),
            borderRadius: 6,
          },
          {
            label: 'Spending',
            data: this.monthlyRows.map(r => r.expense),
            backgroundColor: chartDangerColor(),
            borderRadius: 6,
          },
          {
            type: 'line',
            label: 'Net cashflow',
            data: this.monthlyRows.map(r => r.net),
            borderColor: chartAccentColor(),
            backgroundColor: chartAccentColor(),
            tension: 0.25,
            pointRadius: 3,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: chartLegendBottom(),
          tooltip: {
            ...chartTooltipTheme(),
            callbacks: { label: (ctx: TooltipCtx) => '$' + Number(ctx.raw).toLocaleString() },
          },
        },
        scales: chartCartesianScales(),
      },
    });
  }

  private updateCategorySpending(Chart: ChartConstructor) {
    const canvas = this.categoryCanvas?.nativeElement;
    if (!canvas || this.categoryRows.length === 0) {
      this.categoryChart?.destroy();
      this.categoryChart = undefined;
      return;
    }
    this.categoryChart = this.upsertChart(Chart, this.categoryChart, canvas, {
      type: 'doughnut',
      data: {
        labels: this.categoryRows.map(r => r.label),
        datasets: [{
          data: this.categoryRows.map(r => r.value),
          backgroundColor: this.chartColors(this.categoryRows.length),
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: chartLegendBottom(),
          tooltip: {
            ...chartTooltipTheme(),
            callbacks: {
              label: (ctx: TooltipCtx) => {
                const row = this.categoryRows[ctx.dataIndex];
                return `${row.label}: $${Number(ctx.raw).toLocaleString()} (${row.pct.toFixed(1)}%)`;
              },
            },
          },
        },
      },
    });
  }

  private formatMonth(value: string): string {
    const [year, month] = value.split('-').map(Number);
    return new Date(year, month - 1, 1).toLocaleString(undefined, {
      month: 'short',
      year: '2-digit',
    });
  }

  private updatePortfolio(Chart: ChartConstructor) {
    const canvas = this.portfolioCanvas?.nativeElement;
    if (!canvas || this.allocationRows.length === 0) {
      this.portfolioChart?.destroy();
      this.portfolioChart = undefined;
      return;
    }
    this.portfolioChart = this.upsertChart(Chart, this.portfolioChart, canvas, {
      type: 'doughnut',
      data: {
        labels: this.allocationRows.map(r => r.label),
        datasets: [{
          data: this.allocationRows.map(r => r.value),
          backgroundColor: this.chartColors(this.allocationRows.length),
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: chartLegendBottom(),
          tooltip: {
            ...chartTooltipTheme(),
            callbacks: {
              label: (ctx: TooltipCtx) => {
                const row = this.allocationRows[ctx.dataIndex];
                const name = row.companyName ? ` - ${row.companyName}` : '';
                return `${row.label}${name}: $${Number(ctx.raw).toLocaleString()} (${row.pct.toFixed(1)}%)`;
              },
            },
          },
        },
      },
    });
  }

}
