import { filterByDate, getDateRange, getDefaultDateFilter } from './date.util';

describe('date.util', () => {
  const items = [
    { date: '2026-01-15', id: 1 },
    { date: '2026-02-10', id: 2 },
    { date: '2026-03-20', id: 3 },
  ];

  it('getDefaultDateFilter returns month mode', () => {
    const f = getDefaultDateFilter();
    expect(f.mode).toBe('month');
    expect(f.month).toMatch(/^\d{4}-\d{2}$/);
  });

  it('filters by month', () => {
    const filtered = filterByDate(items, { mode: 'month', month: '2026-02' });
    expect(filtered.map(i => i.id)).toEqual([2]);
  });

  it('filters by year', () => {
    const filtered = filterByDate(items, { mode: 'year', year: 2026 });
    expect(filtered.length).toBe(3);
  });

  it('filters by custom range', () => {
    const filtered = filterByDate(items, {
      mode: 'custom',
      start: '2026-02-01',
      end: '2026-03-15',
    });
    expect(filtered.map(i => i.id)).toEqual([2]);
  });

  it('getDateRange for month returns first and last day', () => {
    const range = getDateRange({ mode: 'month', month: '2026-02' });
    expect(range).toEqual({ start: '2026-02-01', end: '2026-02-28' });
  });
});