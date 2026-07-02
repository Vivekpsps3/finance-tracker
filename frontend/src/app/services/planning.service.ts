import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, timeout } from 'rxjs';
import { apiUrl } from '../core/api-url';
import {
  MC_RUN_HTTP_TIMEOUT_MS,
  PlanningInputsPreview,
  PlanningProfile,
  PlanningProfileCreate,
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

  listProfiles(): Observable<PlanningProfile[]> {
    return this.http.get<PlanningProfile[]>(`${this.base}/profiles`);
  }

  createProfile(body: PlanningProfileCreate): Observable<PlanningProfile> {
    return this.http.post<PlanningProfile>(`${this.base}/profiles`, body);
  }

  updateProfile(id: number, body: Partial<PlanningProfileCreate>): Observable<PlanningProfile> {
    return this.http.patch<PlanningProfile>(`${this.base}/profiles/${id}`, body);
  }

  deleteProfile(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/profiles/${id}`);
  }

  createRun(body: PlanningRunCreate): Observable<PlanningRun> {
    return this.http
      .post<PlanningRun>(`${this.base}/runs`, body)
      .pipe(timeout(MC_RUN_HTTP_TIMEOUT_MS));
  }
}