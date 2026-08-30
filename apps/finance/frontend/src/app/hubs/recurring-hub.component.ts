import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { IncomeComponent } from '../income/income.component';
import { FixedExpensesComponent } from '../fixed-expenses/fixed-expenses.component';
import { SubscriptionsComponent } from '../subscriptions/subscriptions.component';

@Component({
  selector: 'app-recurring-hub',
  standalone: true,
  imports: [RouterLink, IncomeComponent, FixedExpensesComponent, SubscriptionsComponent],
  template: `
    <div class="page">
      <h1>Recurring</h1>
      <nav class="hub-tabs" aria-label="Recurring">
        <a [routerLink]="[]" [queryParams]="{ t: 'pay' }" [class.on]="tab === 'pay'">Pay</a>
        <a [routerLink]="[]" [queryParams]="{ t: 'spend' }" [class.on]="tab === 'spend'">Spend</a>
      </nav>
      @if (tab === 'spend') {
        <app-fixed-expenses [embedded]="true" />
        <app-subscriptions [embedded]="true" />
      } @else {
        <app-income [embedded]="true" />
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RecurringHubComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private cdr = inject(ChangeDetectorRef);
  tab = 'pay';

  ngOnInit(): void {
    this.route.queryParamMap.subscribe(params => {
      const requested = params.get('t');
      this.tab = requested === 'spend' || requested === 'bills' || requested === 'subs' ? 'spend' : 'pay';
      this.cdr.markForCheck();
    });
  }
}
