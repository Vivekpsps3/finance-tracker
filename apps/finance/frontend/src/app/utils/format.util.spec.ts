import { formatCompactMoney, formatMoney } from './format.util';

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
});
