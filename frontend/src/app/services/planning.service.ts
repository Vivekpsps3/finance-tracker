import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { apiUrl } from '../core/api-url';
import {
  PlanningInputsPreview,
  PlanningRun,
  PlanningRunCreate,
} from '../models/planning.model';

@Injectable({ providedIn: 'root' })
export class PlanningService {
  private readonly base = apiUrl('/planning/v1');

  constructor(private http: HttpClient) {}

  getInputs(): Observable<PlanningInputsPreview> {
    return this.http.get<PlanningInputsPreview>(`${this.base}/inputs`);
  }

  createRun(body: PlanningRunCreate): Observable<PlanningRun> {
    return this.http.post<PlanningRun>(`${this.base}/runs`, body);
  }
}