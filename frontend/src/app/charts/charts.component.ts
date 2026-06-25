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
  CHART_COLORS,
  chartAccentColor,
  chartCartesianScales,
  chartLegendBottom,
  chartSuccessColor,
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
  @ViewChild('portfolioChart') portfolioCanvas!: ElementRef<HTMLCanvasElement>;

  transactions: Transaction[] = [];
  holdings: Holding[] = [];
  loading = true;

  incomeTotal = 0;
  allocationRows: { label: string; value: number; pct: number; companyName?: string | null }[] = [];

  private incomeChart?: ChartInstance;
  private portfolioChart?: ChartInstance;
  private render$ = new Subject<void>();
  private destroy$ = new Subject<void>();
  private viewReady = false;
  private chartCtor: ChartConstructor | null = null;
  private paintInFlight: Promise<void> | null = null;

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
    this.paintInFlight = this.paintCharts().finally(() => {
      this.paintInFlight = null;
    });
  }

  private computeDerived() {
    const txs = this.txOverride ?? this.transactions;

    this.incomeTotal = txs
      .filter(t => t.type === 'income')
      .reduce((s, t) => s + t.amount, 0);

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
    const Chart = await this.ensureChartCtor();
    this.updateIncomeExpense(Chart);
    this.updatePortfolio(Chart);
    this.cdr.markForCheck();
  }

  private chartColors(n: number): string[] {
    return Array.from({ length: n }, (_, i) => CHART_COLORS[i % CHART_COLORS.length]);
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
    if (!canvas || this.incomeTotal <= 0) {
      this.incomeChart?.destroy();
      this.incomeChart = undefined;
      return;
    }
    this.incomeChart = this.upsertChart(Chart, this.incomeChart, canvas, {
      type: 'bar',
      data: {
        labels: ['Income'],
        datasets: [{
          label: 'Amount',
          data: [this.incomeTotal],
          backgroundColor: [chartSuccessColor()],
          borderRadius: 6,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            ...chartTooltipTheme(),
            callbacks: { label: (ctx: TooltipCtx) => '$' + Number(ctx.raw).toLocaleString() },
          },
        },
        scales: chartCartesianScales(),
      },
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