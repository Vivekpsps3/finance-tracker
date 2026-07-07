import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { ApiHealthService } from '../../services/api-health.service';
import { AuthUser } from '../../auth/auth.models';
import { AuthService } from '../../auth/auth.service';
import { filter } from 'rxjs';
import { UiButtonComponent, UiCardComponent, UiIconComponent, UiIconName } from '../../shared/ui';
import { ConfirmService } from '../../services/confirm.service';
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

  apiOffline = false;
  user: AuthUser | null = null;
  isResettingData = false;
  showTutorial = false;

  /** Absolute paths so nav works from any child route (relative links break e.g. /portfolio/planning). */
  readonly navGroups: NavGroup[] = [
    {
      label: 'Overview',
      shortLabel: 'Home',
      icon: 'dashboard',
      tooltip: 'Current position, cashflow, spending, and portfolio summary.',
      items: [
        {
          path: '/',
          label: 'Dashboard',
          shortLabel: 'Dashboard',
          icon: 'dashboard',
          exact: true,
          tooltip: 'Open the main dashboard: current net worth, period trends, and setup status.',
        },
      ],
    },
    {
      label: 'Activity',
      shortLabel: 'Activity',
      icon: 'transactions',
      tooltip: 'Review what already happened: transactions, imports, and calendar activity.',
      items: [
        {
          path: '/transactions',
          label: 'Transactions',
          shortLabel: 'Txns',
          icon: 'transactions',
          exact: false,
          tooltip: 'Import and review card or bank transactions. These do not change net worth.',
        },
        {
          path: '/calendar',
          label: 'Calendar',
          shortLabel: 'Calendar',
          icon: 'calendar',
          exact: false,
          tooltip: 'See transaction activity by day for the selected month.',
        },
      ],
    },
    {
      label: 'Cashflow',
      shortLabel: 'Cash',
      icon: 'wallet',
      tooltip: 'Model recurring money in and out: paychecks, bills, and subscriptions.',
      items: [
        {
          path: '/income',
          label: 'Income',
          shortLabel: 'Income',
          icon: 'building',
          exact: false,
          tooltip: 'Add job income and realistic tax/deduction estimates for cashflow planning.',
        },
        {
          path: '/fixed-expenses',
          label: 'Bills',
          shortLabel: 'Bills',
          icon: 'credit-card',
          exact: false,
          tooltip: 'Track rent, mortgage, utilities, insurance, and other scheduled fixed bills.',
        },
        {
          path: '/subscriptions',
          label: 'Subscriptions',
          shortLabel: 'Subs',
          icon: 'wallet',
          exact: false,
          tooltip: 'Track recurring software, media, memberships, and services.',
        },
      ],
    },
    {
      label: 'Net Worth',
      shortLabel: 'Worth',
      icon: 'scale',
      tooltip: 'Maintain current assets, debts, and portfolio holdings that drive net worth.',
      items: [
        {
          path: '/balance-sheet',
          label: 'Balance sheet',
          shortLabel: 'Balances',
          icon: 'scale',
          exact: false,
          tooltip: 'Update manual assets and liabilities. This is the current balance-sheet truth.',
        },
        {
          path: '/portfolio',
          label: 'Portfolio',
          shortLabel: 'Portfolio',
          icon: 'portfolio',
          exact: false,
          tooltip: 'Add or import investment holdings that are valued inside net worth.',
        },
      ],
    },
    {
      label: 'Planning',
      shortLabel: 'Plan',
      icon: 'trending',
      tooltip: 'Explore future outcomes without mutating your real ledger or balance sheet.',
      items: [
        {
          path: '/investment-insights',
          label: 'Investment insights',
          shortLabel: 'Insights',
          icon: 'trending',
          exact: false,
          tooltip: 'Run client-side investment growth and withdrawal-rate projections.',
        },
        {
          path: '/planning',
          label: 'Monte Carlo',
          shortLabel: 'MC',
          icon: 'trending',
          exact: false,
          tooltip: 'Run speculative net worth scenarios. Planning never writes ledger truth.',
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
      .subscribe(() => this.cdr.markForCheck());
    this.refreshApiStatus();
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

  logout(): void {
    this.auth.logout();
  }

  async clearMyData(): Promise<void> {
    const confirmed = await this.confirm.ask(
      'Clear your data?',
        'This permanently removes your transactions, imports, assets, liabilities, holdings, cashflow, planning runs, saved planning inputs, and net worth snapshots. Your account and password stay in place.',
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
