import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { Subject, finalize, takeUntil } from 'rxjs';
import { NetWorth } from '../models/transaction.model';
import { FinanceService } from '../services/finance.service';

@Component({
  selector: 'app-net-worth-embed',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a class="card" href="/" target="_top">
      @if (netWorth) {
        <p class="eyebrow">Net worth</p>
        <p class="total money">\${{ netWorth.total | number: '1.0-0' }}</p>
        <p class="break">
          Assets \${{ netWorth.other_assets | number: '1.0-0' }}
          · Holdings \${{ netWorth.portfolio | number: '1.0-0' }}
          · Debts \${{ netWorth.liabilities | number: '1.0-0' }}
        </p>
      } @else if (error) {
        <p class="break">{{ error }}</p>
      } @else {
        <p class="break">Loading net worth…</p>
      }
    </a>
  `,
  styles: [`
    :host { display:block; min-height:100dvh; background:var(--card-bg); color:var(--text); }
    .card {
      display:flex; flex-direction:column; justify-content:center; box-sizing:border-box;
      min-height:100dvh; padding:24px; color:inherit; text-decoration:none;
      border-left:4px solid var(--accent);
    }
    .eyebrow { margin:0 0 8px; color:var(--text-secondary); font-size:var(--text-sm); font-weight:500; }
    .total { margin:0; font-size:clamp(2rem, 8vw, 2.75rem); font-weight:600; letter-spacing:-0.03em; line-height:1.1; }
    .break { margin:12px 0 0; color:var(--text-secondary); font-size:var(--text-sm); }
  `],
})
export class NetWorthEmbedComponent implements OnInit, OnDestroy {
  netWorth: NetWorth | null = null;
  error: string | null = null;
  private destroy$ = new Subject<void>();

  constructor(
    private finance: FinanceService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.finance
      .getNetWorth()
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => this.cdr.markForCheck())
      )
      .subscribe({
        next: nw => {
          this.netWorth = nw;
          this.cdr.markForCheck();
        },
        error: () => {
          this.error = 'Could not load net worth.';
          this.cdr.markForCheck();
        },
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
