import {
  computeCashflowSummary,
  computeNetWorth,
  enrichFixedExpense,
  enrichHolding,
  enrichJobIncome,
  enrichSubscription,
} from './client-finance';
import {
  Asset,
  FixedExpense,
  Holding,
  JobIncome,
  Liability,
  Subscription,
  Transaction,
} from '../models/transaction.model';

describe('client-finance', () => {
  const asset = (value: number): Asset =>
    ({
      id: 1,
      name: 'Cash',
      category: 'cash',
      current_value: value,
      as_of_date: '2026-01-01',
    }) as Asset;

  const liability = (balance: number): Liability =>
    ({
      id: 1,
      name: 'Loan',
      category: 'other',
      balance_owed: balance,
      as_of_date: '2026-01-01',
    }) as Liability;

  const holding = (shares: number, price: number): Holding =>
    ({
      id: 1,
      symbol: 'VTI',
      shares,
      purchase_price: price,
      purchase_date: '2026-01-01',
      current_price: price,
    }) as Holding;

  it('computes net worth from assets, holdings, and liabilities', () => {
    const nw = computeNetWorth([asset(1000), asset(500)], [liability(200)], [holding(10, 20)]);
    expect(nw.other_assets).toBe(1500);
    expect(nw.portfolio).toBe(200);
    expect(nw.liabilities).toBe(200);
    expect(nw.total_assets).toBe(1700);
    expect(nw.total).toBe(1500);
  });

  it('falls back to purchase price when current price missing', () => {
    const h = {
      id: 2,
      symbol: 'VXUS',
      shares: 5,
      purchase_price: 40,
      purchase_date: '2026-01-01',
    } as Holding;
    const nw = computeNetWorth([], [], [h]);
    expect(nw.portfolio).toBe(200);
  });

  it('enriches holdings with market value', () => {
    const row = enrichHolding(holding(3, 10));
    expect(row.value).toBe(30);
    expect(row.current_price).toBe(10);
  });

  it('enriches fixed expenses and subscriptions to monthly amounts', () => {
    const fixed = enrichFixedExpense({
      id: 1,
      name: 'Rent',
      category: 'housing',
      amount: 1200,
      frequency: 'monthly',
      start_date: '2026-01-01',
      autopay: true,
      is_active: true,
      next_due_date: '2026-02-01',
      monthly_amount: 0,
      annual_amount: 0,
      created_at: '',
      updated_at: '',
    } as FixedExpense);
    expect(fixed.monthly_amount).toBe(1200);
    expect(fixed.annual_amount).toBe(14400);

    const annual = enrichFixedExpense({
      ...fixed,
      amount: 1200,
      frequency: 'annual',
    });
    expect(annual.monthly_amount).toBe(100);

    const sub = enrichSubscription({
      id: 1,
      name: 'Music',
      category: 'entertainment',
      amount: 12,
      frequency: 'monthly',
      next_bill_date: '2026-02-01',
      is_active: true,
      next_due_date: '2026-02-01',
      monthly_amount: 0,
      annual_amount: 0,
      created_at: '',
      updated_at: '',
    } as Subscription);
    expect(sub.monthly_amount).toBe(12);
  });

  it('enriches job income net estimates', () => {
    const row = enrichJobIncome({
      id: 1,
      employer: 'Acme',
      pay_frequency: 'monthly',
      base_pay: 5000,
      annual_bonus: 1200,
      annual_equity: 0,
      annual_other: 0,
      annual_taxes: 6000,
      annual_deductions: 1200,
      taxes_per_period: 0,
      deductions_per_period: 0,
      effective_date: '2026-01-01',
      is_active: true,
      pay_periods_per_year: 12,
      annual_base_pay: 0,
      annual_gross: 0,
      monthly_gross: 0,
      period_gross: 0,
      period_net: 0,
      annual_net: 0,
      monthly_net: 0,
      created_at: '',
      updated_at: '',
    } as JobIncome);
    expect(row.annual_base_pay).toBe(60000);
    expect(row.annual_gross).toBe(61200);
    expect(row.annual_net).toBe(54000);
    expect(row.monthly_net).toBe(4500);
  });

  it('computes cashflow summary for a period', () => {
    const txs: Transaction[] = [
      {
        id: 1,
        date: '2026-01-10',
        type: 'income',
        category: 'pay',
        amount: 1000,
      },
      {
        id: 2,
        date: '2026-01-12',
        type: 'expense',
        category: 'food',
        amount: 100,
      },
      {
        id: 3,
        date: '2025-12-01',
        type: 'expense',
        category: 'old',
        amount: 999,
      },
    ];
    const incomes = [
      enrichJobIncome({
        id: 1,
        employer: 'Acme',
        pay_frequency: 'monthly',
        base_pay: 3000,
        annual_bonus: 0,
        annual_equity: 0,
        annual_other: 0,
        annual_taxes: 0,
        annual_deductions: 0,
        taxes_per_period: 0,
        deductions_per_period: 0,
        effective_date: '2026-01-01',
        is_active: true,
        pay_periods_per_year: 12,
        annual_base_pay: 0,
        annual_gross: 0,
        monthly_gross: 0,
        period_gross: 0,
        period_net: 0,
        annual_net: 0,
        monthly_net: 0,
        created_at: '',
        updated_at: '',
      } as JobIncome),
    ];
    const fixed = [
      enrichFixedExpense({
        id: 1,
        name: 'Rent',
        category: 'housing',
        amount: 1000,
        frequency: 'monthly',
        start_date: '2026-01-01',
        autopay: true,
        is_active: true,
        next_due_date: '2026-02-01',
        monthly_amount: 0,
        annual_amount: 0,
        created_at: '',
        updated_at: '',
      } as FixedExpense),
    ];
    const subs = [
      enrichSubscription({
        id: 1,
        name: 'Cloud',
        category: 'software',
        amount: 20,
        frequency: 'monthly',
        next_bill_date: '2026-02-01',
        is_active: true,
        next_due_date: '2026-02-01',
        monthly_amount: 0,
        annual_amount: 0,
        created_at: '',
        updated_at: '',
      } as Subscription),
    ];

    const summary = computeCashflowSummary('2026-01-01', '2026-01-31', txs, incomes, fixed, subs);
    expect(summary.transaction_income).toBe(1000);
    expect(summary.transaction_expenses).toBe(100);
    expect(summary.planned_income).toBeCloseTo(3055.44, 2);
    expect(summary.fixed_expenses).toBe(1000);
    expect(summary.subscriptions).toBe(0);
    expect(summary.total_income).toBeCloseTo(4055.44, 2);
    expect(summary.total_expenses).toBe(1100);
    expect(summary.net_cashflow).toBeCloseTo(2955.44, 2);
    expect(summary.savings_rate).toBeCloseTo(72.87, 1);
  });

  it('counts only active recurring records occurring inside their effective date range', () => {
    const fixed = [
      { id: 1, name: 'Weekly', category: 'home', amount: 10, frequency: 'weekly', start_date: '2026-01-01', end_date: '2026-01-15', is_active: true },
      { id: 2, name: 'Inactive', category: 'home', amount: 100, frequency: 'monthly', start_date: '2026-01-01', is_active: false },
    ] as FixedExpense[];
    const subs = [{ id: 3, name: 'Quarterly', category: 'software', amount: 30, frequency: 'quarterly', next_bill_date: '2025-10-31', is_active: true }] as Subscription[];

    const summary = computeCashflowSummary('2026-01-01', '2026-03-31', [], [], fixed, subs);

    expect(summary.fixed_expenses).toBe(30);
    expect(summary.subscriptions).toBe(30);
    expect(summary.fixed_occurrences.map(row => row.date)).toEqual(['2026-01-01', '2026-01-08', '2026-01-15']);
    expect(summary.subscription_occurrences.map(row => row.date)).toEqual(['2026-01-31']);
  });
});
