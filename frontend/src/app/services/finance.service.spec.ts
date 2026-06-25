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
    http.expectOne(`${environment.apiUrl}/transactions/?limit=5000`).flush(mock);
  });

  it('patches transactions on add', () => {
    const created = { id: 2, date: '2026-01-02', type: 'income', category: 'Bonus', amount: 20 };
    service.addTransaction({
      date: '2026-01-02',
      type: 'income',
      category: 'Bonus',
      amount: 20,
    }).subscribe();
    http.expectOne(`${environment.apiUrl}/transactions/`).flush(created);
    http.expectOne(`${environment.apiUrl}/net-worth/`).flush({
      other_assets: 0,
      portfolio: 0,
      liabilities: 0,
      total_assets: 0,
      total: 0,
    });
    service.transactions$.subscribe(list => expect(list[0].id).toBe(2));
  });
});