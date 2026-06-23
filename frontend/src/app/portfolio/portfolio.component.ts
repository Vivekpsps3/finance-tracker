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
import { Holding, HoldingCreate, MarketPriceQuote } from '../models/transaction.model';
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
  UiButtonComponent,
  UiCardComponent,
  UiEmptyStateComponent,
  UiPageHeaderComponent,
} from '../shared/ui';

@Component({
  selector: 'app-portfolio',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    UiPageHeaderComponent,
    UiButtonComponent,
    UiCardComponent,
    UiBadgeComponent,
    UiEmptyStateComponent,
  ],
  templateUrl: './portfolio.component.html',
  styleUrl: './portfolio.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PortfolioComponent implements OnInit, OnDestroy {
  holdings: Holding[] = [];
  filteredHoldings: Holding[] = [];
  searchTerm = '';
  showModal = false;
  saving = false;
  loading = false;
  refreshingPrices = false;
  checkingPrice = false;
  priceCheck: MarketPriceQuote | null = null;
  lastPortfolioRefresh: string | null = null;
  editingId: number | null = null;
  newHolding: HoldingCreate = this.emptyHolding();

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
  }

  refreshAllPrices() {
    this.refreshingPrices = true;
    this.financeService.refreshAllHoldingPrices().pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.refreshingPrices = false;
        this.lastPortfolioRefresh = new Date().toLocaleString();
        this.toastService.success('Share prices updated');
      },
      error: () => {
        this.refreshingPrices = false;
      },
    });
  }

  refreshHoldingPrice(h: Holding) {
    this.financeService.refreshHoldingPrice(h.id).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => this.toastService.success(`${h.symbol} price refreshed`),
    });
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
      error: () => {
        this.saving = false;
        this.cdr.markForCheck();
      },
    });
  }

  editHolding(h: Holding) {
    this.editingId = h.id;
    this.newHolding = {
      symbol: h.symbol,
      shares: h.shares,
      purchase_price: h.purchase_price,
      purchase_date: h.purchase_date,
    };
    this.showModal = true;
  }

  closeModal() {
    this.showModal = false;
    this.editingId = null;
    this.newHolding = this.emptyHolding();
    this.priceCheck = null;
  }

  getTotalValue = () => totalPortfolioValue(this.holdings);
  getTotalGain = () => totalPortfolioGain(this.holdings);
  getGain = (h: Holding) => holdingGain(h);
  getGainPercent = (h: Holding) => holdingGainPercent(h);

  priceFreshness(h: Holding): string {
    if (h.price_source === 'live') return 'Live';
    if (h.price_source === 'cached') return 'Cached';
    if (h.price_source === 'fallback_purchase') return 'Est.';
    return '—';
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
}