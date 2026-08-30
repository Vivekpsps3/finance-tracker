import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

export type Standing = {
  status: 'idle' | 'pending' | 'empty' | 'error' | 'refuse';
  question: string;
  qid: string;
  pending: { id: string; path: string; body: string } | null;
  message?: string;
};

export type Timeline = {
  currentWeek: string;
  eras: { id: string; slug: string; title: string; start: string; end: string; years: number[] }[];
  cells: Record<string, { kind: string; n: number }>;
};

export type Dossier = {
  missing: boolean;
  target: string;
  path: string | null;
  title: string;
  type: string | null;
  fields: { key: string; text: string }[];
  bodyHtml: string;
  backlinks: { src: string; title: string; type: string | null }[];
};

@Injectable({ providedIn: 'root' })
export class Api {
  constructor(private http: HttpClient) {}

  bootstrap() {
    return firstValueFrom(this.http.get<{ timeline: Timeline | null; standing: Standing }>('/api/bootstrap'));
  }
  login(password: string) {
    return firstValueFrom(this.http.post('/api/login', { password }));
  }
  standingPost(answer: string) {
    return firstValueFrom(this.http.post<Standing>('/api/standing', { answer }));
  }
  skip() {
    return firstValueFrom(this.http.post<Standing>('/api/standing/skip', {}));
  }
  decide(id: string, decision: 'approve' | 'reject') {
    return firstValueFrom(this.http.post<Standing>('/api/standing/decide', { id, decision }));
  }
  notes(n: string) {
    return firstValueFrom(this.http.get<any>(`/api/notes?n=${encodeURIComponent(n)}`));
  }
  week(id: string) {
    return firstValueFrom(this.http.get<any>(`/api/timeline/week/${id}`));
  }
  ask(question: string) {
    return firstValueFrom(this.http.post<any>('/api/ask', { question }));
  }
  async *agent(message: string): AsyncGenerator<any> {
    const res = await fetch('/api/agent', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ message }),
    });
    if (!res.ok || !res.body) throw new Error('agent');
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const parts = buf.split('\n\n');
      buf = parts.pop() ?? '';
      for (const part of parts) {
        const line = part.split('\n').find((l) => l.startsWith('data: '));
        if (!line) continue;
        try { yield JSON.parse(line.slice(6)); } catch { /* skip */ }
      }
    }
  }
  rebuild() {
    return firstValueFrom(this.http.post('/api/vault/rebuild', {}));
  }
}
