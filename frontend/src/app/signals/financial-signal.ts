export interface LocalFinancialSnapshot {
  holdings: Array<{ symbol: string; value: number; priceSource?: string | null }>;
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
  title: string;
  summary: string;
  href: string;
  hrefLabel: string;
}

export const CASH_SWEEP_SYMBOLS = new Set([
  'SPAXX',
  'FDRXX',
  'SPRXX',
  'FZFXX',
  'VMFXX',
  'SWVXX',
]);
