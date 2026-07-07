import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { PlanningService } from './planning.service';
import { environment } from '../../environments/environment';
import { MC_TOOL_ID } from '../models/planning.model';
import { VaultService } from '../crypto/vault.service';
import { EncryptedStoreService } from '../crypto/encrypted-store.service';

describe('PlanningService', () => {
  let service: PlanningService;
  let http: HttpTestingController;
  let vault: { usesEncryptedStore: boolean };
  let encStore: jasmine.SpyObj<EncryptedStoreService>;
  const base = `${environment.apiUrl}/planning/v1`;

  beforeEach(() => {
    vault = { usesEncryptedStore: false };
    encStore = jasmine.createSpyObj<EncryptedStoreService>('EncryptedStoreService', [
      'getNetWorth',
      'getJobIncomes',
      'getFixedExpenses',
      'getSubscriptions',
      'getTransactions',
      'listPlanningProfiles',
      'savePlanningProfile',
      'deletePlanningProfile',
    ]);
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        PlanningService,
        { provide: VaultService, useValue: vault },
        { provide: EncryptedStoreService, useValue: encStore },
      ],
    });
    service = TestBed.inject(PlanningService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('createRun posts Monte Carlo payload', () => {
    const body = {
      tool_id: MC_TOOL_ID,
      overrides: { annual_spending: 50_000 },
      n_paths: 500,
      horizon_years: 30,
      seed: 1,
    };
    const mockRun = {
      id: null,
      status: 'completed',
      tool_id: MC_TOOL_ID,
      seed: 1,
      disclaimer: 'Educational only',
      result_summary: { terminal_p50: 1_000_000 },
      result_artifacts: { percentiles_by_year: { p50: [100_000] } },
    };
    service.createRun(body).subscribe(run => expect(run.status).toBe('completed'));
    const req = http.expectOne(`${base}/runs`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body.tool_id).toBe(MC_TOOL_ID);
    expect(req.request.body.n_paths).toBe(500);
    req.flush(mockRun);
  });

  it('listProfiles returns array', () => {
    const profiles = [{ id: 1, name: 'Base', base_currency: 'USD', payload: {} }];
    service.listProfiles().subscribe(list => expect(list[0].name).toBe('Base'));
    const req = http.expectOne(`${base}/profiles`);
    expect(req.request.method).toBe('GET');
    req.flush(profiles);
  });

  it('client Monte Carlo returns the backend-compatible run shape in encrypted mode', done => {
    vault.usesEncryptedStore = true;
    encStore.getNetWorth.and.resolveTo({
      other_assets: 100_000,
      portfolio: 50_000,
      liabilities: 25_000,
      total_assets: 150_000,
      total: 125_000,
      as_of: '2026-01-01T00:00:00.000Z',
    });
    encStore.getJobIncomes.and.resolveTo([{ id: 1, monthly_net: 8_000 } as any]);
    encStore.getFixedExpenses.and.resolveTo([{ id: 1, annual_amount: 36_000 } as any]);
    encStore.getSubscriptions.and.resolveTo([{ id: 1, annual_amount: 1_200 } as any]);
    encStore.getTransactions.and.resolveTo([]);

    service
      .createRun({ tool_id: MC_TOOL_ID, n_paths: 100, horizon_years: 3, seed: 7 })
      .subscribe({
        next: run => {
          expect(run.id).toBeNull();
          expect(run.input_snapshot_hash).toContain('client-');
          expect(run.as_of).toMatch(/^\d{4}-\d{2}-\d{2}$/);
          expect(run.started_at).toBeTruthy();
          expect(run.finished_at).toBeTruthy();
          expect(run.result_artifacts.years).toEqual([0, 1, 2, 3]);
          expect(run.result_artifacts.percentiles_by_year?.['p50'].length).toBe(4);
          expect((run.result_artifacts as any).percentile_paths).toBeUndefined();
          expect(run.result_summary.terminal_p50).toBe(
            run.result_artifacts.percentiles_by_year?.['p50'][3]
          );
          http.expectNone(`${base}/runs`);
          done();
        },
        error: done.fail,
      });
  });
});
