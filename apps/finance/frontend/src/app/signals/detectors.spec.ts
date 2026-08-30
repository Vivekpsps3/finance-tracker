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
    holdings: [],
    assets: [],
    transactions: [],
    ...over,
  });

  it('flags cash sweep overlap when cash asset and SPAXX both present', () => {
    const signals = detectCashSweepOverlap(
      baseSnap({
        assets: [{ name: 'Checking', category: 'cash', currentValue: 5000 }],
        holdings: [{ symbol: 'SPAXX', value: 1000, priceSource: 'import' }],
      })
    );
    expect(signals).toHaveSize(1);
    expect(signals[0].href).toBe('/balance-sheet');
  });

  it('does not flag cash sweep when only one plane has cash', () => {
    expect(
      detectCashSweepOverlap(
        baseSnap({
          assets: [{ name: 'Checking', category: 'cash', currentValue: 5000 }],
          holdings: [{ symbol: 'VTI', value: 2000, priceSource: 'live' }],
        })
      )
    ).toEqual([]);
  });

  it('flags non-live holdings as stale/manual prices', () => {
    const signals = detectStalePrices(
      baseSnap({
        holdings: [
          { symbol: 'VTI', value: 2000, priceSource: 'import' },
          { symbol: 'VXUS', value: 500, priceSource: 'manual' },
        ],
      })
    );
    expect(signals).toHaveSize(1);
    expect(signals[0].href).toBe('/portfolio');
  });

  it('does not flag when all holdings are live', () => {
    expect(
      detectStalePrices(
        baseSnap({
          holdings: [{ symbol: 'VTI', value: 2000, priceSource: 'live' }],
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
    expect(signals[0].href).toBe('/transactions');
  });

  it('runLocalDetectors is deterministic', () => {
    const snap = baseSnap({
      assets: [{ name: 'Cash', category: 'cash', currentValue: 100 }],
      holdings: [{ symbol: 'SPAXX', value: 50, priceSource: 'import' }],
      transactions: [
        { date: '2026-07-01', type: 'expense', category: 'x', amount: 9, description: 'dup' },
        { date: '2026-07-01', type: 'expense', category: 'x', amount: 9, description: 'dup' },
      ],
    });
    expect(runLocalDetectors(snap).map(s => s.id)).toEqual(runLocalDetectors(snap).map(s => s.id));
  });

  it('buildLocalFinancialSnapshot uppercases symbols', () => {
    const assets = [{ id: 1, name: 'Cash', category: 'cash', current_value: 100, as_of_date: '2026-01-01' }] as Asset[];
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
    const snap = buildLocalFinancialSnapshot(assets, [] as Liability[], holdings, [] as Transaction[]);
    expect(snap.holdings[0].symbol).toBe('SPAXX');
  });
});
