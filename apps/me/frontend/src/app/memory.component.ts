import { Component, Input } from '@angular/core';
import { Api, Dossier, Timeline } from './api';
import { DossierComponent } from './dossier.component';

@Component({
  selector: 'app-memory',
  imports: [DossierComponent],
  styles: [`
    :host { display:flex; flex-direction:column; height:100%; min-height:0; background:var(--wall); padding:24px; box-sizing:border-box; color:var(--ink); position:relative; }
    h1 { margin:0; font:var(--heading); }
    .year { display:grid; grid-template-columns:4rem repeat(53, minmax(0,1fr)); gap:4px; align-items:center; }
    .cell { width:20px; height:20px; aspect-ratio:1; border:0; display:flex; align-items:center; justify-content:center; background:var(--wall); padding:0; }
    .cell.filled { background:var(--tile); }
    .cell.now { outline:2px solid var(--accent); }
    .dot { width:4px; height:4px; background:var(--accent); }
    .dot.plan { background:var(--mute); }
    .sheet { position:absolute; left:24px; right:24px; bottom:24px; max-height:360px; display:flex; flex-direction:column; background:var(--tile); padding:24px; }
    .rebuild { margin-top:auto; align-self:flex-start; }
    .head { display:flex; height:48px; align-items:center; gap:16px; }
  `],
  template: `
    <h1>Memory</h1>
    @if (timeline === null) {
      <p class="text-mute">Can't load weeks. Rebuild the index.</p>
    } @else {
      <div style="flex:1; overflow-y:auto; min-height:0">
        @for (year of timeline.years; track year) {
          <div class="year">
            <span class="text-mute">{{ year }}</span>
            @for (week of weeks; track week) {
              <button class="cell" [class.filled]="!!cell(year, week)?.n" [class.now]="current(year, week)"
                [disabled]="week===53 && weeksInYear(year)===52" (click)="openWeek(id(year, week))">
                @if (cell(year, week)?.n) { <span class="dot" [class.plan]="cell(year, week)?.kind==='plan'"></span> }
              </button>
            }
          </div>
        }
      </div>
    }
    <button class="hit rebuild" [disabled]="rebuilding" (click)="onRebuild()">Rebuild</button>
    @if (weekOpen) {
      <div class="sheet">
        <div class="head">
          <h1>{{ weekTitle }}</h1>
          <button class="hit" (click)="closeWeek()">Close</button>
        </div>
        @if (weekPayload && !weekPayload.notes.length) {
          <p class="text-mute">{{ futureWeek ? 'No plans in this week.' : 'Nothing in this week.' }}</p>
        } @else if (weekPayload) {
          @for (n of weekPayload.notes; track n.path) {
            <button class="hit" (click)="openDossier(stem(n.path))">{{ n.title }}</button>
          }
          @for (o of weekPayload.outgoing; track o.target) {
            <button class="hit" [class.text-mute]="o.missing" (click)="openDossier(o.target)">{{ o.title }}@if (o.missing) { missing }</button>
          }
        }
      </div>
    }
    @if (view === 'dossier') {
      <app-dossier [dossier]="dossier" [errorText]="dossierError" [knownTitle]="knownTitle"
        (back)="popDossier()" (open)="openDossier($event)" />
    }
  `,
})
export class MemoryComponent {
  @Input() timeline: Timeline | null = null;
  view: 'life' | 'week' | 'dossier' = 'life';
  weekOpen: string | null = null;
  weekPayload: any = null;
  trail: string[] = [];
  dossier: Dossier | null = null;
  dossierError: string | null = null;
  knownTitle: string | null = null;
  rebuilding = false;
  weeks = Array.from({ length: 53 }, (_, i) => i + 1);

  constructor(private api: Api) {}

  get futureWeek() { return !!(this.weekOpen && this.timeline && this.weekOpen > this.timeline.currentWeek); }
  get weekTitle() {
    if (this.weekPayload?.kind === 'plan' || (this.weekPayload?.notes.length === 0 && this.futureWeek)) return `${this.weekOpen} · Plans`;
    return this.weekOpen;
  }
  id(y: number, w: number) { return `${y}-W${String(w).padStart(2, '0')}`; }
  cell(y: number, w: number) { return this.timeline?.cells[this.id(y, w)]; }
  current(y: number, w: number) { return this.timeline?.currentWeek === this.id(y, w); }
  weeksInYear(year: number) {
    const dow = new Date(Date.UTC(year, 0, 1)).getUTCDay();
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    return dow === 4 || (dow === 3 && leap) ? 53 : 52;
  }
  stem(p: string) { return (p.split('/').pop() ?? p).replace(/\.md$/i, ''); }
  async onRebuild() {
    this.rebuilding = true;
    try { await this.api.rebuild(); location.reload(); } finally { this.rebuilding = false; }
  }
  async openWeek(id: string) {
    this.weekOpen = id; this.weekPayload = null; this.dossier = null; this.view = 'week';
    this.weekPayload = await this.api.week(id);
  }
  closeWeek() { this.view = 'life'; this.weekOpen = null; this.weekPayload = null; this.trail = []; }
  async openDossier(target: string) {
    this.knownTitle = target; this.dossier = null; this.dossierError = null; this.view = 'dossier';
    try {
      const data = await this.api.notes(target);
      if (data.kind === 'week') { await this.openWeek(data.id); return; }
      this.dossier = data;
      this.trail = [...this.trail, target];
    } catch { this.dossierError = 'fail'; }
  }
  async popDossier() {
    this.trail = this.trail.slice(0, -1);
    const prev = this.trail.at(-1);
    if (!prev) {
      this.dossier = null; this.view = this.weekOpen ? 'week' : 'life';
      return;
    }
    this.knownTitle = prev;
    this.dossier = await this.api.notes(prev);
  }
}
