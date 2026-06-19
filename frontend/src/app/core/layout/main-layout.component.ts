import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { environment } from '../../../environments/environment';

export interface NavItem {
  path: string;
  label: string;
  exact: boolean;
}

@Component({
  selector: 'app-main-layout',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './main-layout.component.html',
  styleUrl: './main-layout.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MainLayoutComponent implements OnInit {
  private http = inject(HttpClient);
  private cdr = inject(ChangeDetectorRef);

  apiOffline = false;

  readonly navItems: NavItem[] = [
    { path: '', label: 'Dashboard', exact: true },
    { path: 'transactions', label: 'Transactions', exact: false },
    { path: 'portfolio', label: 'Portfolio', exact: false },
    { path: 'calendar', label: 'Calendar', exact: false },
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