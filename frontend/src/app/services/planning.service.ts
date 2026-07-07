import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, from, timeout } from 'rxjs';
import { apiUrl } from '../core/api-url';
import { EncryptedStoreService } from '../crypto/encrypted-store.service';
import { VaultService } from '../crypto/vault.service';
import {
  MC_RUN_HTTP_TIMEOUT_MS,
  PLANNING_DISCLAIMER,
  PlanningInputsPreview,
  PlanningProfile,
  PlanningProfileCreate,
  PlanningRun,
  PlanningRunCreate,
} from '../models/planning.model';

@Injectable({ providedIn: 'root' })
export class PlanningService {
  private readonly base = apiUrl('/planning/v1');

  constructor(
    private http: HttpClient,
    private vault: VaultService,
    private encStore: EncryptedStoreService
  ) {}

  getInputs(): Observable<PlanningInputsPreview> {
    if (this.vault.usesEncryptedStore) {
      return from(this.clientInputs());
    }
    return this.http.get<PlanningInputsPreview>(`${this.base}/inputs`);
  }

  listProfiles(): Observable<PlanningProfile[]> {
    if (this.vault.usesEncryptedStore) {
      return from(
        this.encStore.listPlanningProfiles().then(rows =>
          rows.map(row => ({
            id: row.id,
            name: row.name,
            base_currency: row.base_currency || 'USD',
            payload: typeof row.payload_json === 'string' ? JSON.parse(row.payload_json) : row.payload || row,
            created_at: row.created_at,
            updated_at: row.updated_at,
          }))
        )
      );
    }
    return this.http.get<PlanningProfile[]>(`${this.base}/profiles`);
  }

  createProfile(body: PlanningProfileCreate): Observable<PlanningProfile> {
    if (this.vault.usesEncryptedStore) {
      return from(
        (async () => {
          const now = new Date().toISOString();
          const row = await this.encStore.savePlanningProfile({
            name: body.name,
            base_currency: (body as any).base_currency || 'USD',
            payload_json: JSON.stringify((body as any).payload || body),
            created_at: now,
            updated_at: now,
          });
          return {
            id: row.id,
            name: row.name,
            base_currency: row.base_currency,
            payload: (body as any).payload || (body as any),
            created_at: now,
            updated_at: now,
          } as PlanningProfile;
        })()
      );
    }
    return this.http.post<PlanningProfile>(`${this.base}/profiles`, body);
  }

  updateProfile(id: number, body: Partial<PlanningProfileCreate>): Observable<PlanningProfile> {
    if (this.vault.usesEncryptedStore) {
      return from(
        (async () => {
          const now = new Date().toISOString();
          const row = await this.encStore.savePlanningProfile(
            {
              name: (body as any).name || 'Profile',
              base_currency: (body as any).base_currency || 'USD',
              payload_json: JSON.stringify((body as any).payload || body),
              updated_at: now,
            },
            id
          );
          return {
            id: row.id,
            name: row.name,
            base_currency: row.base_currency,
            payload: (body as any).payload || {},
            created_at: row.created_at || now,
            updated_at: now,
          } as PlanningProfile;
        })()
      );
    }
    return this.http.patch<PlanningProfile>(`${this.base}/profiles/${id}`, body);
  }

  deleteProfile(id: number): Observable<void> {
    if (this.vault.usesEncryptedStore) {
      return from(this.encStore.deletePlanningProfile(id));
    }
    return this.http.delete<void>(`${this.base}/profiles/${id}`);
  }

  createRun(body: PlanningRunCreate): Observable<PlanningRun> {
    if (this.vault.usesEncryptedStore) {
      return from(this.clientMonteCarlo(body));
    }
    return this.http
      .post<PlanningRun>(`${this.base}/runs`, body)
      .pipe(timeout(MC_RUN_HTTP_TIMEOUT_MS));
  }

  private async clientInputs(): Promise<PlanningInputsPreview> {
    const nw = await this.encStore.getNetWorth();
    const incomes = await this.encStore.getJobIncomes();
    const fixed = await this.encStore.getFixedExpenses();
    const subs = await this.encStore.getSubscriptions();
    const txs = await this.encStore.getTransactions();
    const monthlyIncome = incomes.reduce((s, j) => s + (Number(j.monthly_net) || 0), 0);
    const annualFixed = fixed.reduce((s, f) => s + (Number(f.annual_amount) || 0), 0);
    const annualSubs = subs.reduce((s, f) => s + (Number(f.annual_amount) || 0), 0);
    const monthlyExpense = (annualFixed + annualSubs) / 12;
    const implied_annual_spending = annualFixed + annualSubs;
    const implied_annual_savings = monthlyIncome * 12 - implied_annual_spending;
    return {
      disclaimer: PLANNING_DISCLAIMER,
      as_of: new Date().toISOString().slice(0, 10),
      snapshot_hash: `client-${txs.length}-${nw.total.toFixed(2)}`,
      net_worth_total: nw.total,
      net_worth_portfolio: nw.portfolio,
      net_worth_liabilities: nw.liabilities,
      avg_monthly_income: monthlyIncome,
      avg_monthly_expense: monthlyExpense,
      implied_annual_spending,
      implied_annual_savings,
      transaction_count: txs.length,
      recurring_annual_spending: implied_annual_spending,
      annual_fixed_expenses: annualFixed,
      annual_subscriptions: annualSubs,
      annual_spending_source: 'encrypted-client',
    };
  }

  private async clientMonteCarlo(body: PlanningRunCreate): Promise<PlanningRun> {
    const inputs = await this.clientInputs();
    const nPaths = Math.min(Math.max((body as any).n_paths || 500, 100), 2000);
    const years = Math.min(Math.max((body as any).horizon_years || 30, 1), 60);
    const seed = (body as any).seed ?? 42;
    let state = seed >>> 0;
    const rand = () => {
      state = (1664525 * state + 1013904223) >>> 0;
      return state / 0xffffffff;
    };
    const start = Number(inputs.net_worth_total) || 0;
    const annualSavings = Number(inputs.implied_annual_savings) || 0;
    const mu = 0.07;
    const sigma = 0.15;
    const paths: number[][] = [];
    for (let p = 0; p < nPaths; p += 1) {
      const series = [start];
      let value = start;
      for (let y = 1; y <= years; y += 1) {
        const u1 = Math.max(rand(), 1e-12);
        const u2 = rand();
        const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
        const annualReturn = mu + sigma * z;
        value = Math.max(value * (1 + annualReturn) + annualSavings, 0);
        series.push(value);
      }
      paths.push(series);
    }
    const percentile_paths = [10, 25, 50, 75, 90].map(pct => {
      const values = [];
      for (let y = 0; y <= years; y += 1) {
        const col = paths.map(p => p[y]).sort((a, b) => a - b);
        const idx = Math.min(col.length - 1, Math.floor((pct / 100) * (col.length - 1)));
        values.push(col[idx]);
      }
      return { percentile: pct, values };
    });
    return {
      id: 0,
      tool_id: (body as any).tool_id || 'mc_net_worth_paths',
      status: 'completed',
      seed,
      n_paths: nPaths,
      horizon_years: years,
      disclaimer: PLANNING_DISCLAIMER,
      result_summary: {
        start_net_worth: start,
        median_end: percentile_paths.find(p => p.percentile === 50)?.values.at(-1) ?? start,
      },
      result_artifacts: {
        years: Array.from({ length: years + 1 }, (_, i) => i),
        percentile_paths,
      },
    } as unknown as PlanningRun;
  }
}
