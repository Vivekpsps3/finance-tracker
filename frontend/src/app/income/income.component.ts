import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { FinanceService } from '../services/finance.service';
import { ConfirmService } from '../services/confirm.service';
import { ToastService } from '../services/toast.service';
import { IncomePayFrequency, JobIncome, JobIncomeCreate } from '../models/transaction.model';
import { todayIsoDate } from '../utils/date.util';
import {
  UiBadgeComponent,
  UiButtonComponent,
  UiCardComponent,
  UiDataTableComponent,
  UiEmptyStateComponent,
  UiIconComponent,
  UiPageHeaderComponent,
  UiSelectComponent,
  UiSelectOption,
} from '../shared/ui';

@Component({
  selector: 'app-income',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    UiPageHeaderComponent,
    UiButtonComponent,
    UiCardComponent,
    UiDataTableComponent,
    UiEmptyStateComponent,
    UiIconComponent,
    UiSelectComponent,
    UiBadgeComponent,
  ],
  templateUrl: './income.component.html',
  styleUrl: './income.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IncomeComponent implements OnInit, OnDestroy {
  incomes: JobIncome[] = [];
  showModal = false;
  saving = false;
  editingId: number | null = null;
  form: JobIncomeCreate = this.emptyForm();

  readonly payFrequencyOptions: UiSelectOption[] = [
    { value: 'annual', label: 'Annual salary' },
    { value: 'monthly', label: 'Monthly' },
    { value: 'semimonthly', label: 'Twice monthly' },
    { value: 'biweekly', label: 'Every two weeks' },
    { value: 'weekly', label: 'Weekly' },
    { value: 'hourly', label: 'Hourly' },
  ];

  private destroy$ = new Subject<void>();

  constructor(
    private financeService: FinanceService,
    private confirmService: ConfirmService,
    private toastService: ToastService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.financeService.jobIncomes$.pipe(takeUntil(this.destroy$)).subscribe(rows => {
      this.incomes = rows;
      this.cdr.markForCheck();
    });
    this.financeService.getJobIncomes().pipe(takeUntil(this.destroy$)).subscribe();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get activeAnnualTotal(): number {
    return this.incomes
      .filter(row => row.is_active)
      .reduce((sum, row) => sum + row.annual_gross, 0);
  }

  get activeAnnualNet(): number {
    return this.incomes
      .filter(row => row.is_active)
      .reduce((sum, row) => sum + row.annual_net, 0);
  }

  get activeAnnualAdjustments(): number {
    return this.incomes
      .filter(row => row.is_active)
      .reduce((sum, row) => sum + row.annual_taxes + row.annual_deductions, 0);
  }

  get activeMonthlyTotal(): number {
    return this.activeAnnualNet / 12;
  }

  get formAnnualBase(): number {
    const base = Number(this.form.base_pay || 0);
    if (this.form.pay_frequency === 'monthly') return base * 12;
    if (this.form.pay_frequency === 'semimonthly') return base * 24;
    if (this.form.pay_frequency === 'biweekly') return base * 26;
    if (this.form.pay_frequency === 'weekly') return base * 52;
    if (this.form.pay_frequency === 'hourly') return base * Number(this.form.hours_per_week || 0) * 52;
    return base;
  }

  get formAnnualGross(): number {
    return (
      this.formAnnualBase +
      Number(this.form.annual_bonus || 0) +
      Number(this.form.annual_equity || 0) +
      Number(this.form.annual_other || 0)
    );
  }

  get formAnnualAdjustments(): number {
    return this.formPeriodAdjustments * this.payPeriodsPerYear;
  }

  get formAnnualNet(): number {
    return Math.max(this.formAnnualGross - this.formAnnualAdjustments, 0);
  }

  get formPeriodGross(): number {
    return this.formAnnualGross / this.payPeriodsPerYear;
  }

  get formPeriodAdjustments(): number {
    return Number(this.form.taxes_per_period || 0) + Number(this.form.deductions_per_period || 0);
  }

  get formPeriodNet(): number {
    return Math.max(this.formPeriodGross - this.formPeriodAdjustments, 0);
  }

  get basePayLabel(): string {
    if (this.form.pay_frequency === 'hourly') return 'Hourly rate';
    if (this.form.pay_frequency === 'annual') return 'Annual base pay';
    return 'Base pay per period';
  }

  get payPeriodLabel(): string {
    if (this.form.pay_frequency === 'annual') return 'annual';
    if (this.form.pay_frequency === 'monthly') return 'monthly';
    if (this.form.pay_frequency === 'semimonthly') return 'twice-monthly';
    if (this.form.pay_frequency === 'biweekly') return 'biweekly';
    return 'weekly';
  }

  get payPeriodsPerYear(): number {
    return this.periodsPerYear(this.form.pay_frequency);
  }

  private emptyForm(): JobIncomeCreate {
    return {
      employer: '',
      role_title: '',
      pay_frequency: 'annual',
      base_pay: 0,
      hours_per_week: null,
      annual_bonus: 0,
      annual_equity: 0,
      annual_other: 0,
      annual_taxes: 0,
      annual_deductions: 0,
      taxes_per_period: 0,
      deductions_per_period: 0,
      effective_date: todayIsoDate(),
      is_active: true,
      notes: '',
    };
  }

  openAddModal(): void {
    this.editingId = null;
    this.form = this.emptyForm();
    this.showModal = true;
  }

  openEditModal(row: JobIncome): void {
    this.editingId = row.id;
    this.form = {
      employer: row.employer,
      role_title: row.role_title || '',
      pay_frequency: row.pay_frequency as IncomePayFrequency,
      base_pay: row.base_pay,
      hours_per_week: row.hours_per_week ?? null,
      annual_bonus: row.annual_bonus,
      annual_equity: row.annual_equity,
      annual_other: row.annual_other,
      annual_taxes: row.annual_taxes,
      annual_deductions: row.annual_deductions,
      taxes_per_period: row.taxes_per_period,
      deductions_per_period: row.deductions_per_period,
      effective_date: row.effective_date,
      is_active: row.is_active,
      notes: row.notes || '',
    };
    this.showModal = true;
  }

  closeModal(): void {
    this.showModal = false;
    this.editingId = null;
    this.form = this.emptyForm();
  }

  saveIncome(): void {
    if (!this.form.employer.trim()) {
      this.toastService.error('Employer is required.');
      return;
    }
    if (this.form.base_pay < 0) {
      this.toastService.error('Base pay must be non-negative.');
      return;
    }
    if (this.form.pay_frequency === 'hourly' && !this.form.hours_per_week) {
      this.toastService.error('Hours per week is required for hourly income.');
      return;
    }

    this.saving = true;
    const payload: JobIncomeCreate = {
      ...this.form,
      employer: this.form.employer.trim(),
      role_title: this.form.role_title?.trim() || '',
      notes: this.form.notes?.trim() || '',
      base_pay: this.roundMoney(this.form.base_pay),
      hours_per_week: this.form.pay_frequency === 'hourly' ? this.form.hours_per_week : null,
      annual_bonus: this.roundMoney(this.form.annual_bonus || 0),
      annual_equity: this.roundMoney(this.form.annual_equity || 0),
      annual_other: this.roundMoney(this.form.annual_other || 0),
      taxes_per_period: this.roundMoney(this.form.taxes_per_period || 0),
      deductions_per_period: this.roundMoney(this.form.deductions_per_period || 0),
      annual_taxes: this.roundMoney((this.form.taxes_per_period || 0) * this.payPeriodsPerYear),
      annual_deductions: this.roundMoney((this.form.deductions_per_period || 0) * this.payPeriodsPerYear),
    };
    const request =
      this.editingId !== null
        ? this.financeService.updateJobIncome(this.editingId, payload)
        : this.financeService.addJobIncome(payload);

    request.pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.saving = false;
        this.closeModal();
        this.toastService.success(this.editingId ? 'Income updated' : 'Income added');
        this.cdr.markForCheck();
      },
      error: () => {
        this.saving = false;
        this.cdr.markForCheck();
      },
    });
  }

  async deleteIncome(row: JobIncome): Promise<void> {
    const ok = await this.confirmService.ask(
      'Delete income?',
      `Remove ${row.employer} from your income schema?`,
      'Delete',
      'Cancel'
    );
    if (!ok) return;
    this.financeService.deleteJobIncome(row.id).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => this.toastService.success('Income deleted'),
    });
  }

  payFrequencyLabel(value: string): string {
    return this.payFrequencyOptions.find(option => option.value === value)?.label || value;
  }

  private roundMoney(value: number): number {
    return Math.round((value || 0) * 100) / 100;
  }

  private periodsPerYear(frequency: IncomePayFrequency): number {
    if (frequency === 'monthly') return 12;
    if (frequency === 'semimonthly') return 24;
    if (frequency === 'biweekly') return 26;
    if (frequency === 'weekly' || frequency === 'hourly') return 52;
    return 1;
  }
}
