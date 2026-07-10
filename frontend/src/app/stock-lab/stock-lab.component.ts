import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subject, finalize, takeUntil } from 'rxjs';
import { Holding } from '../models/transaction.model';
import { MarketResearchResponse, StockLabScenario } from '../models/stock-lab.model';
import { FinanceService } from '../services/finance.service';
import { MarketResearchService } from '../services/market-research.service';
import { StockLabScenarioService } from '../services/stock-lab-scenario.service';
import { ToastService } from '../services/toast.service';
import { UiButtonComponent, UiCardComponent, UiDataTableComponent, UiEmptyStateComponent, UiIconComponent, UiPageHeaderComponent, UiSkeletonComponent } from '../shared/ui';
import { buildScorecard, calculatePurchasePlan, calculateReturnPeriods, detectDividendCadence, trailingTwelveMonthDividend } from '../utils/stock-lab.util';

@Component({
  selector: 'app-stock-lab',
  standalone: true,
  imports: [CommonModule, FormsModule, UiPageHeaderComponent, UiCardComponent, UiButtonComponent, UiDataTableComponent, UiEmptyStateComponent, UiIconComponent, UiSkeletonComponent],
  templateUrl: './stock-lab.component.html',
  styleUrl: './stock-lab.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StockLabComponent implements OnInit, OnDestroy {
  readonly disclosure = 'Ticker symbols on this page are sent to market data services. Scenario inputs stay encrypted in your vault.';
  readonly calculateReturnPeriods = calculateReturnPeriods;
  scenarios: StockLabScenario[] = [];
  scenario: StockLabScenario;
  holdings: Holding[] = [];
  research: MarketResearchResponse[] = [];
  loading = false;
  saving = false;
  error: string | null = null;
  period = '10y';
  newComparisonSymbol = '';
  private destroy$ = new Subject<void>();

  constructor(
    private market: MarketResearchService,
    private scenariosSvc: StockLabScenarioService,
    private finance: FinanceService,
    private toast: ToastService,
    private cdr: ChangeDetectorRef
  ) {
    this.scenario = this.scenariosSvc.createDefaultScenario('VOO');
  }

  ngOnInit(): void {
    void this.loadScenarios();
    this.finance.holdings$.pipe(takeUntil(this.destroy$)).subscribe(holdings => {
      this.holdings = holdings;
      this.cdr.markForCheck();
    });
    this.finance.getHoldings(false).pipe(takeUntil(this.destroy$)).subscribe();
    this.loadMarketData(false);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get primaryResearch(): MarketResearchResponse | null {
    return this.research.find(row => row.symbol === this.scenario.primary_symbol) ?? this.research[0] ?? null;
  }

  get returnRows() {
    return this.primaryResearch ? calculateReturnPeriods(this.primaryResearch) : [];
  }

  get scorecard() {
    return this.primaryResearch ? buildScorecard(this.primaryResearch, this.ownedExposurePct(this.primaryResearch.symbol)) : [];
  }

  get purchasePlan() {
    if (!this.primaryResearch) return null;
    return calculatePurchasePlan(this.primaryResearch, {
      purchase_mode: this.scenario.purchase_mode,
      shares: this.scenario.shares,
      budget: this.scenario.budget,
      target_price: this.scenario.target_price,
      projection_years: this.scenario.projection_years,
      growth_rate: this.scenario.custom_growth_rate ?? this.scenario.base_growth_rate,
      dividend_growth_rate: this.scenario.dividend_growth_rate,
      reinvest_dividends: this.scenario.reinvest_dividends,
      tax_drag: this.scenario.tax_drag,
      fee_drag: this.scenario.fee_drag,
      inflation_rate: this.scenario.inflation_rate,
    });
  }

  get dividendCadence(): string {
    return this.primaryResearch ? detectDividendCadence(this.primaryResearch.dividends) : 'none';
  }

  get trailingDividend(): number {
    return this.primaryResearch ? trailingTwelveMonthDividend(this.primaryResearch) : 0;
  }

  symbols(): string[] {
    const symbols = [this.scenario.primary_symbol, ...this.scenario.comparison_symbols];
    if (this.scenario.include_owned_symbols) symbols.push(...this.scenario.selected_owned_symbols);
    return Array.from(new Set(symbols.map(symbol => symbol.trim().toUpperCase()).filter(Boolean))).slice(0, 5);
  }

  loadMarketData(refresh: boolean): void {
    const symbols = this.symbols();
    if (symbols.length === 0) return;
    this.loading = true;
    this.error = null;
    this.market.getBatch(symbols, { refresh, period: this.period }).pipe(
      takeUntil(this.destroy$),
      finalize(() => {
        this.loading = false;
        this.cdr.markForCheck();
      })
    ).subscribe({
      next: batch => {
        this.research = batch.results;
        if (batch.failed.length) this.error = batch.failed.map(row => `${row.symbol}: ${row.error}`).join('; ');
      },
      error: err => {
        this.error = err?.error?.detail || err?.message || 'Market research failed.';
      },
    });
  }

  async loadScenarios(): Promise<void> {
    this.scenarios = await this.scenariosSvc.list();
    if (this.scenarios.length && this.scenario.id === 0) this.scenario = { ...this.scenarios[0] };
    this.cdr.markForCheck();
  }

  async saveScenario(): Promise<void> {
    this.saving = true;
    this.cdr.markForCheck();
    try {
      const saved = await this.scenariosSvc.save(this.scenario);
      this.scenario = { ...saved };
      await this.loadScenarios();
      this.toast.success('Stock Lab scenario saved.');
    } finally {
      this.saving = false;
      this.cdr.markForCheck();
    }
  }

  async deleteScenario(): Promise<void> {
    if (!this.scenario.id) return;
    await this.scenariosSvc.delete(this.scenario.id);
    this.scenario = this.scenariosSvc.createDefaultScenario('VOO');
    await this.loadScenarios();
    this.loadMarketData(false);
  }

  selectScenario(id: string): void {
    const parsed = Number(id);
    const found = this.scenarios.find(row => row.id === parsed);
    if (found) {
      this.scenario = { ...found };
      this.loadMarketData(false);
    }
  }

  setPrimarySymbol(symbol: string): void {
    this.scenario = { ...this.scenario, primary_symbol: symbol.trim().toUpperCase() };
  }

  addComparisonSymbol(): void {
    const symbol = this.newComparisonSymbol.trim().toUpperCase();
    if (!symbol || this.symbols().includes(symbol)) return;
    this.scenario.comparison_symbols = [...this.scenario.comparison_symbols, symbol].slice(0, 4);
    this.newComparisonSymbol = '';
    this.loadMarketData(false);
  }

  removeComparisonSymbol(symbol: string): void {
    this.scenario.comparison_symbols = this.scenario.comparison_symbols.filter(row => row !== symbol);
    this.loadMarketData(false);
  }

  addOwnedSymbol(symbol: string): void {
    const upper = symbol.trim().toUpperCase();
    if (!upper || this.scenario.selected_owned_symbols.includes(upper)) return;
    this.scenario.selected_owned_symbols = [...this.scenario.selected_owned_symbols, upper].slice(0, 4);
    this.loadMarketData(false);
  }

  ownedSymbols(): string[] {
    return Array.from(new Set(this.holdings.map(holding => holding.symbol?.trim().toUpperCase()).filter(Boolean)));
  }

  ownedExposurePct(symbol: string): number {
    const total = this.holdings.reduce((sum, holding) => sum + Number(holding.value || 0), 0);
    if (total <= 0) return 0;
    const exposure = this.holdings
      .filter(holding => holding.symbol?.toUpperCase() === symbol.toUpperCase())
      .reduce((sum, holding) => sum + Number(holding.value || 0), 0);
    return (exposure / total) * 100;
  }

  formatMoney(value: number | null | undefined): string {
    if (value == null || Number.isNaN(value)) return '-';
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(value);
  }

  formatPct(value: number | null | undefined): string {
    if (value == null || Number.isNaN(value)) return '-';
    return `${(value * 100).toFixed(Math.abs(value) >= 0.1 ? 1 : 2)}%`;
  }
}
