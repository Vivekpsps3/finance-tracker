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
}

interface NavGroup {
  label: string;
  shortLabel: string;
  icon: UiIconName;
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

  /** Absolute paths so nav works from any child route (relative links break e.g. /portfolio/planning). */
  readonly navGroups: NavGroup[] = [
    {
      label: 'Overview',
      shortLabel: 'Home',
      icon: 'dashboard',
      items: [{ path: '/', label: 'Dashboard', shortLabel: 'Dashboard', icon: 'dashboard', exact: true }],
    },
    {
      label: 'Money',
      shortLabel: 'Money',
      icon: 'transactions',
      items: [
        { path: '/transactions', label: 'Transactions', shortLabel: 'Activity', icon: 'transactions', exact: false },
        { path: '/income', label: 'Income', shortLabel: 'Income', icon: 'building', exact: false },
        { path: '/fixed-expenses', label: 'Fixed expenses', shortLabel: 'Fixed', icon: 'credit-card', exact: false },
        { path: '/subscriptions', label: 'Subscriptions', shortLabel: 'Subs', icon: 'wallet', exact: false },
        { path: '/balance-sheet', label: 'Balance sheet', shortLabel: 'Balances', icon: 'scale', exact: false },
        { path: '/calendar', label: 'Calendar', shortLabel: 'Calendar', icon: 'calendar', exact: false },
      ],
    },
    {
      label: 'Investing',
      shortLabel: 'Invest',
      icon: 'portfolio',
      items: [
        { path: '/portfolio', label: 'Portfolio', shortLabel: 'Portfolio', icon: 'portfolio', exact: false },
        { path: '/investment-insights', label: 'Investment Insights', shortLabel: 'Insights', icon: 'trending', exact: false },
      ],
    },
    {
      label: 'Planning',
      shortLabel: 'Plan',
      icon: 'trending',
      items: [{ path: '/planning', label: 'Planning Tools', shortLabel: 'Tools', icon: 'trending', exact: false }],
    },
    {
      label: 'Taxes',
      shortLabel: 'Taxes',
      icon: 'document',
      items: [{ path: '/taxes', label: 'Tax Center', shortLabel: 'Tax Center', icon: 'document', exact: false }],
    },
    {
      label: 'Admin',
      shortLabel: 'Admin',
      icon: 'building',
      adminOnly: true,
      items: [{ path: '/admin/users', label: 'Users', shortLabel: 'Users', icon: 'building', exact: false }],
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
      'This permanently removes your transactions, imports, assets, liabilities, holdings, cashflow, planning runs, saved planning inputs, tax documents, and net worth snapshots. Your account and password stay in place.',
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

  refreshApiStatus(): void {
    this.health.checkWithRetries().subscribe(ok => {
      this.apiOffline = !ok;
      this.cdr.markForCheck();
    });
  }
}
