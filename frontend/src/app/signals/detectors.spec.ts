import { buildLocalFinancialSnapshot } from './build-local-snapshot';
import {
  detectCashSweepOverlap,
  detectDuplicateExpenses,
  detectStalePrices,
  runLocalDetectors,
} from './detectors';
import { LocalFinancialSnapshot } from './financial-signal';
import { Asset, Holding, Liability, Transaction } from '../models/transaction.model';

describe('local financial signal detectors', () => {
  const baseSnap = (over: Partial<LocalFinancialSnapshot> = {}): LocalFinancialSnapshot => ({
    asOf: '2026-07-11T00:00:00.000Z',
    otherAssets: 5000,
    portfolio: 1000,
    liabilities: 0,
    netWorth: 6000,
    holdings: [],
    assets: [],
    transactions: [],
    ...over,
  });

  it('flags cash sweep overlap when cash asset and SPAXX both present', () => {
    const signals = detectCashSweepOverlap(
      baseSnap({
        assets: [{ name: 'Checking', category: 'cash', currentValue: 5000 }],
        holdings: [{ symbol: 'SPAXX', shares: 1000, value: 1000, priceSource: 'import' }],
      })
    );
    expect(signals).toHaveSize(1);
    expect(signals[0].detectorId).toBe('cash_sweep_overlap');
    expect(signals[0].kind).toBe('inference');
    expect(signals[0].reversibleActions).toContain('review-balance-sheet');
  });

  it('does not flag cash sweep when only one plane has cash', () => {
    expect(
      detectCashSweepOverlap(
        baseSnap({
          assets: [{ name: 'Checking', category: 'cash', currentValue: 5000 }],
          holdings: [{ symbol: 'VTI', shares: 10, value: 2000, priceSource: 'live' }],
        })
      )
    ).toEqual([]);
  });

  it('flags non-live holdings as stale/manual prices', () => {
    const signals = detectStalePrices(
      baseSnap({
        holdings: [
          { symbol: 'VTI', shares: 10, value: 2000, priceSource: 'import' },
          { symbol: 'VXUS', shares: 5, value: 500, priceSource: 'manual' },
        ],
      })
    );
    expect(signals).toHaveSize(1);
    expect(signals[0].detectorId).toBe('stale_price');
    expect(signals[0].confidence).toBeGreaterThan(0.7);
  });

  it('does not flag when all holdings are live', () => {
    expect(
      detectStalePrices(
        baseSnap({
          holdings: [{ symbol: 'VTI', shares: 10, value: 2000, priceSource: 'live' }],
        })
      )
    ).toEqual([]);
  });

  it('detects same-day same-amount duplicate expenses', () => {
    const signals = detectDuplicateExpenses(
      baseSnap({
        transactions: [
          { date: '2026-07-01', type: 'expense', category: 'food', amount: 12.5, description: 'Cafe' },
          { date: '2026-07-01', type: 'expense', category: 'food', amount: 12.5, description: 'Cafe' },
        ],
      })
    );
    expect(signals).toHaveSize(1);
    expect(signals[0].detectorId).toBe('duplicate_tx_heuristic');
  });

  it('runLocalDetectors is deterministic and pure', () => {
    const snap = baseSnap({
      assets: [{ name: 'Cash', category: 'cash', currentValue: 100 }],
      holdings: [{ symbol: 'SPAXX', shares: 50, value: 50, priceSource: 'import' }],
      transactions: [
        { date: '2026-07-01', type: 'expense', category: 'x', amount: 9, description: 'dup' },
        { date: '2026-07-01', type: 'expense', category: 'x', amount: 9, description: 'dup' },
      ],
    });
    const a = runLocalDetectors(snap);
    const b = runLocalDetectors(snap);
    expect(a.map(s => s.id)).toEqual(b.map(s => s.id));
    expect(a.length).toBeGreaterThanOrEqual(2);
  });

  it('buildLocalFinancialSnapshot is read-only over collections', () => {
    const assets = [{ id: 1, name: 'Cash', category: 'cash', current_value: 100, as_of_date: '2026-01-01' }] as Asset[];
    const liabilities = [] as Liability[];
    const holdings = [
      {
        id: 1,
        symbol: 'spaxx',
        shares: 10,
        purchase_price: 1,
        purchase_date: '2026-01-01',
        current_price: 1,
        price_source: 'import',
      },
    ] as Holding[];
    const txs = [] as Transaction[];
    const snap = buildLocalFinancialSnapshot(assets, liabilities, holdings, txs);
    expect(snap.holdings[0].symbol).toBe('SPAXX');
    expect(snap.netWorth).toBe(110);
    expect(assets[0].current_value).toBe(100);
  });

  it('exposes pure detector entrypoint without mutating snapshot inputs', () => {
    const snap = baseSnap({
      holdings: [{ symbol: 'VTI', shares: 1, value: 100, priceSource: 'live' }],
    });
    const before = JSON.stringify(snap);
    runLocalDetectors(snap);
    expect(JSON.stringify(snap)).toBe(before);
    expect(typeof runLocalDetectors).toBe('function');
  });
});

