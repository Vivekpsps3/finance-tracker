import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TransactionsComponent } from '../transactions/transactions.component';
import { CalendarComponent } from '../calendar/calendar.component';

@Component({
  selector: 'app-spending-hub',
  standalone: true,
  imports: [RouterLink, TransactionsComponent, CalendarComponent],
  template: `
    <div class="page">
      <h1>Spending</h1>
      <nav class="hub-tabs" aria-label="Spending">
        <a [routerLink]="[]" [queryParams]="{ t: 'pay' }" [class.on]="tab === 'pay'">Pay</a>
        <a [routerLink]="[]" [queryParams]="{ t: 'spend' }" [class.on]="tab === 'spend'">Spend</a>
        <a [routerLink]="[]" [queryParams]="{ t: 'calendar' }" [class.on]="tab === 'calendar'">Calendar</a>
      </nav>
      @switch (tab) {
        @case ('calendar') { <app-calendar [embedded]="true" /> }
        @case ('pay') { <app-transactions [embedded]="true" typeFilter="income" /> }
        @default { <app-transactions [embedded]="true" typeFilter="expense" /> }
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SpendingHubComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private cdr = inject(ChangeDetectorRef);
  tab = 'spend';

  ngOnInit(): void {
    this.route.queryParamMap.subscribe(params => {
      const requested = params.get('t');
      this.tab = requested === 'pay' || requested === 'calendar' ? requested : 'spend';
      this.cdr.markForCheck();
    });
  }
}
