export type MarketCacheStatus = 'hit' | 'miss' | 'refresh' | 'partial';
export type StockLabPurchaseMode = 'shares' | 'budget' | 'target_price';
export type DividendCadence = 'monthly' | 'quarterly' | 'annual' | 'irregular' | 'none';

export interface MarketInstrumentProfile {
  name?: string | null;
  asset_type?: string | null;
  exchange?: string | null;
  currency?: string | null;
  sector?: string | null;
  industry?: string | null;
  website?: string | null;
  quote_type?: string | null;
}

export interface MarketQuoteSummary {
  current_price?: number | null;
  previous_close?: number | null;
  open?: number | null;
  day_high?: number | null;
  day_low?: number | null;
  fifty_two_week_high?: number | null;
  fifty_two_week_low?: number | null;
  market_cap?: number | null;
  beta?: number | null;
  trailing_pe?: number | null;
  forward_pe?: number | null;
  dividend_rate?: number | null;
  dividend_yield?: number | null;
}

export interface MarketPricePoint {
  date: string;
  open?: number | null;
  high?: number | null;
  low?: number | null;
  close: number;
  adjusted_close?: number | null;
  volume?: number | null;
}

export interface MarketDividendEvent {
  date: string;
  amount: number;
}

export interface MarketSplitEvent {
  date: string;
  ratio: number;
}

export interface MarketResearchResponse {
  symbol: string;
  valid: boolean;
  source: string;
  fetched_at: string;
  cache_status: MarketCacheStatus;
  warnings: string[];
  profile: MarketInstrumentProfile | null;
  quote: MarketQuoteSummary | null;
  history: MarketPricePoint[];
  dividends: MarketDividendEvent[];
  splits: MarketSplitEvent[];
  fundamentals: Record<string, unknown> | null;
  etf: Record<string, unknown> | null;
  analyst: Record<string, unknown> | null;
}

export interface MarketResearchBatchResponse {
  results: MarketResearchResponse[];
  failed: Array<{ symbol: string; error: string }>;
}

export interface StockLabScenario {
  id: number;
  name: string;
  primary_symbol: string;
  comparison_symbols: string[];
  include_owned_symbols: boolean;
  selected_owned_symbols: string[];
  purchase_mode: StockLabPurchaseMode;
  shares: number | null;
  budget: number | null;
  target_price: number | null;
  cost_basis: number | null;
  recurring_contribution: number | null;
  projection_years: number;
  bear_growth_rate: number;
  base_growth_rate: number;
  bull_growth_rate: number;
  custom_growth_rate: number | null;
  dividend_growth_rate: number;
  reinvest_dividends: boolean;
  tax_drag: number;
  fee_drag: number;
  inflation_rate: number;
  created_at: string;
  updated_at: string;
}

export interface ReturnPeriodRow {
  key: string;
  label: string;
  available: boolean;
  start_date: string | null;
  end_date: string | null;
  start_price: number | null;
  end_price: number | null;
  price_return: number | null;
  price_return_pct: number | null;
  dividend_return: number;
  dividend_return_pct: number | null;
  total_return: number | null;
  total_return_pct: number | null;
  annualized_price_return_pct: number | null;
  annualized_total_return_pct: number | null;
}

export interface PurchasePlanResult {
  effective_purchase_price: number;
  shares: number;
  cash_required: number;
  position_value: number;
  break_even_price: number;
  annual_dividend_income: number;
  projected_nominal_value: number;
  projected_real_value: number;
}

export interface ScorecardItem {
  label: string;
  score: number;
  tone: 'success' | 'warning' | 'danger' | 'default';
  note: string;
}
