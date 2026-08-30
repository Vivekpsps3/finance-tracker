import { holdingGain, holdingGainPercent, totalPortfolioValue } from './portfolio.util';
import { Holding } from '../models/transaction.model';

describe('portfolio.util', () => {
  const h: Holding = {
    id: 1,
    symbol: 'AAPL',
    shares: 2,
    purchase_price: 100,
    purchase_date: '2026-01-01',
    current_price: 120,
    value: 240,
  };

  it('computes gain', () => {
    expect(holdingGain(h)).toBe(40);
  });

  it('computes gain percent', () => {
    expect(holdingGainPercent(h)).toBe(20);
  });

  it('sums portfolio value', () => {
    expect(totalPortfolioValue([h])).toBe(240);
  });
});