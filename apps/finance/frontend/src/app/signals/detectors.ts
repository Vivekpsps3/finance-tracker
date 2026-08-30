import { CASH_SWEEP_SYMBOLS, FinancialSignal, LocalFinancialSnapshot } from './financial-signal';

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
  return [{
    id: 'cash-sweep-overlap',
    title: 'Possible cash double-count',
    summary: `Manual cash ($${cashTotal.toFixed(0)}) and sweep holdings ${sweeps.map(h => h.symbol).join(', ')} ($${sweepTotal.toFixed(0)}) may count the same cash twice.`,
    href: '/balance-sheet',
    hrefLabel: 'Review balance sheet',
  }];
}

export function detectStalePrices(snap: LocalFinancialSnapshot): FinancialSignal[] {
  if (!snap.holdings.length) return [];
  const nonLive = snap.holdings.filter(h => (h.priceSource || 'manual').toLowerCase() !== 'live');
  if (!nonLive.length) return [];
  return [{
    id: 'stale-or-manual-prices',
    title: nonLive.length === snap.holdings.length ? 'Portfolio prices are not live' : 'Some holdings lack live prices',
    summary: 'Market value uses manual, import, or cached quotes until you refresh prices. Ticker symbols are disclosed only on refresh.',
    href: '/portfolio',
    hrefLabel: 'Refresh portfolio',
  }];
}

export function detectDuplicateExpenses(snap: LocalFinancialSnapshot): FinancialSignal[] {
  const expenses = snap.transactions.filter(t => t.type === 'expense' && t.amount > 0);
  const buckets = new Map<string, number>();
  for (const t of expenses) {
    const key = `${t.date}|${t.amount.toFixed(2)}|${(t.description || t.category).toLowerCase()}`;
    buckets.set(key, (buckets.get(key) || 0) + 1);
  }
  const dups = [...buckets.entries()].filter(([, n]) => n >= 2);
  if (!dups.length) return [];
  return [{
    id: 'duplicate-expense-heuristic',
    title: 'Possible duplicate expenses',
    summary: 'Two or more expense rows share the same date, amount, and description/category.',
    href: '/transactions',
    hrefLabel: 'Open transactions',
  }];
}

export function runLocalDetectors(snap: LocalFinancialSnapshot): FinancialSignal[] {
  return [
    ...detectCashSweepOverlap(snap),
    ...detectStalePrices(snap),
    ...detectDuplicateExpenses(snap),
  ];
}
