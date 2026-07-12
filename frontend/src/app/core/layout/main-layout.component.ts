import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { ApiHealthService } from '../../services/api-health.service';
import { AuthUser } from '../../auth/auth.models';
import { AuthService } from '../../auth/auth.service';
import { filter } from 'rxjs';
import { UiButtonComponent, UiCardComponent, UiIconComponent, UiIconName } from '../../shared/ui';
import { ConfirmService } from '../../services/confirm.service';
import { VaultService } from '../../crypto/vault.service';
import { FinanceService } from '../../services/finance.service';
import { ToastService } from '../../services/toast.service';

export interface NavItem {
  path: string;
  label: string;
  shortLabel: string;
  icon: UiIconName;
  exact: boolean;
  tooltip: string;
}

interface NavGroup {
  label: string;
  shortLabel: string;
  icon: UiIconName;
  tooltip: string;
  adminOnly?: boolean;
  items: NavItem[];
}

@Component({
  selector: 'app-main-layout',
  standalone: true,
  imports: [RouterOutlet, RouterLink, UiIconComponent, UiCardComponent, UiButtonComponent],
  templateUrl: './main-layout.component.html',
  styleUrl: './main-layout.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MainLayoutComponent implements OnInit {
  private health = inject(ApiHealthService);
  private cdr = inject(ChangeDetectorRef);
  private auth = inject(AuthService);
  private router = inject(Router);
  private confirm = inject(ConfirmService);
  private finance = inject(FinanceService);
  private toast = inject(ToastService);
  private vault = inject(VaultService);

  apiOffline = false;
  user: AuthUser | null = null;
  isResettingData = false;
  showTutorial = false;

  /** Absolute paths so nav works from any child route (relative links break e.g. /portfolio/planning). */
  /** Primary surfaces first: position → net worth inputs → cashflow → activity → planning. */
  readonly navGroups: NavGroup[] = [
    {
      label: 'Overview',
      shortLabel: 'Home',
      icon: 'dashboard',
      tooltip: 'Current net worth and cashflow outlook.',
      items: [
        {
          path: '/',
          label: 'Dashboard',
          shortLabel: 'Dashboard',
          icon: 'dashboard',
          exact: true,
          tooltip: 'Current net worth, cashflow outlook, and local signals.',
        },
      ],
    },
    {
      label: 'Net Worth',
      shortLabel: 'Worth',
      icon: 'scale',
      tooltip: 'Assets, debts, and portfolio holdings that drive net worth.',
      items: [
        {
          path: '/balance-sheet',
          label: 'Balance sheet',
          shortLabel: 'Balances',
          icon: 'scale',
          exact: false,
          tooltip: 'Manual assets and liabilities — current balance-sheet truth.',
        },
        {
          path: '/portfolio',
          label: 'Portfolio',
          shortLabel: 'Portfolio',
          icon: 'portfolio',
          exact: false,
          tooltip: 'Holdings valued inside net worth (manual or Fidelity import).',
        },
      ],
    },
    {
      label: 'Cashflow',
      shortLabel: 'Cash',
      icon: 'wallet',
      tooltip: 'Recurring paychecks, bills, and subscriptions.',
      items: [
        {
          path: '/income',
          label: 'Income',
          shortLabel: 'Income',
          icon: 'building',
          exact: false,
          tooltip: 'Job income and tax/deduction estimates.',
        },
        {
          path: '/fixed-expenses',
          label: 'Bills',
          shortLabel: 'Bills',
          icon: 'credit-card',
          exact: false,
          tooltip: 'Rent, utilities, insurance, and other fixed bills.',
        },
        {
          path: '/subscriptions',
          label: 'Subscriptions',
          shortLabel: 'Subs',
          icon: 'wallet',
          exact: false,
          tooltip: 'Recurring software, media, and memberships.',
        },
      ],
    },
    {
      label: 'Activity',
      shortLabel: 'Activity',
      icon: 'transactions',
      tooltip: 'Imported transactions and calendar (do not change net worth).',
      items: [
        {
          path: '/transactions',
          label: 'Transactions',
          shortLabel: 'Txns',
          icon: 'transactions',
          exact: false,
          tooltip: 'Import and review card/bank transactions.',
        },
        {
          path: '/calendar',
          label: 'Calendar',
          shortLabel: 'Calendar',
          icon: 'calendar',
          exact: false,
          tooltip: 'Transaction activity by day.',
        },
      ],
    },
    {
      label: 'Planning',
      shortLabel: 'Plan',
      icon: 'trending',
      tooltip: 'Speculative tools — never mutate ledger or balance sheet.',
      items: [
        {
          path: '/planning',
          label: 'Monte Carlo',
          shortLabel: 'MC',
          icon: 'trending',
          exact: false,
          tooltip: 'Speculative net worth scenarios.',
        },
        {
          path: '/investment-insights',
          label: 'Investment insights',
          shortLabel: 'Insights',
          icon: 'trending',
          exact: false,
          tooltip: 'Client-side growth and withdrawal projections.',
        },
        {
          path: '/stock-lab',
          label: 'Stock Lab',
          shortLabel: 'Stocks',
          icon: 'trending',
          exact: false,
          tooltip: 'Hypothetical stock/ETF analysis.',
        },
      ],
    },
  ];

  ngOnInit() {
    this.auth.user$.subscribe(user => {
      this.user = user;
      this.cdr.markForCheck();
    });
    this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe(() => {
        this.cdr.markForCheck();
        this.focusMainContent();
      });
    this.refreshApiStatus();
  }

  private focusMainContent(): void {
    queueMicrotask(() => {
      const main = document.getElementById('main-content');
      if (!main) return;
      const heading = main.querySelector<HTMLElement>('h1, h2, .ui-page-header h1, .ui-page-header h2');
      const target = heading ?? main;
      if (!target.hasAttribute('tabindex')) {
        target.tabIndex = -1;
      }
      target.focus({ preventScroll: true });
    });
  }

  get isAdmin(): boolean {
    return this.user?.role === 'admin';
  }

  get visibleNavGroups(): NavGroup[] {
    return this.navGroups.filter(group => !group.adminOnly || this.isAdmin);
  }

  get activeNavGroup(): NavGroup {
    return this.visibleNavGroups.find(group => group.items.some(item => this.isActiveItem(item))) ?? this.visibleNavGroups[0];
  }

  isActiveGroup(group: NavGroup): boolean {
    return group.items.some(item => this.isActiveItem(item));
  }

  isActiveItem(item: NavItem): boolean {
    const url = this.router.url.split('?')[0].split('#')[0];
    return item.exact ? url === item.path : url === item.path || url.startsWith(`${item.path}/`);
  }

  lockVault(): void {
    this.finance.clearSessionState();
    this.vault.lock();
    void this.router.navigateByUrl('/vault/unlock');
  }

  logout(): void {
    this.auth.logout();
  }

  async clearMyData(): Promise<void> {
    const confirmed = await this.confirm.ask(
      'Clear your data?',
        'This permanently removes your transactions, imports, assets, liabilities, holdings, cashflow, planning runs, saved planning inputs, and net worth snapshots. Your account and sign-in enrollment stay in place. Vault access still requires your passphrase.',
      'Clear my data'
    );
    if (!confirmed) return;
    this.isResettingData = true;
    this.cdr.markForCheck();
    this.finance.resetMyData().subscribe({
      next: () => {
        this.isResettingData = false;
        this.toast.success('Your data has been cleared');
        this.router.navigate(['/']);
        this.cdr.markForCheck();
      },
      error: err => {
        this.isResettingData = false;
        this.toast.error(err?.error?.detail || 'Could not clear your data');
        this.cdr.markForCheck();
      },
    });
  }

  openTutorial(): void {
    this.showTutorial = true;
    this.cdr.markForCheck();
  }

  closeTutorial(): void {
    this.showTutorial = false;
    this.cdr.markForCheck();
  }

  refreshApiStatus(): void {
    this.health.checkWithRetries().subscribe(ok => {
      this.apiOffline = !ok;
      this.cdr.markForCheck();
    });
  }
}
