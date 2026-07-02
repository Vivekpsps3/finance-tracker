import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { PlanningService } from './planning.service';
import { environment } from '../../environments/environment';
import { MC_TOOL_ID } from '../models/planning.model';

describe('PlanningService', () => {
  let service: PlanningService;
  let http: HttpTestingController;
  const base = `${environment.apiUrl}/planning/v1`;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [PlanningService],
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
});