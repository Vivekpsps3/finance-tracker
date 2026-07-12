/**
 * Local financial intelligence types (INNO-001).
 * Pure browser-side; never mutates assets, liabilities, holdings, or transactions.
 * Must not send private finance data to the server (SEC-001).
 */

export type SignalKind = 'fact' | 'inference' | 'scenario';

export type SignalActionId =
  | 'review-balance-sheet'
  | 'refresh-portfolio-prices'
  | 'open-transactions'
  | 'dismiss';

export interface LocalFinancialSnapshot {
  /** ISO timestamp when the snapshot was built in-memory. */
  asOf: string;
  otherAssets: number;
  portfolio: number;
  liabilities: number;
  netWorth: number;
  holdings: Array<{
    symbol: string;
    shares: number;
    value: number;
    priceSource?: string | null;
  }>;
  assets: Array<{ name: string; category: string; currentValue: number }>;
  transactions: Array<{
    date: string;
    type: 'income' | 'expense';
    category: string;
    amount: number;
    description?: string;
  }>;
}

export interface FinancialSignal {
  id: string;
  detectorId: string;
  version: string;
  kind: SignalKind;
  title: string;
  summary: string;
  confidence: number;
  evidence: string[];
  reversibleActions: SignalActionId[];
}

export const SIGNAL_DETECTOR_VERSION = '1.0.0';

/** Money-market / sweep symbols that often overlap with manual cash assets. */
export const CASH_SWEEP_SYMBOLS = new Set([
  'SPAXX',
  'FDRXX',
  'SPRXX',
  'FZFXX',
  'VMFXX',
  'SWVXX',
]);
