import { DateFilter } from '../models/transaction.model';

export function todayIsoDate(): string {
  return new Date().toISOString().split('T')[0];
}

export function getDefaultDateFilter(): DateFilter {
  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  return { mode: 'month', month };
}

export function getDateRange(filter: DateFilter): { start: string | null; end: string | null } {
  if (filter.mode === 'all') {
    return { start: null, end: null };
  }

  if (filter.mode === 'month' && filter.month) {
    const [yStr, mStr] = filter.month.split('-');
    const y = parseInt(yStr, 10);
    const m = parseInt(mStr, 10);
    if (!y || !m) return { start: null, end: null };
    const start = `${y}-${String(m).padStart(2, '0')}-01`;
    const last = new Date(y, m, 0).getDate();
    const end = `${y}-${String(m).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
    return { start, end };
  }

  if (filter.mode === 'year' && filter.year) {
    const y = filter.year;
    return { start: `${y}-01-01`, end: `${y}-12-31` };
  }

  if (filter.mode === 'custom') {
    return { start: filter.start || null, end: filter.end || null };
  }

  return { start: null, end: null };
}

export function dateInRange(dateStr: string, start: string | null, end: string | null): boolean {
  if (!start && !end) return true;
  if (start && dateStr < start) return false;
  if (end && dateStr > end) return false;
  return true;
}

export function filterByDate<T extends { date: string }>(items: T[], filter: DateFilter): T[] {
  if (filter.mode === 'all') return [...items];
  const { start, end } = getDateRange(filter);
  return items.filter(item => dateInRange(item.date, start, end));
}