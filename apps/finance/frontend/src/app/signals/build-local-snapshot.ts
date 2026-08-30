import { Asset, Holding, Liability, Transaction } from '../models/transaction.model';
import { enrichHolding } from '../crypto/client-finance';
import { LocalFinancialSnapshot } from './financial-signal';

export function buildLocalFinancialSnapshot(
  assets: Asset[],
  _liabilities: Liability[],
  holdings: Holding[],
  transactions: Transaction[]
): LocalFinancialSnapshot {
  return {
    holdings: holdings.map(h => {
      const enriched = enrichHolding(h);
      return {
        symbol: (enriched.symbol || '').trim().toUpperCase(),
        value: Number(enriched.value) || 0,
        priceSource: enriched.price_source ?? null,
      };
    }),
    assets: assets.map(a => ({
      name: a.name,
      category: a.category,
      currentValue: Number(a.current_value) || 0,
    })),
    transactions: transactions.map(t => ({
      date: t.date,
      type: t.type,
      category: t.category,
      amount: Number(t.amount) || 0,
      description: t.description,
    })),
  };
}
