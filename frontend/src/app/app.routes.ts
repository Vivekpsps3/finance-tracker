import { Routes } from '@angular/router';
import { MainLayoutComponent } from './core/layout/main-layout.component';
import { adminGuard, authGuard } from './auth/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    title: 'Sign in · Finance',
    loadComponent: () => import('./auth/login.component').then(m => m.LoginComponent),
  },
  {
    path: '',
    component: MainLayoutComponent,
    canActivate: [authGuard],
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
        path: 'income',
        title: 'Income · Finance',
        loadComponent: () =>
          import('./income/income.component').then(m => m.IncomeComponent),
      },
      {
        path: 'fixed-expenses',
        title: 'Fixed expenses · Finance',
        loadComponent: () =>
          import('./fixed-expenses/fixed-expenses.component').then(m => m.FixedExpensesComponent),
      },
      {
        path: 'subscriptions',
        title: 'Subscriptions · Finance',
        loadComponent: () =>
          import('./subscriptions/subscriptions.component').then(m => m.SubscriptionsComponent),
      },
      {
        path: 'portfolio',
        title: 'Portfolio · Finance',
        loadComponent: () =>
          import('./portfolio/portfolio.component').then(m => m.PortfolioComponent),
      },
      {
        path: 'investment-insights',
        title: 'Investment Insights · Finance',
        loadComponent: () =>
          import('./investment-insights/investment-insights.component').then(
            m => m.InvestmentInsightsComponent
          ),
      },
      {
        path: 'balance-sheet',
        title: 'Balance sheet · Finance',
        loadComponent: () =>
          import('./assets-liabilities/assets-liabilities.component').then(
            m => m.AssetsLiabilitiesComponent
          ),
      },
      {
        path: 'calendar',
        title: 'Calendar · Finance',
        loadComponent: () =>
          import('./calendar/calendar.component').then(m => m.CalendarComponent),
      },
      {
        path: 'planning',
        title: 'Planning · Finance',
        loadComponent: () =>
          import('./planning/planning.component').then(m => m.PlanningComponent),
      },

      {
        path: 'admin/users',
        title: 'Users · Finance',
        canActivate: [adminGuard],
        loadComponent: () =>
          import('./admin/users/admin-users.component').then(m => m.AdminUsersComponent),
      },
    ],
  },
  { path: 'charts', redirectTo: '', pathMatch: 'full' },
];
