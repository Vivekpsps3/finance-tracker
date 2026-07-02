import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { FinanceService } from './finance.service';
import { environment } from '../../environments/environment';

describe('FinanceService', () => {
  let service: FinanceService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [FinanceService],
    });
    service = TestBed.inject(FinanceService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('loads transactions into subject', () => {
    const mock = [{ id: 1, date: '2026-01-01', type: 'income' as const, category: 'Salary', amount: 1000 }];
    service.getTransactions().subscribe(data => expect(data).toEqual(mock));
    const req = http.expectOne(
      r => r.url.startsWith(`${environment.apiUrl}/transactions/`) && r.params.get('limit') === '5000'
    );
    expect(req.request.params.get('skip')).toBe('0');
    req.flush(mock);
  });

  it('patches transactions on add without refetching net worth', () => {
    const created = { id: 2, date: '2026-01-02', type: 'income', category: 'Bonus', amount: 20 };
    service.addTransaction({
      date: '2026-01-02',
      type: 'income',
      category: 'Bonus',
      amount: 20,
    }).subscribe();
    http.expectOne(`${environment.apiUrl}/transactions/`).flush(created);
    http.expectNone(`${environment.apiUrl}/net-worth/`);
    service.transactions$.subscribe(list => expect(list[0].id).toBe(2));
  });

  it('paginates with skip and append', () => {
    const page1 = [{ id: 1, date: '2026-01-01', type: 'expense' as const, category: 'A', amount: 1 }];
    const page2 = [{ id: 2, date: '2026-01-02', type: 'expense' as const, category: 'B', amount: 2 }];
    service.getTransactions({ skip: 0, limit: 1, append: false }).subscribe();
    http.expectOne(r => r.params.get('skip') === '0' && r.params.get('limit') === '1').flush(page1);
    service.getTransactions({ skip: 1, limit: 1, append: true }).subscribe();
    http.expectOne(r => r.params.get('skip') === '1').flush(page2);
    service.transactions$.subscribe(list => expect(list.length).toBe(2));
  });

  it('refreshes net worth after addHolding', () => {
    const holding = {
      id: 10,
      symbol: 'AAPL',
      shares: 2,
      purchase_price: 150,
      purchase_date: '2026-01-01',
      current_price: 200,
      market_value: 400,
      price_source: 'live',
    };
    const nw = {
      total: 400,
      portfolio: 400,
      other_assets: 0,
      liabilities: 0,
      total_assets: 400,
    };
    service
      .addHolding({
        symbol: 'AAPL',
        shares: 2,
        purchase_price: 150,
        purchase_date: '2026-01-01',
      })
      .subscribe();
    http.expectOne(`${environment.apiUrl}/holdings/`).flush(holding);
    http.expectOne(`${environment.apiUrl}/net-worth/`).flush(nw);
    service.netWorth$.subscribe(n => expect(n?.total).toBe(400));
  });
});