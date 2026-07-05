import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { FinanceService } from '../services/finance.service';
import {
  TaxDocument,
  TaxDocumentType,
  TaxSummaryField,
  TaxSummaryValues,
  TaxYearSummary,
} from '../models/transaction.model';
import {
  UiBadgeComponent,
  UiButtonComponent,
  UiCardComponent,
  UiDataTableComponent,
  UiEmptyStateComponent,
  UiPageHeaderComponent,
} from '../shared/ui';
import { ConfirmService } from '../services/confirm.service';

interface TaxField {
  key: TaxSummaryField;
  label: string;
  group: string;
}

@Component({
  selector: 'app-tax-center',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    UiPageHeaderComponent,
    UiCardComponent,
    UiButtonComponent,
    UiBadgeComponent,
    UiDataTableComponent,
    UiEmptyStateComponent,
  ],
  templateUrl: './tax-center.component.html',
  styleUrl: './tax-center.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TaxCenterComponent implements OnInit {
  @ViewChild('taxFileInput') taxFileInput?: ElementRef<HTMLInputElement>;

  taxYear = new Date().getFullYear() - 1;
  summary: TaxYearSummary | null = null;
  isLoading = true;
  isUploading = false;
  isExtracting = false;
  error: string | null = null;
  extractionMessage: string | null = null;
  extractionStatus: 'extracted' | 'manual_review' | null = null;

  uploadFile: File | null = null;
  upload = {
    documentType: 'w2' as TaxDocumentType,
    issuer: '',
    taxpayer: '',
    notes: '',
  };
  fieldValues: Partial<Record<TaxSummaryField, string | number | null>> = {};

  readonly documentTypes: { value: TaxDocumentType; label: string }[] = [
    { value: 'w2', label: 'W-2' },
    { value: '1099', label: '1099' },
    { value: '1098', label: '1098' },
    { value: '5498', label: '5498' },
    { value: '1040', label: '1040 tax return' },
    { value: 'state_return', label: 'State return' },
    { value: 'property_tax', label: 'Property tax' },
    { value: 'other', label: 'Other' },
  ];

  readonly taxFields: TaxField[] = [
    { key: 'wages', label: 'Wages', group: 'W-2 income' },
    { key: 'federal_income_tax_withheld', label: 'Federal withheld', group: 'W-2 income' },
    { key: 'social_security_wages', label: 'Social Security wages', group: 'W-2 income' },
    { key: 'social_security_tax_withheld', label: 'Social Security tax', group: 'W-2 income' },
    { key: 'medicare_wages', label: 'Medicare wages', group: 'W-2 income' },
    { key: 'medicare_tax_withheld', label: 'Medicare tax', group: 'W-2 income' },
    { key: 'state_wages', label: 'State wages', group: 'W-2 income' },
    { key: 'state_income_tax_withheld', label: 'State withheld', group: 'W-2 income' },
    { key: 'interest_income', label: 'Interest income', group: '1099 income' },
    { key: 'ordinary_dividends', label: 'Ordinary dividends', group: '1099 income' },
    { key: 'qualified_dividends', label: 'Qualified dividends', group: '1099 income' },
    { key: 'capital_gain_distributions', label: 'Capital gain distributions', group: '1099 income' },
    { key: 'retirement_contributions', label: 'Retirement contributions', group: 'Retirement' },
    { key: 'agi', label: 'AGI', group: 'Return summary' },
    { key: 'taxable_income', label: 'Taxable income', group: 'Return summary' },
    { key: 'total_tax', label: 'Total tax', group: 'Return summary' },
    { key: 'refund_or_amount_owed', label: 'Refund (+) or owed (-)', group: 'Return summary' },
  ];

  readonly headlineFields: TaxField[] = [
    { key: 'wages', label: 'Wages', group: '' },
    { key: 'federal_income_tax_withheld', label: 'Federal withheld', group: '' },
    { key: 'state_income_tax_withheld', label: 'State withheld', group: '' },
    { key: 'interest_income', label: 'Interest', group: '' },
    { key: 'ordinary_dividends', label: 'Dividends', group: '' },
    { key: 'capital_gain_distributions', label: 'Capital gains', group: '' },
    { key: 'agi', label: 'AGI', group: '' },
    { key: 'taxable_income', label: 'Taxable income', group: '' },
    { key: 'total_tax', label: 'Total tax', group: '' },
    { key: 'refund_or_amount_owed', label: 'Refund / owed', group: '' },
  ];

  constructor(
    private financeService: FinanceService,
    private confirmService: ConfirmService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.loadSummary();
  }

  loadSummary(): void {
    this.isLoading = true;
    this.error = null;
    this.financeService.getTaxYearSummary(this.taxYear).subscribe({
      next: summary => {
        this.summary = summary;
        this.isLoading = false;
        this.cdr.markForCheck();
      },
      error: (err: Error) => {
        this.error = err?.message || 'Could not load tax summary.';
        this.isLoading = false;
        this.cdr.markForCheck();
      },
    });
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.uploadFile = input.files?.[0] ?? null;
    this.extractionMessage = null;
    this.extractionStatus = null;
    if (this.uploadFile) {
      this.extractSelectedDocument();
    }
  }

  extractSelectedDocument(): void {
    if (!this.uploadFile) return;
    this.isExtracting = true;
    this.error = null;
    this.financeService.extractTaxDocument(this.uploadFile).subscribe({
      next: result => {
        for (const [key, value] of Object.entries(result.summary || {})) {
          if (typeof value === 'number') {
            this.fieldValues[key as TaxSummaryField] = value;
          }
        }
        this.extractionStatus = result.status;
        this.extractionMessage =
          result.status === 'extracted'
            ? `${result.message} Confidence ${(result.confidence * 100).toFixed(0)}%.`
            : result.message;
        this.isExtracting = false;
        this.cdr.markForCheck();
      },
      error: (err: Error) => {
        this.extractionStatus = 'manual_review';
        this.extractionMessage = 'Could not extract values from this file. Enter the fields manually before upload.';
        this.error = err?.message || null;
        this.isExtracting = false;
        this.cdr.markForCheck();
      },
    });
  }

  uploadDocument(): void {
    if (!this.uploadFile) {
      this.error = 'Choose a tax document to upload.';
      return;
    }
    this.isUploading = true;
    this.error = null;
    this.financeService.uploadTaxDocument({
      taxYear: this.taxYear,
      documentType: this.upload.documentType,
      issuer: this.upload.issuer,
      taxpayer: this.upload.taxpayer,
      notes: this.upload.notes,
      file: this.uploadFile,
      summary: this.collectSummaryValues(),
    }).subscribe({
      next: () => {
        this.resetUpload();
        this.loadSummary();
      },
      error: (err: Error) => {
        this.error = err?.message || 'Could not upload tax document.';
        this.isUploading = false;
        this.cdr.markForCheck();
      },
    });
  }

  downloadDocument(doc: TaxDocument): void {
    this.financeService.downloadTaxDocument(doc.id).subscribe(blob => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = doc.filename;
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  async deleteDocument(doc: TaxDocument): Promise<void> {
    const confirmed = await this.confirmService.ask(
      'Delete tax document',
      `Delete ${doc.filename}? This removes the stored file and its summary values.`,
      'Delete'
    );
    if (!confirmed) {
      return;
    }
    this.financeService.deleteTaxDocument(doc.id).subscribe({
      next: () => this.loadSummary(),
      error: (err: Error) => {
        this.error = err?.message || 'Could not delete tax document.';
        this.cdr.markForCheck();
      },
    });
  }

  formatMoney(value: number | undefined | null): string {
    if (value === undefined || value === null) {
      return '-';
    }
    return value.toLocaleString(undefined, {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 2,
    });
  }

  fieldLabel(key: string): string {
    return this.taxFields.find(f => f.key === key)?.label || key.replaceAll('_', ' ');
  }

  documentTypeLabel(type: string): string {
    return this.documentTypes.find(t => t.value === type)?.label || type;
  }

  visibleDocumentFields(doc: TaxDocument): { key: string; label: string; value: number }[] {
    return Object.entries(doc.summary || {})
      .filter(([, value]) => typeof value === 'number')
      .map(([key, value]) => ({ key, label: this.fieldLabel(key), value: value as number }));
  }

  private collectSummaryValues(): TaxSummaryValues {
    const values: TaxSummaryValues = {};
    for (const field of this.taxFields) {
      const raw = this.fieldValues[field.key];
      if (raw === undefined || raw === null || raw === '') {
        continue;
      }
      values[field.key] = Number(raw);
    }
    return values;
  }

  private resetUpload(): void {
    this.isUploading = false;
    this.uploadFile = null;
    if (this.taxFileInput?.nativeElement) {
      this.taxFileInput.nativeElement.value = '';
    }
    this.upload = { documentType: 'w2', issuer: '', taxpayer: '', notes: '' };
    this.fieldValues = {};
    this.extractionMessage = null;
    this.extractionStatus = null;
  }
}
