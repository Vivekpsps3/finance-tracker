import { Holding } from '../models/transaction.model';

export function holdingGain(h: Holding): number {
  const cost = h.shares * h.purchase_price;
  return (h.value ?? 0) - cost;
}

export function holdingGainPercent(h: Holding): number {
  if (!h.current_price || h.purchase_price === 0) return 0;
  return ((h.current_price - h.purchase_price) / h.purchase_price) * 100;
}

export function totalPortfolioValue(holdings: Holding[]): number {
  return holdings.reduce((sum, h) => sum + (h.value ?? 0), 0);
}

export function totalPortfolioGain(holdings: Holding[]): number {
  return holdings.reduce((sum, h) => sum + holdingGain(h), 0);
}