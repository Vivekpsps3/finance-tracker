import { Component, Input, OnDestroy, OnInit } from '@angular/core';
import { Cell, Timeline } from './api';

const BORN = '2003-05-02';

function cell(map: Record<string, Cell> | undefined, id: string) {
  return map?.[id] ?? { n: 0 };
}

function parts(born: Date, now: Date) {
  let y = now.getFullYear() - born.getFullYear();
  let mo = now.getMonth() - born.getMonth();
  let d = now.getDate() - born.getDate();
  if (d < 0) {
    mo -= 1;
    d += new Date(now.getFullYear(), now.getMonth(), 0).getDate();
  }
  if (mo < 0) { y -= 1; mo += 12; }
  return { y, mo, d, h: now.getHours(), mi: now.getMinutes(), s: now.getSeconds() };
}

function nextBday(born: Date, now: Date) {
  const n = new Date(now.getFullYear(), born.getMonth(), born.getDate());
  if (n.getTime() <= now.getTime()) n.setFullYear(n.getFullYear() + 1);
  return Math.ceil((n.getTime() - now.getTime()) / 86400000);
}

@Component({
  selector: 'app-ops',
  template: `
    <div class="ops">
      <section class="ops-fin">
        <iframe title="Net worth" src="https://finance.vivekpanchagnula.com/embed"></iframe>
      </section>
      <section class="ops-age">
        <p class="ops-k">Age</p>
        <p class="ops-y">{{ p.y }}<small>.{{ frac }}</small></p>
        <p class="ops-break">{{ p.mo }} mo · {{ p.d }} d · {{ pad(p.h) }}:{{ pad(p.mi) }}:{{ pad(p.s) }}</p>
      </section>
      <section class="ops-meta">
        <div>
          <p class="ops-k">Today</p>
          <p>{{ today }}</p>
        </div>
        <div>
          <p class="ops-k">This week</p>
          <p>{{ tl?.currentWeek || '—' }}@if (weekN) { <span class="ops-n">{{ weekN }}</span> }</p>
        </div>
        <div>
          <p class="ops-k">Day notes</p>
          <p>{{ dayN }}</p>
        </div>
        <div>
          <p class="ops-k">Next birthday</p>
          <p>{{ until === 0 ? 'today' : until + 'd' }}</p>
        </div>
      </section>
    </div>
  `,
})
export class OpsComponent implements OnInit, OnDestroy {
  @Input() timeline: Timeline | null = null;
  p = { y: 0, mo: 0, d: 0, h: 0, mi: 0, s: 0 };
  frac = '000000';
  today = '';
  until = 0;
  private tick?: ReturnType<typeof setInterval>;

  get tl() { return this.timeline; }
  get dayN() { return this.tl ? cell(this.tl.daily, this.tl.currentDay).n : 0; }
  get weekN() { return this.tl ? cell(this.tl.weekly, this.tl.currentWeek).n : 0; }

  ngOnInit() {
    this.pulse();
    this.tick = setInterval(() => this.pulse(), 1000);
  }
  ngOnDestroy() { if (this.tick) clearInterval(this.tick); }

  pad(n: number) { return String(n).padStart(2, '0'); }

  private pulse() {
    const now = new Date();
    const raw = this.tl?.birthday || BORN;
    const born = new Date(raw + 'T00:00:00');
    this.p = parts(born, now);
    const years = (now.getTime() - born.getTime()) / (365.2425 * 86400000);
    this.frac = years.toFixed(8).split('.')[1] ?? '00000000';
    this.today = now.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
    this.until = nextBday(born, now);
  }
}
