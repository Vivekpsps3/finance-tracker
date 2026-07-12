import {
  CASH_SWEEP_SYMBOLS,
  FinancialSignal,
  LocalFinancialSnapshot,
  SIGNAL_DETECTOR_VERSION,
} from './financial-signal';

function signal(
  partial: Omit<FinancialSignal, 'version'> & { version?: string }
): FinancialSignal {
  return { version: SIGNAL_DETECTOR_VERSION, ...partial };
}

/** Manual cash asset + brokerage money-market holding may double-count. */
export function detectCashSweepOverlap(snap: LocalFinancialSnapshot): FinancialSignal[] {
  const cashAssets = snap.assets.filter(
    a =>
      a.category.toLowerCase().includes('cash') ||
      a.name.toLowerCase().includes('cash') ||
      a.name.toLowerCase().includes('checking') ||
      a.name.toLowerCase().includes('savings')
  );
  const sweeps = snap.holdings.filter(h => CASH_SWEEP_SYMBOLS.has(h.symbol));
  if (!cashAssets.length || !sweeps.length) return [];
  const cashTotal = cashAssets.reduce((s, a) => s + a.currentValue, 0);
  const sweepTotal = sweeps.reduce((s, h) => s + h.value, 0);
  return [
    signal({
      id: 'cash-sweep-overlap',
      detectorId: 'cash_sweep_overlap',
      kind: 'inference',
      title: 'Possible cash double-count',
      summary:
        'Manual cash assets and brokerage cash-sweep holdings are both present. Combined net worth may count the same cash twice if both are funded from the same money.',
      confidence: 0.7,
      evidence: [
        `manual_cash=${cashTotal.toFixed(2)}`,
        `sweep_symbols=${sweeps.map(h => h.symbol).join(',')}`,
        `sweep_value=${sweepTotal.toFixed(2)}`,
      ],
      reversibleActions: ['review-balance-sheet', 'dismiss'],
    }),
  ];
}

/** Holdings without live prices. */
export function detectStalePrices(snap: LocalFinancialSnapshot): FinancialSignal[] {
  if (!snap.holdings.length) return [];
  const nonLive = snap.holdings.filter(h => {
    const src = (h.priceSource || 'manual').toLowerCase();
    return src !== 'live';
  });
  if (!nonLive.length) return [];
  const allManual = nonLive.length === snap.holdings.length;
  return [
    signal({
      id: 'stale-or-manual-prices',
      detectorId: 'stale_price',
      kind: allManual ? 'fact' : 'inference',
      title: allManual ? 'Portfolio prices are not live' : 'Some holdings lack live prices',
      summary:
        'Portfolio market value uses manual, import, or cached quotes until you explicitly refresh prices. Ticker symbols are disclosed only on refresh.',
      confidence: allManual ? 0.95 : 0.75,
      evidence: nonLive.map(h => `${h.symbol}:${h.priceSource || 'manual'}`),
      reversibleActions: ['refresh-portfolio-prices', 'dismiss'],
    }),
  ];
}

/** Same-day same-amount expense pairs (heuristic duplicate charges). */
export function detectDuplicateExpenses(snap: LocalFinancialSnapshot): FinancialSignal[] {
  const expenses = snap.transactions.filter(t => t.type === 'expense' && t.amount > 0);
  const buckets = new Map<string, typeof expenses>();
  for (const t of expenses) {
    const key = `${t.date}|${t.amount.toFixed(2)}|${(t.description || t.category).toLowerCase()}`;
    const list = buckets.get(key) || [];
    list.push(t);
    buckets.set(key, list);
  }
  const dups = [...buckets.entries()].filter(([, rows]) => rows.length >= 2);
  if (!dups.length) return [];
  return [
    signal({
      id: 'duplicate-expense-heuristic',
      detectorId: 'duplicate_tx_heuristic',
      kind: 'inference',
      title: 'Possible duplicate expenses',
      summary:
        'Two or more expense rows share the same date, amount, and description/category. Review before treating them as separate charges.',
      confidence: 0.6,
      evidence: dups.slice(0, 5).map(([key, rows]) => `${key}×${rows.length}`),
      reversibleActions: ['open-transactions', 'dismiss'],
    }),
  ];
}

/** Run all pure detectors. Deterministic for a given snapshot. */
export function runLocalDetectors(snap: LocalFinancialSnapshot): FinancialSignal[] {
  return [
    ...detectCashSweepOverlap(snap),
    ...detectStalePrices(snap),
    ...detectDuplicateExpenses(snap),
  ];
}
