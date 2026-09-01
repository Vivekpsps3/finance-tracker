import { Component, Input } from '@angular/core';
import { Api, Cell, Dossier, Timeline } from './api';
import { DossierComponent } from './dossier.component';

type Grain = 'year' | 'month' | 'week' | 'day';

type Row = {
  id: string;
  grain: Grain;
  label: string;
  depth: number;
  n: number;
  below: number;
  refs: string[];
  up: string[];
  down: string[];
  now: boolean;
};

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function utc(y: number, m: number, d: number) { return new Date(Date.UTC(y, m, d)); }
function addDays(d: Date, n: number) { const x = new Date(d); x.setUTCDate(x.getUTCDate() + n); return x; }
function ymd(d: Date) { return d.toISOString().slice(0, 10); }
function pad(n: number) { return String(n).padStart(2, '0'); }
function isoWeek(d: Date) {
  const t = new Date(d.getTime());
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  const start = utc(t.getUTCFullYear(), 0, 1);
  const w = Math.ceil((((t.getTime() - start.getTime()) / 86400000) + 1) / 7);
  return { y: t.getUTCFullYear(), w };
}
function isoMonday(y: number, w: number) {
  const jan4 = utc(y, 0, 4);
  return addDays(jan4, -((jan4.getUTCDay() + 6) % 7) + (w - 1) * 7);
}
function widOf(d: Date) { const { y, w } = isoWeek(d); return `${y}-W${pad(w)}`; }
function rangeLabel(a: Date, b: Date) {
  if (a.getUTCMonth() === b.getUTCMonth()) return `${MON[a.getUTCMonth()]} ${a.getUTCDate()} – ${b.getUTCDate()}`;
  return `${MON[a.getUTCMonth()]} ${a.getUTCDate()} – ${MON[b.getUTCMonth()]} ${b.getUTCDate()}`;
}

@Component({
  selector: 'app-memory',
  imports: [DossierComponent],
  styles: [`
    :host { display:flex; flex-direction:column; height:100%; min-height:0; background:var(--wall); padding:24px; box-sizing:border-box; color:var(--ink); position:relative; }
    h1 { margin:0; font:var(--heading); }
    .bar { display:flex; flex-wrap:wrap; gap:8px; margin:16px 0; align-items:center; }
    .bar .hit.on { background:var(--surface-2); }
    .bar label { display:flex; align-items:center; gap:8px; color:var(--mute); font:var(--label); }
    .bar input { min-height:48px; border:1px solid var(--border); background:var(--tile); padding:0 12px; }
    .tree { flex:1; overflow:auto; min-height:0; }
    .row { position:relative; display:flex; align-items:center; gap:16px; width:100%; max-width:44rem; min-height:48px; margin:0 0 4px; padding:0 16px; border:0; background:transparent; text-align:left; }
    .row.d1 { padding-left:32px; }
    .row.d2 { padding-left:48px; }
    .row.d3 { padding-left:64px; }
    .row.filled { background:var(--tile); }
    .row.now { outline:2px solid var(--accent); outline-offset:-2px; }
    .row .n { margin-left:auto; color:var(--mute); font:var(--label); }
    .tip {
      position:absolute; left:16px; bottom:calc(100% - 4px); z-index:3; min-width:16rem; max-width:28rem;
      padding:12px 16px; background:var(--tile); border:1px solid var(--border); color:var(--ink);
      opacity:0; transform:translateY(-6px); pointer-events:none;
      transition:opacity .16s ease, transform .16s ease;
    }
    .row:hover .tip, .row:focus-visible .tip { opacity:1; transform:none; }
    .tip b { display:block; font:var(--label); }
    .tip p { margin:8px 0 0; color:var(--mute); }
    .rebuild { margin-top:auto; align-self:flex-start; }
  `],
  template: `
    <h1>Memory</h1>
    @if (tl === null) {
      <p class="text-mute">Can't load calendar. Rebuild the index.</p>
    } @else {
      <div class="bar">
        @for (g of grains; track g) {
          <button class="hit" [class.on]="grain===g" (click)="grain=g">{{ g }}</button>
        }
        <label>From <input type="date" [value]="from" (change)="from = $any($event.target).value"></label>
        <label>To <input type="date" [value]="to" (change)="to = $any($event.target).value"></label>
      </div>
      <div class="tree">
        @for (r of rows; track r.grain + r.id) {
          <button class="row" [class.d1]="r.depth===1" [class.d2]="r.depth===2" [class.d3]="r.depth===3"
            [class.filled]="r.n+r.below>0" [class.now]="r.now" (click)="openDossier(r.id)">
            <span>{{ r.label }}</span>
            @if (r.n + r.below) { <span class="n">{{ r.n || r.below }}</span> }
            <div class="tip">
              <b>{{ r.label }}</b>
              @if (r.up.length) { <p>{{ r.up.join(' · ') }}</p> }
              <p>{{ r.n ? r.n + ' linked' : 'Nothing on this ' + r.grain }}@if (r.below) { · {{ r.below }} below }</p>
              @if (r.down.length) { <p>{{ r.down.join(' · ') }}</p> }
              @if (r.refs.length) { <p>{{ r.refs.join(' · ') }}</p> }
            </div>
          </button>
        }
        @if (tl.misc.length) {
          <p class="text-mute" style="margin:24px 0 8px">Miscellaneous</p>
          @for (m of tl.misc; track m.id) {
            <button class="row" [class.filled]="m.n>0" (click)="openDossier(m.id)">
              <span>{{ m.title }}</span>
              @if (m.n) { <span class="n">{{ m.n }}</span> }
              <div class="tip">
                <b>{{ m.title }}</b>
                <p>{{ m.n ? m.n + ' linked' : 'No links' }}</p>
                @if (m.refs?.length) { <p>{{ (m.refs ?? []).join(' · ') }}</p> }
              </div>
            </button>
          }
        }
      </div>
    }
    <button class="hit rebuild" [disabled]="rebuilding" (click)="onRebuild()">Rebuild</button>
    @if (view === 'dossier') {
      <app-dossier [dossier]="dossier" [errorText]="dossierError" [knownTitle]="knownTitle"
        (back)="popDossier()" (open)="openDossier($event)" />
    }
  `,
})
export class MemoryComponent {
  tl: Timeline | null = null;
  grain: Grain = 'week';
  grains: Grain[] = ['year', 'month', 'week', 'day'];
  from = '';
  to = '';
  view: 'life' | 'dossier' = 'life';
  trail: string[] = [];
  dossier: Dossier | null = null;
  dossierError: string | null = null;
  knownTitle: string | null = null;
  rebuilding = false;
  private primed = false;

  constructor(private api: Api) {}

  @Input() set timeline(v: Timeline | null) {
    this.tl = v;
    if (v && !this.primed) {
      this.from = `${v.currentDay.slice(0, 4)}-01-01`;
      this.to = v.currentDay;
      this.primed = true;
    }
  }

  private cell(map: Record<string, Cell>, id: string): Cell {
    return map[id] ?? { n: 0, refs: [] };
  }

  get rows(): Row[] {
    const tl = this.tl;
    if (!tl || !this.from || !this.to) return [];
    const start = new Date(this.from + 'T00:00:00Z');
    const end = new Date(this.to + 'T00:00:00Z');
    if (isNaN(+start) || isNaN(+end) || start > end) return [];

    const days: string[] = [];
    for (let d = new Date(start); d <= end; d = addDays(d, 1)) days.push(ymd(d));

    const weeks: { id: string; mon: Date; sun: Date; month: string; year: string }[] = [];
    const seen = new Set<string>();
    for (const id of days) {
      const d = new Date(id + 'T00:00:00Z');
      const wid = widOf(d);
      if (seen.has(wid)) continue;
      seen.add(wid);
      const { y, w } = isoWeek(d);
      const mon = isoMonday(y, w);
      const thu = addDays(mon, 3);
      weeks.push({ id: wid, mon, sun: addDays(mon, 6), month: ymd(thu).slice(0, 7), year: String(thu.getUTCFullYear()) });
    }

    const months = [...new Set(weeks.map((w) => w.month))];
    const years = [...new Set(weeks.map((w) => w.year))];
    const own = (g: 'yearly' | 'monthly' | 'weekly' | 'daily', id: string) => this.cell(tl[g], id);
    const dayN = (id: string) => own('daily', id).n;
    const weekN = (id: string) => own('weekly', id).n;
    const monthN = (id: string) => own('monthly', id).n;
    const yearN = (id: string) => own('yearly', id).n;
    const weekDays = (w: (typeof weeks)[0]) => days.filter((id) => id >= ymd(w.mon) && id <= ymd(w.sun));
    const monthWeeks = (ym: string) => weeks.filter((w) => w.month === ym);
    const yearMonths = (y: string) => months.filter((m) => m.startsWith(y));
    const yearWeeks = (y: string) => weeks.filter((w) => w.year === y);
    const yearDays = (y: string) => days.filter((id) => id.startsWith(y));
    const monthDays = (ym: string) => days.filter((id) => id.startsWith(ym));
    const countDays = (ids: string[]) => ids.filter((id) => dayN(id) > 0).length;
    const countWeeks = (ws: typeof weeks) => ws.filter((w) => weekN(w.id) > 0 || countDays(weekDays(w)) > 0).length;

    const out: Row[] = [];
    const push = (row: Row) => out.push(row);

    for (const y of years) {
      const yWeeks = yearWeeks(y);
      const yDays = yearDays(y);
      const yMonths = yearMonths(y);
      const below = yMonths.filter((m) => monthN(m) > 0).length + countWeeks(yWeeks) + countDays(yDays);
      const yDown = [
        ...yMonths.map((m) => `${LONG[+m.slice(5) - 1]} (${monthN(m) || countDays(monthDays(m))})`),
        ...yWeeks.filter((w) => weekN(w.id) || countDays(weekDays(w))).map((w) => rangeLabel(w.mon, w.sun)),
      ].slice(0, 8);
      push({
        id: y, grain: 'year', label: y, depth: 0, n: yearN(y), below,
        refs: own('yearly', y).refs ?? [], up: [], down: yDown,
        now: tl.currentYear === +y,
      });
      if (this.grain === 'year') continue;
      for (const ym of yMonths) {
        const [yy, mm] = ym.split('-').map(Number);
        const mWeeks = monthWeeks(ym);
        const mDays = monthDays(ym);
        const mBelow = countWeeks(mWeeks) + countDays(mDays);
        const mDown = [
          ...mWeeks.map((w) => rangeLabel(w.mon, w.sun)),
          ...mDays.filter((id) => dayN(id)).map((id) => id.slice(8)),
        ].slice(0, 8);
        const mLabel = `${LONG[mm - 1]} ${yy}`;
        push({
          id: ym, grain: 'month', label: mLabel, depth: 1, n: monthN(ym), below: mBelow,
          refs: own('monthly', ym).refs ?? [], up: [y], down: mDown,
          now: tl.currentMonth === ym,
        });
        if (this.grain === 'month') continue;
        for (const w of mWeeks) {
          const wDays = weekDays(w);
          const label = rangeLabel(w.mon, w.sun);
          const wBelow = countDays(wDays);
          const wDown = wDays.map((id) => {
            const d = new Date(id + 'T00:00:00Z');
            return `${DOW[d.getUTCDay()]} ${d.getUTCDate()}${dayN(id) ? ' · ' + dayN(id) : ''}`;
          });
          push({
            id: w.id, grain: 'week', label, depth: 2, n: weekN(w.id), below: wBelow,
            refs: own('weekly', w.id).refs ?? [], up: [y, mLabel], down: wDown,
            now: tl.currentWeek === w.id,
          });
          if (this.grain === 'week') continue;
          for (const id of wDays) {
            const d = new Date(id + 'T00:00:00Z');
            push({
              id, grain: 'day', label: `${DOW[d.getUTCDay()]} ${MON[d.getUTCMonth()]} ${d.getUTCDate()}`,
              depth: 3, n: dayN(id), below: 0,
              refs: own('daily', id).refs ?? [], up: [y, mLabel, label], down: [],
              now: tl.currentDay === id,
            });
          }
        }
      }
    }
    return out;
  }

  async onRebuild() {
    this.rebuilding = true;
    try { await this.api.rebuild(); location.reload(); } finally { this.rebuilding = false; }
  }
  async openDossier(target: string) {
    this.knownTitle = target; this.dossier = null; this.dossierError = null; this.view = 'dossier';
    try {
      this.dossier = await this.api.notes(target);
      this.trail = [...this.trail, target];
    } catch { this.dossierError = 'fail'; }
  }
  async popDossier() {
    this.trail = this.trail.slice(0, -1);
    const prev = this.trail.at(-1);
    if (!prev) { this.dossier = null; this.view = 'life'; return; }
    this.knownTitle = prev;
    this.dossier = await this.api.notes(prev);
  }
}
