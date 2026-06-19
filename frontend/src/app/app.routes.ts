import { Routes } from '@angular/router';
import { MainLayoutComponent } from './core/layout/main-layout.component';

export const routes: Routes = [
  {
    path: '',
    component: MainLayoutComponent,
    children: [
      {
        path: '',
        title: 'Dashboard · Finance',
        loadComponent: () =>
          import('./dashboard/dashboard.component').then(m => m.DashboardComponent),
      },
      {
        path: 'transactions',
        title: 'Transactions · Finance',
        loadComponent: () =>
          import('./transactions/transactions.component').then(m => m.TransactionsComponent),
      },
      {
        path: 'portfolio',
        title: 'Portfolio · Finance',
        loadComponent: () =>
          import('./portfolio/portfolio.component').then(m => m.PortfolioComponent),
      },
      {
        path: 'calendar',
        title: 'Calendar · Finance',
        loadComponent: () =>
          import('./calendar/calendar.component').then(m => m.CalendarComponent),
      },
    ],
  },
  { path: 'charts', redirectTo: '', pathMatch: 'full' },
];