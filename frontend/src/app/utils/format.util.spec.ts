import { formatCompactMoney, formatDate, formatMoney, formatMonthYear } from './format.util';

describe('format.util', () => {
  it('formats money with locale currency', () => {
    expect(formatMoney(1234.5, 'USD', 'en-US')).toBe('$1,234.50');
    expect(formatMoney(null)).toBe('—');
  });

  it('formats compact money', () => {
    const compact = formatCompactMoney(12_500, 'USD', 'en-US');
    expect(compact).toContain('12');
    expect(compact).toMatch(/\$|USD/);
  });

  it('formats dates with locale', () => {
    expect(formatDate('2026-07-11T12:00:00Z', 'en-US')).toMatch(/2026/);
    expect(formatMonthYear(new Date(2026, 6, 15), 'en-US')).toMatch(/July/);
    expect(formatDate('not-a-date')).toBe('—');
  });
});
