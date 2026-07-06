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
import {
  BankImportOption,
  ImportCommitResult,
  ImportPreviewResult,
  ImportPreviewRow,
  Transaction,
  TransactionCreate,
} from '../models/transaction.model';
import { ToastService } from '../services/toast.service';
import { ConfirmService } from '../services/confirm.service';
import { todayIsoDate } from '../utils/date.util';
import { downloadCsv } from '../utils/export.util';
import {
  UiBadgeComponent,
  UiButtonComponent,
  UiCardComponent,
  UiEmptyStateComponent,
  UiPageHeaderComponent,
  UiIconComponent,
  UiSelectComponent,
  UiSelectOption,
  UiDataTableComponent,
} from '../shared/ui';

@Component({
  selector: 'app-transactions',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    UiPageHeaderComponent,
    UiButtonComponent,
    UiCardComponent,
    UiBadgeComponent,
    UiEmptyStateComponent,
    UiIconComponent,
    UiSelectComponent,
    UiDataTableComponent,
  ],
  templateUrl: './transactions.component.html',
  styleUrl: './transactions.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TransactionsComponent implements OnInit, OnDestroy {
  transactions: Transaction[] = [];
  filteredTransactions: Transaction[] = [];
  searchTerm = '';
  sortColumn: 'date' | 'category' | 'amount' = 'date';
  sortDirection: 'asc' | 'desc' = 'desc';

  /** YYYY-MM — drives monthly totals on this page */
  summaryMonth = this.currentMonthKey();

  showModal = false;
  showImportModal = false;
  importBanks: BankImportOption[] = [];
  selectedImportBankSlug = '';

  get importBankSelectOptions(): UiSelectOption[] {
    return this.importBanks.map(b => ({ value: b.slug, label: b.name }));
  }
  importStep: 'upload' | 'preview' = 'upload';
  importFile: File | null = null;
  importPreview: ImportPreviewResult | null = null;
  importSelected = new Set<string>();
  importParsing = false;
  importCommitting = false;
  saving = false;
  loading = false;
  newTx: TransactionCreate = this.emptyTx();
  editingTxId: number | null = null;

  monthExpenseTotal = 0;
  monthIncomeTotal = 0;
  categoryMergeFrom = '';
  categoryMergeTo = '';
  categoryMergeSaving = false;
  categoryBulkRows: { fromCategory: string; toCategory: string }[] = [this.emptyBulkRenameRow()];

  readonly pageSize = 200;
  loadingMore = false;
  hasMore = true;
  listLoading = false;

  private destroy$ = new Subject<void>();

  constructor(
    private financeService: FinanceService,
    private toastService: ToastService,
    private confirmService: ConfirmService,
    private cdr: ChangeDetectorRef
  ) {}

  private currentMonthKey(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  private emptyTx(): TransactionCreate {
    return {
      date: todayIsoDate(),
      type: 'expense',
      category: '',
      amount: 0,
      description: '',
    };
  }

  private emptyBulkRenameRow(): { fromCategory: string; toCategory: string } {
    return { fromCategory: '', toCategory: '' };
  }

  ngOnInit() {
    this.financeService.isLoading$.pipe(takeUntil(this.destroy$)).subscribe(l => {
      this.loading = l;
      this.cdr.markForCheck();
    });

    this.financeService.transactions$.pipe(takeUntil(this.destroy$)).subscribe(data => {
      this.transactions = data;
      this.applyFilterAndSort();
      this.cdr.markForCheck();
    });

    this.reloadTransactionList();
  }

  private reloadTransactionList(): void {
    this.listLoading = true;
    this.hasMore = true;
    this.cdr.markForCheck();
    const search = this.searchTerm.trim() || undefined;
    this.financeService
      .getTransactions({ search, skip: 0, limit: this.pageSize, append: false })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: rows => {
          this.listLoading = false;
          this.hasMore = rows.length >= this.pageSize;
          this.cdr.markForCheck();
        },
        error: () => {
          this.listLoading = false;
          this.cdr.markForCheck();
        },
      });
  }

  loadMoreTransactions(): void {
    if (this.loadingMore || !this.hasMore) return;
    this.loadingMore = true;
    const search = this.searchTerm.trim() || undefined;
    const skip = this.transactions.length;
    this.financeService
      .getTransactions({ search, skip, limit: this.pageSize, append: true })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: rows => {
          this.loadingMore = false;
          this.hasMore = rows.length >= this.pageSize;
          this.cdr.markForCheck();
        },
        error: () => {
          this.loadingMore = false;
          this.cdr.markForCheck();
        },
      });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get selectedImportBank(): BankImportOption | undefined {
    return this.importBanks.find(b => b.slug === this.selectedImportBankSlug);
  }

  get summaryMonthLabel(): string {
    const [y, m] = this.summaryMonth.split('-');
    const d = new Date(parseInt(y, 10), parseInt(m, 10) - 1, 1);
    return d.toLocaleString(undefined, { month: 'long', year: 'numeric' });
  }

  get categoryOptions(): string[] {
    return Array.from(
      new Set(this.transactions.map(t => t.category).filter(category => !!category?.trim()))
    ).sort((a, b) => a.localeCompare(b));
  }

  get loadedCategoryMergeCount(): number {
    const from = this.categoryMergeFrom.trim();
    if (!from) return 0;
    return this.transactions.filter(t => t.category === from).length;
  }

  get canMergeCategory(): boolean {
    const from = this.categoryMergeFrom.trim();
    const to = this.categoryMergeTo.trim();
    return !!from && !!to && from !== to && !this.categoryMergeSaving;
  }

  get validBulkRenameRows(): { fromCategory: string; toCategory: string }[] {
    const seen = new Set<string>();
    const rows: { fromCategory: string; toCategory: string }[] = [];
    for (const row of this.categoryBulkRows) {
      const fromCategory = row.fromCategory.trim();
      const toCategory = row.toCategory.trim();
      if (!fromCategory || !toCategory || fromCategory === toCategory || seen.has(fromCategory)) {
        continue;
      }
      seen.add(fromCategory);
      rows.push({ fromCategory, toCategory });
    }
    return rows;
  }

  get canBulkRenameCategories(): boolean {
    return this.validBulkRenameRows.length > 0 && !this.categoryMergeSaving;
  }

  onSummaryMonthChange() {
    this.computeMonthTotals();
    this.cdr.markForCheck();
  }

  private computeMonthTotals() {
    const prefix = `${this.summaryMonth}-`;
    const inMonth = this.transactions.filter(t => t.date.startsWith(prefix));
    this.monthExpenseTotal = inMonth
      .filter(t => t.type === 'expense')
      .reduce((s, t) => s + t.amount, 0);
    this.monthIncomeTotal = inMonth
      .filter(t => t.type === 'income')
      .reduce((s, t) => s + t.amount, 0);
  }

  openImportModal() {
    this.showImportModal = true;
    this.importStep = 'upload';
    this.importFile = null;
    this.importPreview = null;
    this.importSelected.clear();
    this.cdr.markForCheck();
    this.financeService.getImportBanks().pipe(takeUntil(this.destroy$)).subscribe({
      next: banks => {
        this.importBanks = banks;
        this.selectedImportBankSlug = banks[0]?.slug ?? '';
        this.cdr.markForCheck();
      },
    });
  }

  onImportBankChange() {
    this.importFile = null;
    this.importPreview = null;
    this.importStep = 'upload';
    this.importSelected.clear();
    this.cdr.markForCheck();
  }

  closeImportModal() {
    this.showImportModal = false;
    this.importFile = null;
    this.importPreview = null;
    this.importSelected.clear();
  }

  onImportFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const bank = this.selectedImportBank;
    if (bank?.file_extensions?.length) {
      const ok = bank.file_extensions.some(ext =>
        file.name.toLowerCase().endsWith(ext.toLowerCase())
      );
      if (!ok) {
        this.toastService.error(`Please choose a file: ${bank.file_extensions.join(', ')}`);
        return;
      }
    }
    this.importFile = file;
    this.cdr.markForCheck();
  }

  runImportPreview() {
    if (!this.importFile) {
      this.toastService.error('Choose a CSV file first.');
      return;
    }
    if (!this.selectedImportBankSlug) {
      this.toastService.error('Select a bank.');
      return;
    }
    this.importParsing = true;
    this.financeService
      .previewBankImport(this.selectedImportBankSlug, this.importFile)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: preview => {
          this.importParsing = false;
          this.importPreview = preview;
          this.importStep = 'preview';
          this.importSelected.clear();
          for (const row of preview.rows) {
            if (row.status === 'new') {
              this.importSelected.add(row.dedupe_key);
            }
          }
          this.cdr.markForCheck();
        },
        error: () => {
          this.importParsing = false;
          this.cdr.markForCheck();
        },
      });
  }

  toggleImportRow(row: ImportPreviewRow) {
    if (row.status !== 'new') return;
    if (this.importSelected.has(row.dedupe_key)) {
      this.importSelected.delete(row.dedupe_key);
    } else {
      this.importSelected.add(row.dedupe_key);
    }
    this.cdr.markForCheck();
  }

  isImportRowSelected(row: ImportPreviewRow): boolean {
    return this.importSelected.has(row.dedupe_key);
  }

  selectAllNewImportRows() {
    if (!this.importPreview) return;
    for (const row of this.importPreview.rows) {
      if (row.status === 'new') {
        this.importSelected.add(row.dedupe_key);
      }
    }
    this.cdr.markForCheck();
  }

  commitImport() {
    if (!this.importPreview || !this.importFile) return;
    const rows = this.importPreview.rows.filter(r => this.importSelected.has(r.dedupe_key));
    if (!rows.length) {
      this.toastService.error('Select at least one new transaction to import.');
      return;
    }
    this.importCommitting = true;
    this.financeService
      .commitBankImport(this.selectedImportBankSlug, this.importPreview.filename, rows)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res: ImportCommitResult) => {
          this.importCommitting = false;
          this.closeImportModal();
          this.toastService.success(`Imported ${res.inserted} transaction(s)`);
          this.cdr.markForCheck();
        },
        error: () => {
          this.importCommitting = false;
          this.cdr.markForCheck();
        },
      });
  }

  openAddModal() {
    this.editingTxId = null;
    this.newTx = this.emptyTx();
    this.showModal = true;
  }

  applyFilterAndSort() {
    let result = [...this.transactions];
    // Search is applied server-side when reloading; sort remains client-side on loaded rows.

    result.sort((a, b) => {
      let valA: string | number;
      let valB: string | number;
      if (this.sortColumn === 'date') {
        valA = a.date;
        valB = b.date;
      } else if (this.sortColumn === 'amount') {
        valA = a.amount;
        valB = b.amount;
      } else {
        valA = a.category;
        valB = b.category;
      }
      if (valA < valB) return this.sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return this.sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    this.filteredTransactions = result;
    this.computeMonthTotals();
    this.cdr.markForCheck();
  }

  onSearchChange() {
    this.reloadTransactionList();
  }

  async mergeCategory(): Promise<void> {
    const from = this.categoryMergeFrom.trim();
    const to = this.categoryMergeTo.trim();
    if (!from || !to) {
      this.toastService.error('Choose a source and target category.');
      return;
    }
    if (from === to) {
      this.toastService.error('Choose two different categories.');
      return;
    }

    const ok = await this.confirmService.ask(
      'Merge category?',
      `Rename every "${from}" transaction to "${to}"?`,
      'Merge',
      'Cancel'
    );
    if (!ok) return;

    this.categoryMergeSaving = true;
    this.financeService
      .renameCategory(from, to)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: result => {
          this.categoryMergeSaving = false;
          this.categoryMergeFrom = '';
          this.categoryMergeTo = '';
          this.applyFilterAndSort();
          this.toastService.success(`Updated ${result.updated} transaction(s)`);
          this.cdr.markForCheck();
        },
        error: () => {
          this.categoryMergeSaving = false;
          this.cdr.markForCheck();
        },
      });
  }

  addBulkRenameRow(): void {
    this.categoryBulkRows = [...this.categoryBulkRows, this.emptyBulkRenameRow()];
    this.cdr.markForCheck();
  }

  removeBulkRenameRow(index: number): void {
    this.categoryBulkRows = this.categoryBulkRows.filter((_, i) => i !== index);
    if (this.categoryBulkRows.length === 0) {
      this.categoryBulkRows = [this.emptyBulkRenameRow()];
    }
    this.cdr.markForCheck();
  }

  async bulkRenameCategories(): Promise<void> {
    const rows = this.validBulkRenameRows;
    if (!rows.length) {
      this.toastService.error('Add at least one valid category rename.');
      return;
    }

    const ok = await this.confirmService.ask(
      'Bulk rename categories?',
      `Apply ${rows.length} category rename(s) across all transactions?`,
      'Rename',
      'Cancel'
    );
    if (!ok) return;

    this.categoryMergeSaving = true;
    this.financeService
      .bulkRenameCategories(rows)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: result => {
          this.categoryMergeSaving = false;
          this.categoryBulkRows = [this.emptyBulkRenameRow()];
          this.applyFilterAndSort();
          this.toastService.success(`Updated ${result.updated} transaction(s)`);
          this.cdr.markForCheck();
        },
        error: () => {
          this.categoryMergeSaving = false;
          this.cdr.markForCheck();
        },
      });
  }

  toggleSort(column: 'date' | 'category' | 'amount') {
    if (this.sortColumn === column) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortColumn = column;
      this.sortDirection = 'desc';
    }
    this.applyFilterAndSort();
  }

  sortIcon(column: string): string {
    if (this.sortColumn !== column) return '↕';
    return this.sortDirection === 'asc' ? '↑' : '↓';
  }

  saveTransaction() {
    if (!this.newTx.category?.trim() || this.newTx.amount <= 0) {
      this.toastService.error('Category and a positive amount are required.');
      return;
    }

    this.saving = true;
    const payload: TransactionCreate = {
      ...this.newTx,
      category: this.newTx.category.trim(),
      amount: Math.round(this.newTx.amount * 100) / 100,
    };

    const req =
      this.editingTxId !== null
        ? this.financeService.updateTransaction(this.editingTxId, payload)
        : this.financeService.addTransaction(payload);

    req.pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.saving = false;
        this.closeModal();
        this.toastService.success(
          this.editingTxId ? 'Transaction updated' : 'Transaction added'
        );
      },
      error: () => {
        this.saving = false;
      },
    });
  }

  editTransaction(tx: Transaction) {
    this.editingTxId = tx.id;
    this.newTx = {
      date: tx.date,
      type: tx.type,
      category: tx.category,
      amount: tx.amount,
      description: tx.description || '',
    };
    this.showModal = true;
  }

  closeModal() {
    this.showModal = false;
    this.editingTxId = null;
    this.newTx = this.emptyTx();
  }

  async deleteTransaction(tx: Transaction) {
    const ok = await this.confirmService.ask(
      'Delete transaction?',
      `Remove ${tx.category} (${tx.date}) permanently?`,
      'Delete',
      'Cancel'
    );
    if (!ok) return;

    const backup: TransactionCreate = {
      date: tx.date,
      type: tx.type,
      category: tx.category,
      amount: tx.amount,
      description: tx.description,
    };

    this.financeService.deleteTransaction(tx.id).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.toastService.success('Transaction deleted', () => {
          this.financeService.addTransaction(backup).subscribe();
        });
      },
    });
  }

  exportToCsv() {
    downloadCsv(
      'transactions.csv',
      ['Date', 'Type', 'Account', 'Category', 'Description', 'Amount'],
      this.filteredTransactions.map(t => [
        t.date,
        t.type,
        t.account_display || '',
        t.category,
        t.description || '',
        t.amount,
      ])
    );
  }

  trackByTxId(_: number, tx: Transaction) {
    return tx.id;
  }
}
