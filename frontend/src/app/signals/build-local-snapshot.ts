import { Asset, Holding, Liability, Transaction } from '../models/transaction.model';
import { computeNetWorth, enrichHolding } from '../crypto/client-finance';
import { LocalFinancialSnapshot } from './financial-signal';

/** Build an in-memory snapshot for detectors. Read-only; no network or vault writes. */
export function buildLocalFinancialSnapshot(
  assets: Asset[],
  liabilities: Liability[],
  holdings: Holding[],
  transactions: Transaction[]
): LocalFinancialSnapshot {
  const nw = computeNetWorth(assets, liabilities, holdings);
  return {
    asOf: nw.as_of || new Date().toISOString(),
    otherAssets: nw.other_assets,
    portfolio: nw.portfolio,
    liabilities: nw.liabilities,
    netWorth: nw.total,
    holdings: holdings.map(h => {
      const enriched = enrichHolding(h);
      return {
        symbol: (enriched.symbol || '').trim().toUpperCase(),
        shares: Number(enriched.shares) || 0,
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
