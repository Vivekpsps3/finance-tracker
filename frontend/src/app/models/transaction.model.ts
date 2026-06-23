export interface Transaction {
  id: number;
  date: string;
  type: 'income' | 'expense';
  category: string;
  amount: number;
  description?: string;
  source?: 'manual' | 'import';
  account_display?: string | null;
}

export interface ImportPreviewRow {
  dedupe_key: string;
  date: string;
  account_mask: string;
  account_display: string;
  description: string;
  category: string;
  amount: number;
  status: 'new' | 'duplicate';
}

export interface ImportPreviewResult {
  bank: string;
  filename: string;
  rows: ImportPreviewRow[];
  summary: { total_parsed: number; new: number; duplicate: number };
}

export interface BankImportOption {
  slug: string;
  name: string;
  hint: string;
  file_extensions: string[];
}

export interface ImportCommitResult {
  inserted: number;
  skipped: number;
  batch_id: number;
}

export interface Holding {
  id: number;
  symbol: string;
  shares: number;
  purchase_price: number;
  purchase_date: string;
  current_price?: number;
  value?: number;
  price_source?: string;
  price_as_of?: string | null;
}

export interface TransactionCreate {
  date: string;
  type: 'income' | 'expense';
  category: string;
  amount: number;
  description?: string;
}

export interface HoldingCreate {
  symbol: string;
  shares: number;
  purchase_price: number;
  purchase_date: string;
}

export interface Asset {
  id: number;
  name: string;
  category: string;
  current_value: number;
  as_of_date: string;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface AssetCreate {
  name: string;
  category: string;
  current_value: number;
  as_of_date: string;
  notes?: string;
}

export interface Liability {
  id: number;
  name: string;
  category: string;
  balance_owed: number;
  as_of_date: string;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface LiabilityCreate {
  name: string;
  category: string;
  balance_owed: number;
  as_of_date: string;
  notes?: string;
}

export interface NetWorth {
  other_assets: number;
  portfolio: number;
  liabilities: number;
  total_assets: number;
  total: number;
  as_of?: string;
  portfolio_sources?: Record<string, string>;
}

export interface MarketPriceQuote {
  symbol: string;
  price: number;
  price_source: string;
  price_as_of?: string | null;
  valid: boolean;
}

export interface NetWorthHistoryPoint {
  date: string;
  other_assets: number;
  portfolio: number;
  liabilities: number;
  total_assets: number;
  total: number;
}

export type ToastKind = 'success' | 'error' | 'info';

export interface ToastPayload {
  message: string;
  kind: ToastKind;
  undo?: () => void;
}

export interface DateFilter {
  mode: 'month' | 'year' | 'custom' | 'all';
  month?: string; // YYYY-MM
  year?: number;
  start?: string; // YYYY-MM-DD
  end?: string; // YYYY-MM-DD
}