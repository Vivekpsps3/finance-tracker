import { Component, ElementRef, HostListener, Input, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Api, Dossier, Misc, Timeline } from './api';
import { DossierComponent } from './dossier.component';
import { DOW_MON, LONG, addDays, cell, clock, eraCoversDay, eraCoversYear, eraYears, erasAt, fillDays, hue, isoMonday, monthWeeks, widOf, ymd } from './cal';

const ERA_STORE = 'me-era';
const VIEW_STORE = 'me-mem-view';

type Level = 'life' | 'era' | 'year' | 'month' | 'week' | 'day';

@Component({
  selector: 'app-memory',
  imports: [DossierComponent, FormsModule],
  template: `
    <div class="mem">
      <div class="mem-top">
        <nav class="mem-crumb">
          <button (click)="go('life')" [class.here]="level==='life'">Life</button>
          @if (era) { <b>/</b> <button (click)="go('era')" [class.here]="level==='era'">{{ era.title }}</button> }
          @if (year) { <b>/</b> <button (click)="go('year')" [class.here]="level==='year'">{{ year }}</button> }
          @if (month) { <b>/</b> <button (click)="go('month')" [class.here]="level==='month'">{{ monthName }}</button> }
          @if (week) { <b>/</b> <button (click)="go('week')" [class.here]="level==='week'">{{ week }}</button> }
          @if (day) { <b>/</b> <button class="here">{{ day }}</button> }
        </nav>
        <div class="tools">
          @if (dated.length) {
            <select class="mem-era-pick" [ngModel]="era?.id ?? ''" (ngModelChange)="pickEra($event)">
              <option value="">No era</option>
              @for (e of hereEras; track e.id) {
                <option [value]="e.id">{{ e.title }}</option>
              }
              @if (eraOffList && era) {
                <option [value]="era.id">{{ era.title }}</option>
              }
            </select>
          }
          <span class="clock">{{ time }}</span>
          <button class="hit" (click)="toNow()">Now</button>
          <button class="hit" [disabled]="rebuilding" (click)="onRebuild()">Rebuild</button>
        </div>
      </div>

      @if (!tl) {
        <p class="text-mute">Can't load calendar. Rebuild the index.</p>
      } @else {
        <div class="mem-stage">
          <div class="mem-layer" [class.out]="dir==='out'" [attr.data-k]="anim">
            @switch (level) {
              @case ('life') {
                <div class="mem-life">
                  <div class="mem-axis" (click)="axisYear($event)">
                    @for (y of axisLabs; track y) {
                      <span class="lab" [style.left.%]="yearPct(y)">{{ y }}</span>
                    }
                    <i class="now-pin" [style.left.%]="yearPct(tl.currentYear)"></i>
                  </div>
                  <div class="mem-eras">
                    <button class="mem-era none" [class.on]="!era" (click)="pickEra('')">No era</button>
                    @for (e of dated; track e.id) {
                      <button class="mem-era" [style.--h]="hue(e.id)" [style.--a]="eraLeft(e)" [style.--b]="eraRight(e)"
                        [class.now]="eraNow(e)" [class.on]="era?.id===e.id" (click)="diveEra(e)">
                        <i class="span"></i>
                        <span>{{ e.title }}</span>
                        <small>{{ e.start?.slice(0,4) }}–{{ e.end?.slice(0,4) || 'live' }}</small>
                      </button>
                    }
                  </div>
                  @if (loose.length) {
                    <div class="mem-loose">
                      @for (m of loose; track m.id) {
                        <button class="chip" (click)="openNote(m.id)">{{ m.title }}</button>
                      }
                    </div>
                  }
                </div>
              }
              @case ('era') {
                <div class="mem-grid">
                  @for (y of yearList; track y) {
                    <button class="mem-cell" [class.hot]="yearN(y)>0" [class.now]="y===tl.currentYear" (click)="diveYear(y)">
                      <span class="k">{{ y }}</span>
                      <span class="v">{{ yearN(y) ? yearN(y) + ' notes' : 'open' }}</span>
                    </button>
                  }
                </div>
              }
              @case ('year') {
                <div class="mem-grid months">
                  @for (m of months; track m.id) {
                    <button class="mem-cell" [class.hot]="m.n>0" [class.now]="m.id===tl.currentMonth" (click)="diveMonth(m.id)">
                      <span class="k">{{ m.name }}</span>
                      @if (m.n) { <i class="dot"></i> } @else { <span class="v">·</span> }
                    </button>
                  }
                </div>
              }
              @case ('month') {
                <div class="mem-cal">
                  <div class="mem-dow">
                    <span></span>
                    @for (d of dows; track d) { <span>{{ d }}</span> }
                  </div>
                  <div class="mem-weeks">
                    @for (w of weeks; track w.id) {
                      <div class="mem-week">
                        <button class="mem-wn" (click)="diveWeek(w.id)">{{ w.id.slice(6) }}</button>
                        @for (d of w.days; track d.id) {
                          <button class="mem-day" [class.out]="!d.in" [class.hot]="d.n>0" [class.now]="d.id===tl.currentDay"
                            (click)="diveDay(d.id)">
                            <span class="n">{{ +d.id.slice(8) }}</span>
                            @if (d.n) { <span class="c">{{ d.n }}</span> }
                          </button>
                        }
                      </div>
                    }
                  </div>
                </div>
              }
              @case ('week') {
                <div class="mem-ribbon tall">
                  @for (d of weekDays; track d.id) {
                    <button [class.on]="d.id===day" [class.hot]="d.n>0" (click)="diveDay(d.id)">
                      <span class="d">{{ d.lab }}</span>
                      <span class="n">{{ +d.id.slice(8) }}</span>
                    </button>
                  }
                </div>
              }
              @case ('day') {
                <div class="mem-ribbon">
                  @for (d of weekDays; track d.id) {
                    <button [class.on]="d.id===day" (click)="diveDay(d.id)">
                      <span class="d">{{ d.lab }}</span>
                      <span class="n">{{ +d.id.slice(8) }}</span>
                    </button>
                  }
                </div>
                <div class="mem-daypane">
                  <div class="mem-edit">
                    <textarea [(ngModel)]="draft" placeholder="This day…"></textarea>
                    <div class="row">
                      <button class="hit" [disabled]="saving" (click)="saveDay()">Save</button>
                    </div>
                  </div>
                  <div class="mem-side">
                    <h3>On this day</h3>
                    @if (dayNote?.missing) { <p class="text-mute">New daily note. Save to keep it.</p> }
                    <div class="mem-add">
                      <input [(ngModel)]="newTitle" placeholder="New note" (keydown.enter)="addNote()" />
                      <button class="hit" (click)="addNote()">Add</button>
                    </div>
                    @for (r of dayNote?.backlinks ?? []; track r.src) {
                      <button class="chip" (click)="openNote(stem(r.src))">{{ r.title }}</button>
                    }
                    @if (dayRefs.length) {
                      @for (r of dayRefs; track r) {
                        <button class="chip" (click)="openNote(r)">{{ r }}</button>
                      }
                    }
                  </div>
                </div>
              }
            }
          </div>
        </div>
      }

      @if (view === 'dossier') {
        <app-dossier [dossier]="dossier" [errorText]="dossierError" [knownTitle]="knownTitle"
          (back)="popDossier()" (open)="openNote($event)" />
      }
    </div>
  `,
})
export class MemoryComponent implements OnInit, OnDestroy {
  tl: Timeline | null = null;
  level: Level = 'month';
  dir: 'in' | 'out' = 'in';
  anim = 0;
  era: Misc | null = null;
  year = 0;
  month = '';
  week = '';
  day = '';
  time = clock();
  view: 'life' | 'dossier' = 'life';
  trail: string[] = [];
  dossier: Dossier | null = null;
  dossierError: string | null = null;
  knownTitle: string | null = null;
  rebuilding = false;
  saving = false;
  draft = '';
  dayPath = '';
  dayNote: Dossier | null = null;
  newTitle = '';
  dows = DOW_MON;
  prefId = MemoryComponent.loadPref();
  private tick?: ReturnType<typeof setInterval>;

  private static loadPref() {
    try { return localStorage.getItem(ERA_STORE) ?? ''; } catch { return ''; }
  }

  constructor(private api: Api, private el: ElementRef<HTMLElement>) {}

  @Input() set timeline(v: Timeline | null) {
    if (v) {
      this.tl = v;
      if (!this.year && !this.restoreView()) this.landNow(false);
    }
  }

  ngOnInit() {
    this.tick = setInterval(() => (this.time = clock()), 15000);
  }
  ngOnDestroy() { if (this.tick) clearInterval(this.tick); }

  @HostListener('document:keydown', ['$event'])
  keys(ev: KeyboardEvent) {
    if (this.el.nativeElement.classList.contains('off')) return;
    if (ev.key === 'Escape') {
      if (this.view === 'dossier') this.popDossier();
      else this.up();
    }
    if ((ev.metaKey || ev.ctrlKey) && ev.key === 's' && this.level === 'day') {
      ev.preventDefault();
      void this.saveDay();
    }
  }

  get born() { return this.tl?.years[0] ?? 2003; }
  get last() { return this.tl?.years.at(-1) ?? 2093; }
  get dated() { return (this.tl?.misc ?? []).filter((m) => m.start); }
  get loose() { return (this.tl?.misc ?? []).filter((m) => !m.start); }
  get axisLabs() {
    const a = this.born;
    const b = this.last;
    const step = 10;
    const out = [];
    for (let y = Math.ceil(a / step) * step; y <= b; y += step) out.push(y);
    return out;
  }
  get yearList() {
    if (this.era) {
      const [a, b] = eraYears(this.era, this.born, this.last);
      return Array.from({ length: b - a + 1 }, (_, i) => a + i);
    }
    return this.tl?.years ?? [];
  }
  get months() {
    const y = this.year;
    return LONG.map((name, i) => {
      const id = `${y}-${String(i + 1).padStart(2, '0')}`;
      return { id, name, n: cell(this.tl?.monthly ?? {}, id).n };
    });
  }
  get monthName() {
    if (!this.month) return '';
    return LONG[+this.month.slice(5) - 1];
  }
  get weeks() {
    if (!this.month || !this.tl) return [];
    return fillDays(monthWeeks(this.month), this.tl);
  }
  get weekDays() {
    if (!this.week) return [];
    const [y, w] = [+this.week.slice(0, 4), +this.week.slice(6)];
    const mon = isoMonday(y, w);
    return Array.from({ length: 7 }, (_, i) => {
      const d = addDays(mon, i);
      const id = ymd(d);
      return { id, lab: DOW_MON[i], n: cell(this.tl?.daily ?? {}, id).n };
    });
  }
  get dayRefs() { return cell(this.tl?.daily ?? {}, this.day).refs ?? []; }
  get hereEras() {
    if (!this.dated.length) return [];
    if (this.day) return erasAt(this.dated, +this.day.slice(0, 4), this.day);
    if (this.year) return erasAt(this.dated, this.year);
    if (this.tl) return erasAt(this.dated, this.tl.currentYear, this.tl.currentDay);
    return this.dated;
  }
  get eraOffList() {
    return !!this.era && !this.hereEras.some((e) => e.id === this.era!.id);
  }

  hue = hue;
  yearPct(y: number) {
    const span = this.last - this.born || 1;
    return ((y - this.born) / span) * 100;
  }
  eraLeft(e: Misc) { return this.yearPct(eraYears(e, this.born, this.last)[0]); }
  eraRight(e: Misc) { return this.yearPct(eraYears(e, this.born, this.last)[1]); }
  eraNow(e: Misc) {
    if (!this.tl) return false;
    const [a, b] = eraYears(e, this.born, this.last);
    return this.tl.currentYear >= a && this.tl.currentYear <= b;
  }
  yearN(y: number) { return cell(this.tl?.yearly ?? {}, String(y)).n; }
  stem(p: string) { return (p.split('/').pop() ?? p).replace(/\.md$/i, ''); }

  private flash(dir: 'in' | 'out') {
    this.dir = dir;
    this.anim++;
  }

  axisYear(ev: MouseEvent) {
    const r = (ev.currentTarget as HTMLElement).getBoundingClientRect();
    const t = Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width));
    this.diveYear(Math.round(this.born + t * (this.last - this.born)));
  }

  private saveView() {
    try {
      localStorage.setItem(VIEW_STORE, JSON.stringify({
        level: this.level, era: this.era?.id ?? '', year: this.year,
        month: this.month, week: this.week, day: this.day,
      }));
    } catch { /* private */ }
  }

  private restoreView(): boolean {
    try {
      const raw = localStorage.getItem(VIEW_STORE);
      if (!raw) return false;
      const v = JSON.parse(raw) as { level?: Level; era?: string; year?: number; month?: string; week?: string; day?: string };
      if (v.era) {
        this.prefId = v.era;
        this.era = this.dated.find((e) => e.id === v.era) ?? null;
      }
      this.year = v.year || 0;
      this.month = v.month || '';
      this.week = v.week || '';
      this.day = v.day || '';
      this.level = v.level || (this.month ? 'month' : 'life');
      return this.year > 0 || this.level === 'life';
    } catch {
      return false;
    }
  }

  pickEra(id: string) {
    this.prefId = id;
    try { localStorage.setItem(ERA_STORE, id); } catch { /* private */ }
    if (!id) {
      this.era = null;
      if (this.level === 'era') this.go(this.year ? 'year' : 'life');
      return;
    }
    const e = this.dated.find((x) => x.id === id);
    if (!e) return;
    this.era = e;
    const [a, b] = eraYears(e, this.born, this.last);
    if (!this.year || this.year < a || this.year > b) this.diveEra(e);
    else this.saveView();
  }

  go(level: Level) {
    this.flash('out');
    this.level = level;
    if (level === 'life') { this.year = 0; this.month = ''; this.week = ''; this.day = ''; }
    if (level === 'era') { this.year = 0; this.month = ''; this.week = ''; this.day = ''; }
    if (level === 'year') { this.month = ''; this.week = ''; this.day = ''; }
    if (level === 'month') { this.week = ''; this.day = ''; }
    if (level === 'week') { this.day = ''; }
    this.saveView();
  }
  up() {
    const order: Level[] = ['life', 'era', 'year', 'month', 'week', 'day'];
    const i = order.indexOf(this.level);
    if (i <= 0) return;
    if (this.level === 'era') this.go('life');
    else if (this.level === 'year' && this.era) this.go('era');
    else if (this.level === 'year') this.go('life');
    else this.go(order[i - 1]);
  }

  diveEra(e: Misc) {
    this.flash('in');
    this.era = e;
    this.prefId = e.id;
    try { localStorage.setItem(ERA_STORE, e.id); } catch { /* private */ }
    this.level = 'era';
    this.year = 0; this.month = ''; this.week = ''; this.day = '';
    this.saveView();
  }
  diveYear(y: number) {
    this.flash('in');
    this.year = y;
    this.era = this.prefCovering(y);
    this.level = 'year';
    this.month = ''; this.week = ''; this.day = '';
    this.saveView();
  }
  diveMonth(id: string) {
    this.flash('in');
    this.month = id;
    this.year = +id.slice(0, 4);
    this.level = 'month';
    this.week = ''; this.day = '';
    this.saveView();
  }
  diveWeek(id: string) {
    this.flash('in');
    this.week = id;
    const mon = isoMonday(+id.slice(0, 4), +id.slice(6));
    this.month = ymd(addDays(mon, 3)).slice(0, 7);
    this.year = +this.month.slice(0, 4);
    this.level = 'week';
    this.day = '';
    this.saveView();
  }
  async diveDay(id: string) {
    this.flash('in');
    this.day = id;
    const d = new Date(id + 'T00:00:00Z');
    this.week = widOf(d);
    this.month = id.slice(0, 7);
    this.year = +id.slice(0, 4);
    this.level = 'day';
    this.saveView();
    await this.openDay();
  }

  private prefCovering(y: number, day?: string) {
    if (!this.prefId) return null;
    const e = this.dated.find((x) => x.id === this.prefId);
    if (!e) return null;
    return (day ? eraCoversDay(e, day) : eraCoversYear(e, y)) ? e : null;
  }

  landNow(animate = true) {
    if (!this.tl) return;
    if (animate) this.flash('in');
    const today = this.tl.currentDay;
    this.era = this.prefCovering(this.tl.currentYear, today);
    this.year = this.tl.currentYear;
    this.month = this.tl.currentMonth;
    this.week = this.tl.currentWeek;
    this.day = today;
    this.level = 'month';
    this.saveView();
  }
  toNow() { this.landNow(true); }

  async openDay() {
    if (!this.day) return;
    try {
      const res = await this.api.ensure(this.day);
      this.tl = res.timeline;
      this.dayNote = res.note;
      this.dayPath = res.note.path || `Calendar/Daily/${this.day}.md`;
      const file = await this.api.file(this.dayPath);
      this.draft = file.raw;
    } catch {
      this.draft = `# ${this.day}\n\n`;
      this.dayPath = `Calendar/Daily/${this.day}.md`;
    }
  }

  async saveDay() {
    if (!this.dayPath || this.saving) return;
    this.saving = true;
    try {
      await this.api.save(this.dayPath, this.draft);
    } finally { this.saving = false; }
  }

  async addNote() {
    const title = this.newTitle.trim();
    if (!title || !this.day) return;
    this.newTitle = '';
    const res = await this.api.createNote(title, this.day);
    this.tl = res.timeline;
    this.dayNote = (await this.api.ensure(this.day)).note;
    this.openNote(title);
  }

  async onRebuild() {
    this.rebuilding = true;
    try { await this.api.rebuild(); location.reload(); } finally { this.rebuilding = false; }
  }
  async openNote(target: string) {
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
