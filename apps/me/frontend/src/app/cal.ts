import { Cell, Misc, Timeline } from './api';

export const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const DOW_MON = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function utc(y: number, m: number, d: number) { return new Date(Date.UTC(y, m, d)); }
export function addDays(d: Date, n: number) { const x = new Date(d); x.setUTCDate(x.getUTCDate() + n); return x; }
export function ymd(d: Date) { return d.toISOString().slice(0, 10); }
export function pad(n: number) { return String(n).padStart(2, '0'); }

export function isoWeek(d: Date) {
  const t = new Date(d.getTime());
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  const start = utc(t.getUTCFullYear(), 0, 1);
  const w = Math.ceil((((t.getTime() - start.getTime()) / 86400000) + 1) / 7);
  return { y: t.getUTCFullYear(), w };
}

export function isoMonday(y: number, w: number) {
  const jan4 = utc(y, 0, 4);
  return addDays(jan4, -((jan4.getUTCDay() + 6) % 7) + (w - 1) * 7);
}

export function widOf(d: Date) {
  const { y, w } = isoWeek(d);
  return `${y}-W${pad(w)}`;
}

export function hue(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 33 + s.charCodeAt(i)) >>> 0;
  return h % 360;
}

export function cell(map: Record<string, Cell>, id: string): Cell {
  return map[id] ?? { n: 0, refs: [] };
}

export function eraYears(e: Misc, born: number, last: number): [number, number] {
  const a = e.start ? +e.start.slice(0, 4) : born;
  const b = e.end ? +e.end.slice(0, 4) : last;
  return [Math.max(born, a), Math.min(last, b)];
}

export function eraCoversDay(e: Misc, day: string) {
  if (!e.start) return false;
  return day >= e.start && day <= (e.end || '9999-12-31');
}

export function eraCoversYear(e: Misc, y: number) {
  if (!e.start) return false;
  const a = +e.start.slice(0, 4);
  const b = e.end ? +e.end.slice(0, 4) : 9999;
  return y >= a && y <= b;
}

export function erasAt(list: Misc[], y: number, day?: string) {
  return list.filter((e) => (day ? eraCoversDay(e, day) : eraCoversYear(e, y)));
}

export function monthWeeks(ym: string) {
  const [y, m] = ym.split('-').map(Number);
  const first = utc(y, m - 1, 1);
  const last = utc(y, m, 0);
  const start = addDays(first, -((first.getUTCDay() + 6) % 7));
  const weeks: { id: string; days: { id: string; in: boolean; dow: number; n: number }[] }[] = [];
  for (let d = start; d <= last || weeks.length < 6; d = addDays(d, 7)) {
    const days = [];
    for (let i = 0; i < 7; i++) {
      const day = addDays(d, i);
      const id = ymd(day);
      days.push({ id, in: day.getUTCMonth() === m - 1, dow: day.getUTCDay(), n: 0 });
    }
    weeks.push({ id: widOf(addDays(d, 3)), days });
    if (ymd(addDays(d, 6)) >= ymd(last) && weeks.length >= 4) break;
  }
  return weeks;
}

export function fillDays(weeks: ReturnType<typeof monthWeeks>, tl: Timeline) {
  for (const w of weeks) {
    for (const d of w.days) d.n = cell(tl.daily, d.id).n;
  }
  return weeks;
}

export function clock(d = new Date()) {
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}
