import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, finalize, takeUntil } from 'rxjs';
import { PlanningService } from '../services/planning.service';
import { ConfirmService } from '../services/confirm.service';
import { ToastService } from '../services/toast.service';
import {
  DEFAULT_MC_ASSUMPTIONS,
  MC_FAN_PATHS_PERSIST_MAX,
  MC_N_PATHS_MIN,
  MC_N_PATHS_MAX,
  MC_TOOL_ID,
  PLANNING_DISCLAIMER,
  PlanningCashflowEvent,
  PlanningCheckpoint,
  PlanningCheckpointResult,
  PlanningInputsPreview,
  PlanningProfile,
  PlanningProjectionRow,
  PlanningRun,
  ProfilePayload,
} from '../models/planning.model';
import { MonteCarloFanChartComponent, McChartData } from './monte-carlo-fan-chart.component';
import {
  UiButtonComponent,
  UiCardComponent,
  UiDataTableComponent,
  UiIconComponent,
  UiPageHeaderComponent,
  UiSkeletonComponent,
} from '../shared/ui';

@Component({
  selector: 'app-planning',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    UiPageHeaderComponent,
    UiCardComponent,
    UiButtonComponent,
    UiSkeletonComponent,
    UiIconComponent,
    UiDataTableComponent,
    MonteCarloFanChartComponent,
  ],
  templateUrl: './planning.component.html',
  styleUrl: './planning.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlanningComponent implements OnInit, OnDestroy {
  readonly disclaimer = PLANNING_DISCLAIMER;
  activeTab: 'overview' | 'monte-carlo' | 'fire' | 'goals' | 'debt' = 'overview';

  loading = true;
  running = false;
  error: string | null = null;

  inputs: PlanningInputsPreview | null = null;
  assumptions: ProfilePayload = structuredClone(DEFAULT_MC_ASSUMPTIONS);

  useTxSpending = true;
  useTxIncome = true;
  useManualNetCashflow = false;
  useInferredAllocation = true;
  useLedgerStartingNetWorth = true;
  startingNetWorth: number | null = null;

  readonly mcNPathsMin = MC_N_PATHS_MIN;
  readonly mcNPathsMax = MC_N_PATHS_MAX;
  readonly mcFanPathsPersistMax = MC_FAN_PATHS_PERSIST_MAX;

  horizonYears = 30;
  nPaths = 500;
  seed = 1;

  fire = {
    withdrawalRate: 0.04,
    extraAnnualExpenses: 0,
    expectedReturn: 0.07,
    savingsGrowth: 0.03,
    includeRecurringExpenses: true,
  };

  goal = {
    name: 'Savings goal',
    targetAmount: 100000,
    currentSaved: 0,
    years: 5,
    expectedReturn: 0.07,
  };

  debt = {
    name: 'Debt',
    balance: 10000,
    apr: 0.08,
    minimumPayment: 250,
    extraPayment: 250,
  };

  lastRun: PlanningRun | null = null;
  chartData: McChartData | null = null;

  profiles: PlanningProfile[] = [];
  selectedProfileId: number | null = null;
  savedInputName = '';
  savingProfile = false;

  private destroy$ = new Subject<void>();

  readonly planningTabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'monte-carlo', label: 'Monte Carlo' },
    { id: 'fire', label: 'FIRE / 4% Rule' },
    { id: 'goals', label: 'Goal Funding' },
    { id: 'debt', label: 'Debt Payoff' },
  ] as const;

  constructor(
    private planning: PlanningService,
    private confirm: ConfirmService,
    private toast: ToastService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.randomizeSeed();
    this.planning.listProfiles().pipe(takeUntil(this.destroy$)).subscribe({
      next: list => {
        this.profiles = list;
        this.cdr.markForCheck();
      },
    });
    this.planning
      .getInputs()
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.loading = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: inp => {
          this.inputs = inp;
          this.assumptions.annual_spending = inp.implied_annual_spending || null;
          this.assumptions.monthly_income = inp.avg_monthly_income || null;
          this.assumptions.extra_contributions.annual_contribution =
            inp.implied_annual_savings || null;
          this.assumptions.portfolio_allocation = this.inferredAllocation();
          this.assumptions.checkpoints = this.defaultCheckpoints(inp);
          this.startingNetWorth = inp.net_worth_total;
          this.goal.currentSaved = Math.max(0, inp.net_worth_total);
          this.debt.balance = Math.max(0, inp.net_worth_liabilities);
        },
        error: err => {
          this.error = err?.message ?? 'Could not load planning inputs.';
        },
      });

  }

  showSpendingFallbackBanner(): boolean {
    if (!this.useTxSpending) return false;
    const src = this.inputs?.annual_spending_source ?? '';
    return src === 'default_fallback_40000' || src.includes('default_fallback');
  }

  setTab(tab: 'overview' | 'monte-carlo' | 'fire' | 'goals' | 'debt'): void {
    this.activeTab = tab;
    this.cdr.markForCheck();
  }

  fireNumber(): number {
    const withdrawalRate = Math.max(0.001, Number(this.fire.withdrawalRate || 0.04));
    return this.fireAnnualSpending() / withdrawalRate;
  }

  fireGap(): number {
    return Math.max(this.fireNumber() - Number(this.inputs?.net_worth_portfolio || 0), 0);
  }

  yearsToFire(): number | null {
    const annualSavings = Math.max(this.effectiveNetCashflow(), 0);
    if (annualSavings <= 0) return null;
    return Math.ceil(this.fireGap() / annualSavings);
  }

  fireAnnualSpending(): number {
    const base = this.fire.includeRecurringExpenses
      ? this.effectiveAnnualSpending()
      : Math.max(0, this.effectiveAnnualSpending() - Number(this.inputs?.recurring_annual_spending || 0));
    return Math.max(0, base + Number(this.fire.extraAnnualExpenses || 0));
  }

  fireProjectedPortfolioAtTarget(): number | null {
    const years = this.yearsToFire();
    if (years == null) return null;
    const current = Math.max(0, Number(this.inputs?.net_worth_portfolio || 0));
    const savings = Math.max(0, this.effectiveNetCashflow());
    const r = Math.max(-0.99, Number(this.fire.expectedReturn || 0));
    if (r === 0) return current + savings * years;
    return current * Math.pow(1 + r, years) + savings * ((Math.pow(1 + r, years) - 1) / r);
  }

  monthlyGoalContribution(): number {
    const target = Math.max(0, Number(this.goal.targetAmount || 0));
    const current = Math.max(0, Number(this.goal.currentSaved || 0));
    const years = Math.max(0.1, Number(this.goal.years || 0));
    const months = Math.max(1, Math.round(years * 12));
    const monthlyReturn = Math.max(-0.99, Number(this.goal.expectedReturn || 0)) / 12;
    const futureCurrent = current * Math.pow(1 + monthlyReturn, months);
    const gap = Math.max(0, target - futureCurrent);
    if (gap <= 0) return 0;
    if (monthlyReturn === 0) return Math.round(gap / months);
    return Math.round((gap * monthlyReturn) / (Math.pow(1 + monthlyReturn, months) - 1));
  }

  goalProjectedValue(): number {
    const contribution = this.monthlyGoalContribution();
    const current = Math.max(0, Number(this.goal.currentSaved || 0));
    const months = Math.max(1, Math.round(Math.max(0.1, Number(this.goal.years || 0)) * 12));
    const monthlyReturn = Math.max(-0.99, Number(this.goal.expectedReturn || 0)) / 12;
    if (monthlyReturn === 0) return current + contribution * months;
    return (
      current * Math.pow(1 + monthlyReturn, months) +
      contribution * ((Math.pow(1 + monthlyReturn, months) - 1) / monthlyReturn)
    );
  }

  debtMonthlyPayment(): number {
    return Number(this.debt.minimumPayment || 0) + Number(this.debt.extraPayment || 0);
  }

  debtPayoffMonths(): number | null {
    const balance = Number(this.debt.balance || 0);
    const payment = this.debtMonthlyPayment();
    const apr = Number(this.debt.apr || 0);
    if (payment <= 0 || balance <= 0) return null;
    const rate = apr / 12;
    let remaining = balance;
    let months = 0;
    while (remaining > 0 && months < 600) {
      remaining = remaining * (1 + rate) - payment;
      months += 1;
    }
    return months >= 600 ? null : months;
  }

  debtTotalInterest(): number | null {
    const balance = Number(this.debt.balance || 0);
    const payment = this.debtMonthlyPayment();
    const apr = Number(this.debt.apr || 0);
    const months = this.debtPayoffMonths();
    if (months == null || balance <= 0 || payment <= 0) return null;
    let remaining = balance;
    let interest = 0;
    const rate = apr / 12;
    for (let i = 0; i < months && remaining > 0; i += 1) {
      const charge = remaining * rate;
      interest += charge;
      remaining = Math.max(0, remaining + charge - payment);
    }
    return interest;
  }

  debtPayoffDate(): string {
    const months = this.debtPayoffMonths();
    if (months == null) return '-';
    const d = new Date();
    d.setMonth(d.getMonth() + months);
    return d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
  }

  private applyRunResult(run: PlanningRun): void {
    this.lastRun = run;
    const art = run.result_artifacts;
    if (art.years && art.percentiles_by_year) {
      this.chartData = {
        years: art.years,
        percentiles: art.percentiles_by_year,
        fanPaths: art.fan_paths,
      };
    }
    if (run.horizon_years != null) this.horizonYears = run.horizon_years;
    if (run.n_paths != null) this.nPaths = run.n_paths;
    if (run.seed != null) this.seed = run.seed;
    this.cdr.markForCheck();
  }

  saveSavedInputs(): void {
    const name = this.savedInputName.trim();
    if (!name) return;
    this.savingProfile = true;
    const body = { name, payload: this.assumptions };
    const req =
      this.selectedProfileId != null
        ? this.planning.updateProfile(this.selectedProfileId, body)
        : this.planning.createProfile(body);
    req
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.savingProfile = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: p => {
          if (this.selectedProfileId != null) {
            this.profiles = this.profiles.map(x => (x.id === p.id ? p : x));
          } else {
            this.profiles = [...this.profiles, p];
            this.selectedProfileId = p.id;
          }
          this.savedInputName = p.name;
          this.toast.success('Saved inputs updated.');
        },
        error: err => {
          this.error = err?.message ?? 'Could not save inputs.';
        },
      });
  }

  onProfileSelected(id: string): void {
    const pid = id === '' ? null : Number.parseInt(id, 10);
    this.selectedProfileId = Number.isFinite(pid as number) ? (pid as number) : null;
    const profile = this.profiles.find(p => p.id === this.selectedProfileId);
    if (!profile?.payload) {
      this.savedInputName = '';
      this.resetAssumptionTogglesToDefaults();
      this.cdr.markForCheck();
      return;
    }
    this.savedInputName = profile.name;
    this.assumptions = structuredClone(profile.payload);
    this.syncTogglesFromProfile(profile.payload);
    this.cdr.markForCheck();
  }

  /** Align UI toggles with saved profile (matches server merge_profile / run overrides). */
  private syncTogglesFromProfile(payload: ProfilePayload): void {
    this.useTxSpending = payload.annual_spending == null;
    this.useTxIncome = payload.monthly_income == null;
    const contrib = payload.extra_contributions?.annual_contribution;
    this.useManualNetCashflow = contrib != null;
    this.useInferredAllocation = payload.portfolio_allocation == null;
    this.useLedgerStartingNetWorth = payload.start_net_worth == null;
    if (!this.useLedgerStartingNetWorth && payload.start_net_worth != null) {
      this.startingNetWorth = payload.start_net_worth;
    } else if (this.inputs) {
      this.startingNetWorth = this.inputs.net_worth_total;
    }
  }

  private resetAssumptionTogglesToDefaults(): void {
    this.useTxSpending = true;
    this.useTxIncome = true;
    this.useManualNetCashflow = false;
    this.useInferredAllocation = true;
    this.useLedgerStartingNetWorth = true;
    if (this.inputs) {
      this.startingNetWorth = this.inputs.net_worth_total;
    }
  }

  async deleteSelectedProfile(): Promise<void> {
    if (this.selectedProfileId == null) return;
    const profile = this.profiles.find(p => p.id === this.selectedProfileId);
    const ok = await this.confirm.ask(
      'Delete profile?',
      `Remove saved inputs "${profile?.name ?? 'preset'}"?`,
      'Delete',
      'Cancel'
    );
    if (!ok) return;
    const id = this.selectedProfileId;
    this.planning
      .deleteProfile(id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.profiles = this.profiles.filter(p => p.id !== id);
          this.selectedProfileId = null;
          this.savedInputName = '';
          this.cdr.markForCheck();
        },
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /** Shown in the annual spending field when “Use transaction spending” is on. */
  txImpliedAnnualSpending(): number | null {
    const v = this.inputs?.implied_annual_spending;
    return v == null || Number.isNaN(v) ? null : v;
  }

  /** Shown in the monthly income field when “Use transaction income” is on. */
  txImpliedMonthlyIncome(): number | null {
    const v = this.inputs?.avg_monthly_income;
    return v == null || Number.isNaN(v) ? null : v;
  }

  onAnnualSpendingInput(value: number | null): void {
    if (!this.useTxSpending) {
      this.assumptions.annual_spending = value;
    }
  }

  onMonthlyIncomeInput(value: number | null): void {
    if (!this.useTxIncome) {
      this.assumptions.monthly_income = value;
    }
  }

  effectiveAnnualSpending(): number {
    if (this.useTxSpending) return this.inputs?.implied_annual_spending ?? 0;
    return Number(this.assumptions.annual_spending ?? 0);
  }

  effectiveAnnualIncome(): number {
    if (this.useTxIncome) return (this.inputs?.avg_monthly_income ?? 0) * 12;
    return Number(this.assumptions.monthly_income ?? 0) * 12;
  }

  effectiveNetCashflow(): number {
    if (this.useManualNetCashflow) {
      return Number(this.assumptions.extra_contributions.annual_contribution ?? 0);
    }
    return this.effectiveAnnualIncome() - this.effectiveAnnualSpending();
  }

  inferredAllocation(): number {
    const inp = this.inputs;
    if (!inp || inp.net_worth_total <= 0) return 0.35;
    const liabilities = Math.max(0, inp.net_worth_liabilities);
    const assets = Math.max(1, inp.net_worth_total + liabilities);
    return Math.min(0.95, Math.max(0.05, inp.net_worth_portfolio / assets || 0.35));
  }

  addCheckpoint(): void {
    this.assumptions.checkpoints = [
      ...this.assumptions.checkpoints,
      {
        label: `Goal ${this.assumptions.checkpoints.length + 1}`,
        year: Math.min(this.horizonYears, 10),
        target_date: null,
        target_net_worth: Math.max(0, (this.inputs?.net_worth_total ?? 0) * 1.5),
        min_success_probability: 0.7,
      },
    ];
  }

  removeCheckpoint(index: number): void {
    this.assumptions.checkpoints = this.assumptions.checkpoints.filter((_, i) => i !== index);
  }

  addEvent(): void {
    this.assumptions.annual_cashflow_events = [
      ...this.assumptions.annual_cashflow_events,
      {
        label: `Event ${this.assumptions.annual_cashflow_events.length + 1}`,
        amount: -10000,
        year: 5,
        start_year: null,
        end_year: null,
        recurring: false,
        interval_years: 1,
        inflation_adjusted: true,
      },
    ];
  }

  removeEvent(index: number): void {
    this.assumptions.annual_cashflow_events = this.assumptions.annual_cashflow_events.filter(
      (_, i) => i !== index
    );
  }

  runSimulation(): void {
    this.running = true;
    this.error = null;
    this.cdr.markForCheck();

    const overrides: Record<string, unknown> = {
      annual_income_growth: this.assumptions.annual_income_growth,
      inflation_cpi: this.assumptions.inflation_cpi,
      nominal_return_mean: this.assumptions.nominal_return_mean,
      nominal_return_std: this.assumptions.nominal_return_std,
      stable_return_mean: this.assumptions.stable_return_mean,
      portfolio_allocation: this.useInferredAllocation
        ? null
        : this.assumptions.portfolio_allocation,
      tax_drag: this.assumptions.tax_drag,
      annual_fee_drag: this.assumptions.annual_fee_drag,
      shock_probability: this.assumptions.shock_probability,
      shock_mean_loss: this.assumptions.shock_mean_loss,
      shock_loss_std: this.assumptions.shock_loss_std,
      start_net_worth: this.useLedgerStartingNetWorth
        ? null
        : Number(this.startingNetWorth ?? this.inputs?.net_worth_total ?? 0),
      annual_spending: this.useTxSpending ? null : this.assumptions.annual_spending,
      monthly_income: this.useTxIncome ? null : this.assumptions.monthly_income,
      extra_contributions: this.useManualNetCashflow
        ? {
            annual_contribution:
              this.assumptions.extra_contributions.annual_contribution ?? null,
          }
        : { annual_contribution: null },
      checkpoints: this.cleanedCheckpoints(),
      annual_cashflow_events: this.cleanedEvents(),
    };

    this.planning
      .createRun({
        tool_id: MC_TOOL_ID,
        profile_id: this.selectedProfileId,
        overrides,
        seed: this.seed,
        n_paths: this.nPaths,
        horizon_years: this.horizonYears,
      })
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.running = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: run => {
          this.applyRunResult(run);
          const p50 = run.result_summary?.terminal_p50;
          const msg =
            p50 != null
              ? `Simulation complete — median ending net worth ${this.formatMoney(p50)}.`
              : 'Simulation complete.';
          this.toast.success(msg);
        },
        error: err => {
          this.error = err?.message ?? 'Simulation failed.';
        },
      });
  }

  fanPathCaption(): string | null {
    const art = this.lastRun?.result_artifacts;
    const summary = this.lastRun?.result_summary;
    const simulated = art?.n_paths_simulated ?? summary?.n_paths;
    const displayed = art?.fan_paths?.length ?? art?.fan_paths_displayed;
    if (!simulated) return null;
    if (displayed != null && displayed < simulated) {
      return `Fan chart shows ${displayed.toLocaleString()} sample paths (evenly spaced from ${simulated.toLocaleString()} simulated). Percentiles use the full run.`;
    }
    return `Fan shows all ${simulated.toLocaleString()} simulated paths.`;
  }

  checkpointRows(): PlanningCheckpointResult[] {
    return this.lastRun?.result_artifacts.checkpoint_results ?? [];
  }

  projectionRows(): PlanningProjectionRow[] {
    return this.lastRun?.result_artifacts.projection_table ?? [];
  }

  formatMoney(n: number | undefined | null): string {
    if (n == null || Number.isNaN(n)) return '-';
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(n);
  }

  formatSignedMoney(n: number | undefined | null): string {
    if (n == null || Number.isNaN(n)) return '-';
    const sign = n > 0 ? '+' : '';
    return `${sign}${this.formatMoney(n)}`;
  }

  formatPct(n: number | undefined | null, source: 'decimal' | 'percent' = 'decimal'): string {
    if (n == null || Number.isNaN(n)) return '-';
    const value = source === 'decimal' ? n * 100 : n;
    return `${value.toFixed(value >= 10 ? 0 : 1)}%`;
  }

  successVariant(): 'success' | 'warning' | 'danger' {
    const p = this.lastRun?.result_summary.success_rate_pct ?? 0;
    if (p >= 75) return 'success';
    if (p >= 45) return 'warning';
    return 'danger';
  }

  trackByIndex(index: number): number {
    return index;
  }

  randomizeSeed(): void {
    const max = 2_147_483_646;
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      const buf = new Uint32Array(1);
      crypto.getRandomValues(buf);
      this.seed = (buf[0] % max) + 1;
    } else {
      this.seed = Math.floor(Math.random() * max) + 1;
    }
    this.cdr.markForCheck();
  }

  private defaultCheckpoints(inp: PlanningInputsPreview): PlanningCheckpoint[] {
    const spend = Math.max(1, inp.implied_annual_spending || 40000);
    return [
      {
        label: 'Five-year checkpoint',
        year: 5,
        target_date: null,
        target_net_worth: Math.max(0, inp.net_worth_total + inp.implied_annual_savings * 5),
        min_success_probability: 0.7,
      },
      {
        label: 'FI target',
        year: Math.min(20, this.horizonYears),
        target_date: null,
        target_net_worth: spend * 25,
        min_success_probability: 0.75,
      },
    ];
  }

  private cleanedCheckpoints(): PlanningCheckpoint[] {
    return this.assumptions.checkpoints
      .filter(cp => cp.label.trim())
      .map(cp => ({
        label: cp.label.trim(),
        year: cp.year === null || cp.year === undefined ? null : Number(cp.year),
        target_date: cp.target_date || null,
        target_net_worth:
          cp.target_net_worth === null || cp.target_net_worth === undefined
            ? null
            : Number(cp.target_net_worth),
        min_success_probability:
          cp.min_success_probability === null || cp.min_success_probability === undefined
            ? null
            : Number(cp.min_success_probability),
      }));
  }

  private cleanedEvents(): PlanningCashflowEvent[] {
    return this.assumptions.annual_cashflow_events
      .filter(ev => ev.label.trim() && Number.isFinite(Number(ev.amount)))
      .map(ev => ({
        label: ev.label.trim(),
        amount: Number(ev.amount),
        year: ev.year === null || ev.year === undefined ? null : Number(ev.year),
        start_year:
          ev.start_year === null || ev.start_year === undefined ? null : Number(ev.start_year),
        end_year: ev.end_year === null || ev.end_year === undefined ? null : Number(ev.end_year),
        recurring: Boolean(ev.recurring),
        interval_years: ev.recurring
          ? Math.min(80, Math.max(0.25, Number(ev.interval_years ?? 1)))
          : 1,
        inflation_adjusted: Boolean(ev.inflation_adjusted),
      }));
  }
}
