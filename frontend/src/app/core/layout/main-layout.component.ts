import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { environment } from '../../../environments/environment';
import { UiIconComponent, UiIconName } from '../../shared/ui';

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
  imports: [RouterOutlet, RouterLink, RouterLinkActive, UiIconComponent],
  templateUrl: './main-layout.component.html',
  styleUrl: './main-layout.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MainLayoutComponent implements OnInit {
  private http = inject(HttpClient);
  private cdr = inject(ChangeDetectorRef);

  apiOffline = false;

  readonly navItems: NavItem[] = [
    { path: '', label: 'Dashboard', shortLabel: 'Home', icon: 'dashboard', exact: true },
    {
      path: 'balance-sheet',
      label: 'Balance sheet',
      shortLabel: 'Balances',
      icon: 'scale',
      exact: false,
    },
    { path: 'portfolio', label: 'Portfolio', shortLabel: 'Portfolio', icon: 'portfolio', exact: false },
    {
      path: 'transactions',
      label: 'Transactions',
      shortLabel: 'Activity',
      icon: 'transactions',
      exact: false,
    },
    { path: 'calendar', label: 'Calendar', shortLabel: 'Calendar', icon: 'calendar', exact: false },
  ];

  ngOnInit() {
    const base = environment.apiUrl || '';
    this.http.get(`${base}/health`, { responseType: 'json' }).subscribe({
      next: () => {
        this.apiOffline = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.apiOffline = true;
        this.cdr.markForCheck();
      },
    });
  }
}