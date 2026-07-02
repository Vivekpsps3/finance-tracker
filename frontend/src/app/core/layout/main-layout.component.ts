import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ApiHealthService } from '../../services/api-health.service';
import { UiButtonComponent, UiCardComponent, UiIconComponent, UiIconName } from '../../shared/ui';

export interface NavItem {
  path: string;
  label: string;
  shortLabel: string;
  icon: UiIconName;
  exact: boolean;
}

@Component({
  selector: 'app-main-layout',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, UiIconComponent, UiCardComponent, UiButtonComponent],
  templateUrl: './main-layout.component.html',
  styleUrl: './main-layout.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MainLayoutComponent implements OnInit {
  private health = inject(ApiHealthService);
  private cdr = inject(ChangeDetectorRef);

  apiOffline = false;

  /** Absolute paths so nav works from any child route (relative links break e.g. /portfolio/planning). */
  readonly navItems: NavItem[] = [
    { path: '/', label: 'Dashboard', shortLabel: 'Home', icon: 'dashboard', exact: true },
    {
      path: '/balance-sheet',
      label: 'Balance sheet',
      shortLabel: 'Balances',
      icon: 'scale',
      exact: false,
    },
    { path: '/portfolio', label: 'Portfolio', shortLabel: 'Portfolio', icon: 'portfolio', exact: false },
    {
      path: '/transactions',
      label: 'Transactions',
      shortLabel: 'Activity',
      icon: 'transactions',
      exact: false,
    },
    { path: '/calendar', label: 'Calendar', shortLabel: 'Calendar', icon: 'calendar', exact: false },
    { path: '/taxes', label: 'Tax Center', shortLabel: 'Taxes', icon: 'document', exact: false },
    { path: '/planning', label: 'Monte Carlo', shortLabel: 'MC', icon: 'spark', exact: false },
  ];

  ngOnInit() {
    this.refreshApiStatus();
  }

  refreshApiStatus(): void {
    this.health.checkWithRetries().subscribe(ok => {
      this.apiOffline = !ok;
      this.cdr.markForCheck();
    });
  }
}
