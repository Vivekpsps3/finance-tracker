import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

export type Cell = { n: number; refs?: string[] };
export type Misc = { id: string; title: string; n: number; refs?: string[]; start?: string | null; end?: string | null };
export type Timeline = {
  currentYear: number;
  currentMonth: string;
  currentWeek: string;
  currentDay: string;
  birthday: string;
  years: number[];
  yearly: Record<string, Cell>;
  monthly: Record<string, Cell>;
  weekly: Record<string, Cell>;
  daily: Record<string, Cell>;
  misc: Misc[];
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

export type VaultFile = { path: string; name: string; folder: string };

@Injectable({ providedIn: 'root' })
export class Api {
  constructor(private http: HttpClient) {}

  bootstrap() {
    return firstValueFrom(this.http.get<{ timeline: Timeline | null }>('/api/bootstrap'));
  }
  notes(n: string) {
    return firstValueFrom(this.http.get<Dossier>(`/api/notes?n=${encodeURIComponent(n)}`));
  }
  tree() {
    return firstValueFrom(this.http.get<{ files: VaultFile[] }>('/api/vault/tree'));
  }
  file(path: string) {
    return firstValueFrom(this.http.get<{ path: string; raw: string }>(`/api/vault/note?path=${encodeURIComponent(path)}`));
  }
  save(path: string, raw: string) {
    return firstValueFrom(this.http.put<{ path: string; raw: string }>('/api/vault/note', { path, raw }));
  }
  ensure(id: string) {
    return firstValueFrom(this.http.post<{ note: Dossier; timeline: Timeline }>('/api/calendar/ensure', { id }));
  }
  createNote(title: string, link?: string, folder = 'Inbox') {
    return firstValueFrom(this.http.post<{ note: Dossier; timeline: Timeline }>('/api/notes', { title, link, folder }));
  }
  agentHistory(id = '') {
    const q = id ? `?id=${encodeURIComponent(id)}` : '';
    return firstValueFrom(this.http.get<{ session: any; sessions: any[]; lines: any[] }>(`/api/agent${q}`));
  }
  agentReset(id = '') {
    return firstValueFrom(this.http.post<{ session: any; sessions: any[]; lines: any[] }>('/api/agent/reset', { id }));
  }
  async *agent(message: string, opts: { id?: string; fresh?: boolean; name?: string } = {}): AsyncGenerator<any> {
    const csrf = document.cookie.match(/(?:^|;\s*)me_csrf=([^;]*)/)?.[1] ?? '';
    const res = await fetch('/api/agent', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'X-CSRF-Token': decodeURIComponent(csrf) },
      credentials: 'same-origin',
      body: JSON.stringify({ message, id: opts.id || '', fresh: !!opts.fresh, name: opts.name || 'wall' }),
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
