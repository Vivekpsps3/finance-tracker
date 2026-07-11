import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { CommonModule, KeyValuePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { FinanceService } from '../services/finance.service';
import {
  Holding,
  HoldingCreate,
  MarketPriceQuote,
  NetWorth,
  FidelityImportOption,
  FidelityPreviewResult,
  FidelityPreviewRow,
  FidelityCommitResult,
} from '../models/transaction.model';
import { ToastService } from '../services/toast.service';
import { ConfirmService } from '../services/confirm.service';
import { todayIsoDate } from '../utils/date.util';
import { downloadCsv } from '../utils/export.util';
import {
  holdingGain,
  holdingGainPercent,
  totalPortfolioGain,
  totalPortfolioValue,
} from '../utils/portfolio.util';
import {
  UiBadgeComponent,
  UiBadgeVariant,
  UiButtonComponent,
  UiCardComponent,
  UiEmptyStateComponent,
  UiPageHeaderComponent,
  UiDataTableComponent,
  UiDialogComponent,
} from '../shared/ui';

@Component({
  selector: 'app-portfolio',
  standalone: true,
  imports: [
    CommonModule,
    KeyValuePipe,
    FormsModule,
    UiPageHeaderComponent,
    UiButtonComponent,
    UiCardComponent,
    UiBadgeComponent,
    UiEmptyStateComponent,
    UiDataTableComponent,
    UiDialogComponent,
  ],
  templateUrl: './portfolio.component.html',
  styleUrl: './portfolio.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PortfolioComponent implements OnInit, OnDestroy {
  holdings: Holding[] = [];
  filteredHoldings: Holding[] = [];
  netWorth: NetWorth | null = null;
  searchTerm = '';
  showModal = false;
  saving = false;
  loading = false;
  refreshingPrices = false;
  checkingPrice = false;
  priceCheck: MarketPriceQuote | null = null;
  lastPortfolioRefresh: string | null = null;

  // Fidelity import state (modeled on Transactions import)
  showFidelityImportModal = false;
  fidelityImportStep: 'upload' | 'preview' = 'upload';
  fidelityImportFile: File | null = null;
  fidelityImportPreview: FidelityPreviewResult | null = null;
  fidelityImportParsing = false;
  fidelityImportCommitting = false;
  selectedFidelityAccounts = new Set<string>();  // use account_mask for selected replaces
  editingId: number | null = null;
  newHolding: HoldingCreate = this.emptyHolding();

  // Nickname editing
  editingNicknameFor: number | null = null;
  nicknameDraft: string = '';

  private destroy$ = new Subject<void>();

  constructor(
    private financeService: FinanceService,
    private toastService: ToastService,
    private confirmService: ConfirmService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.financeService.isLoading$.pipe(takeUntil(this.destroy$)).subscribe();
    this.financeService.holdings$.pipe(takeUntil(this.destroy$)).subscribe(data => {
      this.holdings = data;
      this.applyFilter();
      this.cdr.markForCheck();
    });
    this.financeService.netWorth$.pipe(takeUntil(this.destroy$)).subscribe(data => {
      this.netWorth = data;
      this.cdr.markForCheck();
    });
    this.financeService.getHoldings().pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.loading = false;
        this.cdr.markForCheck();
      },
    });
    this.financeService.getNetWorth().pipe(takeUntil(this.destroy$)).subscribe();
    this.loading = true;
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private emptyHolding(): HoldingCreate {
    return {
      symbol: '',
      shares: 0,
      purchase_price: 0,
      purchase_date: todayIsoDate(),
    };
  }

  openAddModal() {
    this.editingId = null;
    this.newHolding = this.emptyHolding();
    this.priceCheck = null;
    this.showModal = true;
    this.cdr.markForCheck();
  }

  refreshAllPrices() {
    if (!this.financeService.canRefreshHoldingPrices) return;
    this.refreshingPrices = true;
    this.financeService.refreshAllHoldingPrices().pipe(takeUntil(this.destroy$)).subscribe({
      next: result => {
        this.refreshingPrices = false;
        this.lastPortfolioRefresh = new Date().toLocaleString();
        this.toastService.success(
          result.failed
            ? `Updated ${result.updated} holding price(s); ${result.failed} ticker(s) unavailable`
            : `Updated ${result.updated} holding price(s)`
        );
        this.cdr.markForCheck();
      },
      error: () => {
        this.refreshingPrices = false;
        this.cdr.markForCheck();
      },
    });
  }

  refreshHoldingPrice(h: Holding) {
    if (!this.financeService.canRefreshHoldingPrices) return;
    this.financeService.refreshHoldingPrice(h.id).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => this.toastService.success(`${h.symbol} price refreshed`),
    });
  }

  get canRefreshPrices(): boolean {
    return true;
  }

  get canImportFidelity(): boolean {
    return this.financeService.canImportFidelity;
  }

  checkSharePrice() {
    const symbol = this.newHolding.symbol.trim().toUpperCase();
    if (!symbol) {
      this.toastService.error('Enter a symbol to check price.');
      return;
    }
    this.checkingPrice = true;
    this.priceCheck = null;
    this.financeService.lookupSharePrice(symbol, true).pipe(takeUntil(this.destroy$)).subscribe({
      next: quote => {
        this.checkingPrice = false;
        this.priceCheck = quote;
        if (quote.valid && this.newHolding.purchase_price <= 0) {
          this.newHolding.purchase_price = quote.price;
        }
      },
      error: () => {
        this.checkingPrice = false;
      },
    });
  }

  formatPriceTime(iso: string | null | undefined): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleString();
  }

  addOrUpdateHolding() {
    const symbol = this.newHolding.symbol.trim().toUpperCase();
    if (!symbol || this.newHolding.shares <= 0 || this.newHolding.purchase_price <= 0) {
      this.toastService.error('Symbol, shares, and cost basis are required.');
      return;
    }

    this.saving = true;
    const payload: HoldingCreate = {
      ...this.newHolding,
      symbol,
    };

    const req =
      this.editingId !== null
        ? this.financeService.updateHolding(this.editingId, payload)
        : this.financeService.addHolding(payload);

    req.pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.saving = false;
        this.closeModal();
        this.toastService.success(this.editingId ? 'Holding updated' : 'Holding added');
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.saving = false;
        this.toastService.error('Failed to save holding. Please try again.');
        console.error('Holding save error', err);
        this.cdr.markForCheck();
      },
    });
  }

  editHolding(h: Holding) {
    this.editingId = h.id;
    const purchaseDate = h.purchase_date ? String(h.purchase_date).split('T')[0] : todayIsoDate();
    this.newHolding = {
      symbol: h.symbol,
      shares: h.shares,
      purchase_price: h.purchase_price,
      purchase_date: purchaseDate,
    };
    this.showModal = true;
    this.cdr.markForCheck();
  }

  closeModal() {
    this.showModal = false;
    this.editingId = null;
    this.newHolding = this.emptyHolding();
    this.priceCheck = null;
  }

  canSave(): boolean {
    const s = (this.newHolding?.symbol || '').trim();
    return s.length > 0 &&
           (this.newHolding?.shares || 0) > 0 &&
           (this.newHolding?.purchase_price || 0) > 0 &&
           !!this.newHolding?.purchase_date;
  }

  getTotalValue = () => totalPortfolioValue(this.holdings);
  getTotalGain = () => totalPortfolioGain(this.holdings);
  getGain = (h: Holding) => holdingGain(h);
  getGainPercent = (h: Holding) => holdingGainPercent(h);

  /** Grouped view for better account breakdown.
   *  Fidelity gets special treatment with sub-accounts.
   */
  get accountGroups() {
    const brokerageSubs: { [key: string]: Holding[] } = {};
    const manual: Holding[] = [];

    for (const h of this.filteredHoldings) {
      if (h.brokerage_account_id != null) {
        // Key by account id so nicknames don't accidentally merge different accounts
        const key = `ba-${h.brokerage_account_id}`;
        if (!brokerageSubs[key]) brokerageSubs[key] = [];
        brokerageSubs[key].push(h);
      } else {
        manual.push(h);
      }
    }

    const fidelityGroups = Object.keys(brokerageSubs).map(key => {
      const hs = brokerageSubs[key];
      const first = hs[0];
      const label = first?.account_display || 'Brokerage Account';
      return {
        label,
        holdings: hs,
        totalValue: hs.reduce((sum, h) => sum + (h.value || 0), 0),
        brokerageAccountId: first?.brokerage_account_id || null,
      };
    }).sort((a, b) => a.label.localeCompare(b.label));

    return {
      fidelity: fidelityGroups,
      fidelityTotal: fidelityGroups.reduce((s, g) => s + g.totalValue, 0),
      manual,
      manualTotal: manual.reduce((s, h) => s + (h.value || 0), 0),
    };
  }

  priceSourceBadgeVariant(h: Holding): UiBadgeVariant {
    const src = h.price_source ?? '';
    if (src === 'live' || src === 'live_eod') return 'success';
    if (src === 'error') return 'danger';
    if (src === 'fallback_purchase' || src === 'non_ticker') return 'warning';
    if (src === 'cached' || src === 'sqlite_eod' || src.startsWith('redis')) return 'default';
    return 'warning';
  }

  priceFreshness(h: Holding): string {
    const src = h.price_source ?? '';
    if (src === 'live' || src === 'live_eod') return 'Live';
    if (src === 'cached') return 'Cached';
    if (src === 'sqlite_eod') return 'EOD cache';
    if (src.startsWith('redis')) return 'Cached';
    if (src === 'fallback_purchase') return 'Cost basis';
    if (src === 'non_ticker') return 'No ticker';
    if (src === 'error') return 'Unavailable';
    return src || 'Unknown';
  }

  priceSourceHint(h: Holding): string | null {
    const src = h.price_source ?? '';
    if (src === 'fallback_purchase') return 'Using purchase price; refresh or fix symbol.';
    if (src === 'non_ticker') return 'Symbol is not a market ticker (e.g. CUSIP or sweep).';
    if (src === 'error') return 'Live quote failed; value may use cost basis.';
    return null;
  }

  applyFilter() {
    if (!this.searchTerm) {
      this.filteredHoldings = this.holdings;
    } else {
      const term = this.searchTerm.toLowerCase();
      this.filteredHoldings = this.holdings.filter(h => h.symbol.toLowerCase().includes(term));
    }
  }

  onSearchChange() {
    this.applyFilter();
  }

  async deleteHolding(h: Holding) {
    const ok = await this.confirmService.ask(
      'Delete holding?',
      `Remove ${h.symbol} from your portfolio? You can undo right after.`,
      'Delete',
      'Cancel'
    );
    if (!ok) return;

    const backup: HoldingCreate = {
      symbol: h.symbol,
      shares: h.shares,
      purchase_price: h.purchase_price,
      purchase_date: h.purchase_date,
    };

    this.financeService.deleteHolding(h.id).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.toastService.success('Holding deleted', () => {
          this.financeService.addHolding(backup).subscribe();
        });
      },
    });
  }

  exportToCsv() {
    downloadCsv(
      'holdings.csv',
      ['Symbol', 'Shares', 'Cost Basis', 'Current Price', 'Market Value', 'Gain', 'Price Source'],
      this.filteredHoldings.map(h => [
        h.symbol,
        h.shares,
        h.purchase_price,
        h.current_price ?? h.purchase_price,
        h.value ?? 0,
        this.getGain(h),
        h.price_source ?? '',
      ])
    );
  }

  trackByHoldingId(_: number, h: Holding) {
    return h.id;
  }

  startEditNickname(accountId: number | null | undefined, currentLabel: string) {
    if (!accountId) return;
    this.editingNicknameFor = accountId;
    this.nicknameDraft = currentLabel || '';
    this.cdr.markForCheck();
  }

  cancelEditNickname() {
    this.editingNicknameFor = null;
    this.nicknameDraft = '';
    this.cdr.markForCheck();
  }

  saveNickname() {
    if (!this.editingNicknameFor) return;
    const id = this.editingNicknameFor;
    this.financeService.setAccountNickname(id, this.nicknameDraft.trim() || null).subscribe({
      next: () => {
        this.editingNicknameFor = null;
        this.nicknameDraft = '';
        this.cdr.markForCheck();
      },
    });
  }

  // Fidelity import (replaces positions for accounts in CSV)
  openFidelityImportModal() {
    this.showFidelityImportModal = true;
    this.fidelityImportStep = 'upload';
    this.fidelityImportFile = null;
    this.fidelityImportPreview = null;
    this.selectedFidelityAccounts.clear();
    this.cdr.markForCheck();
    this.financeService.getBrokerageImports().pipe(takeUntil(this.destroy$)).subscribe({
      next: (opts) => {
        // auto select fidelity if present
        if (opts.length) {
          // no selected slug needed, we hard use 'fidelity' route
        }
        this.cdr.markForCheck();
      },
    });
  }

  closeFidelityImportModal() {
    this.showFidelityImportModal = false;
    this.fidelityImportFile = null;
    this.fidelityImportPreview = null;
    this.selectedFidelityAccounts.clear();
  }

  onFidelityFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.fidelityImportFile = file;
    this.cdr.markForCheck();
  }

  runFidelityPreview() {
    if (!this.fidelityImportFile) {
      this.toastService.error('Choose a Fidelity CSV file first.');
      return;
    }
    this.fidelityImportParsing = true;
    this.financeService
      .previewFidelityImport(this.fidelityImportFile)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (preview) => {
          this.fidelityImportParsing = false;
          this.fidelityImportPreview = preview;
          this.fidelityImportStep = 'preview';
          this.selectedFidelityAccounts.clear();
          // select all for replace
          for (const row of preview.rows) {
            this.selectedFidelityAccounts.add(row.account_mask);
          }
          this.cdr.markForCheck();
        },
        error: () => {
          this.fidelityImportParsing = false;
          this.cdr.markForCheck();
        },
      });
  }

  async commitFidelityImport() {
    if (!this.fidelityImportPreview || !this.fidelityImportFile) return;
    const selectedMasks = Array.from(this.selectedFidelityAccounts);
    if (!selectedMasks.length) {
      this.toastService.error('No accounts selected to replace.');
      return;
    }
    const rowsToSend = this.fidelityImportPreview.rows.filter(r =>
      this.selectedFidelityAccounts.has(r.account_mask)
    );
    if (!rowsToSend.length) {
      this.toastService.error('Select accounts to import.');
      return;
    }

    const accountLabels = this.fidelityImportPreview.accounts.filter(a => {
      const mask = this.extractMaskFromDisplay(a);
      return this.selectedFidelityAccounts.has(mask);
    });
    const accountList = accountLabels.length
      ? accountLabels.map(a => `• ${a}`).join('\n')
      : selectedMasks.map(m => `• ···${m}`).join('\n');

    const ok = await this.confirmService.ask(
      'Replace Fidelity holdings?',
      `This permanently removes existing positions for each selected account and replaces them with the CSV.\n\nAccounts:\n${accountList}\n\n${rowsToSend.length} position row(s) will be imported.`,
      'Replace holdings',
      'Cancel'
    );
    if (!ok) return;

    this.fidelityImportCommitting = true;
    this.cdr.markForCheck();
    this.financeService
      .commitFidelityImport(this.fidelityImportPreview.filename, rowsToSend)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res: FidelityCommitResult) => {
          this.fidelityImportCommitting = false;
          this.closeFidelityImportModal();
          this.toastService.success(
            `Replaced ${res.holdings_replaced} holdings, inserted ${res.inserted} for ${res.accounts_replaced} account(s)`
          );
          this.cdr.markForCheck();
        },
        error: () => {
          this.fidelityImportCommitting = false;
          this.cdr.markForCheck();
        },
      });
  }

  isFidelityAccountSelected(mask: string): boolean {
    return this.selectedFidelityAccounts.has(mask);
  }

  toggleFidelityAccount(mask: string) {
    if (this.selectedFidelityAccounts.has(mask)) {
      this.selectedFidelityAccounts.delete(mask);
    } else {
      this.selectedFidelityAccounts.add(mask);
    }
    this.cdr.markForCheck();
  }

  // Helpers for modal using display string (simple parse for demo)
  isFidelityAccountSelectedForDisplay(display: string): boolean {
    const mask = this.extractMaskFromDisplay(display);
    return this.selectedFidelityAccounts.has(mask);
  }

  toggleFidelityAccountFromDisplay(display: string) {
    const mask = this.extractMaskFromDisplay(display);
    this.toggleFidelityAccount(mask);
  }

  private extractMaskFromDisplay(display: string): string {
    // "Fidelity ···Z21741448 (Individual)" -> "Z21741448"
    const m = display.match(/···([^ (]+)/);
    return m ? m[1] : display;
  }
}
