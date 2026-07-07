import {
  Asset,
  CashflowSummary,
  FixedExpense,
  Holding,
  JobIncome,
  Liability,
  NetWorth,
  Subscription,
  Transaction,
} from '../models/transaction.model';

export function computeNetWorth(
  assets: Asset[],
  liabilities: Liability[],
  holdings: Holding[]
): NetWorth {
  const other_assets = assets.reduce((sum, a) => sum + (Number(a.current_value) || 0), 0);
  const portfolio = holdings.reduce((sum, h) => {
    const price = Number(h.current_price ?? h.purchase_price) || 0;
    const shares = Number(h.shares) || 0;
    return sum + price * shares;
  }, 0);
  const liab = liabilities.reduce((sum, l) => sum + (Number(l.balance_owed) || 0), 0);
  return {
    other_assets,
    portfolio,
    liabilities: liab,
    total_assets: other_assets + portfolio,
    total: other_assets + portfolio - liab,
    as_of: new Date().toISOString(),
  };
}

function monthlyAmount(amount: number, frequency: string): number {
  switch (frequency) {
    case 'annual':
      return amount / 12;
    case 'quarterly':
      return amount / 3;
    case 'biweekly':
      return (amount * 26) / 12;
    case 'weekly':
      return (amount * 52) / 12;
    case 'semimonthly':
      return amount * 2;
    case 'hourly':
      return amount * 40 * 52 / 12;
    case 'monthly':
    default:
      return amount;
  }
}

export function enrichJobIncome(row: JobIncome): JobIncome {
  const base = Number(row.base_pay) || 0;
  const monthly_gross =
    row.pay_frequency === 'hourly'
      ? base * (Number(row.hours_per_week) || 40) * 52 / 12
      : monthlyAmount(base, row.pay_frequency);
  const annual_bonus = Number(row.annual_bonus) || 0;
  const annual_equity = Number(row.annual_equity) || 0;
  const annual_other = Number(row.annual_other) || 0;
  const annual_taxes = Number(row.annual_taxes) || 0;
  const annual_deductions = Number(row.annual_deductions) || 0;
  const annual_base_pay = monthly_gross * 12;
  const annual_gross = annual_base_pay + annual_bonus + annual_equity + annual_other;
  const annual_net = annual_gross - annual_taxes - annual_deductions;
  const monthly_net = annual_net / 12;
  return {
    ...row,
    pay_periods_per_year: row.pay_periods_per_year || 12,
    annual_base_pay,
    annual_gross,
    monthly_gross,
    period_gross: monthly_gross,
    period_net: monthly_net,
    annual_net,
    monthly_net,
  };
}

export function enrichFixedExpense(row: FixedExpense): FixedExpense {
  const monthly = monthlyAmount(Number(row.amount) || 0, row.frequency);
  return { ...row, monthly_amount: monthly, annual_amount: monthly * 12 };
}

export function enrichSubscription(row: Subscription): Subscription {
  const monthly = monthlyAmount(Number(row.amount) || 0, row.frequency);
  return { ...row, monthly_amount: monthly, annual_amount: monthly * 12 };
}

export function enrichHolding(row: Holding): Holding {
  const shares = Number(row.shares) || 0;
  const purchase = Number(row.purchase_price) || 0;
  const current = Number(row.current_price ?? row.purchase_price) || 0;
  return {
    ...row,
    current_price: current,
    value: shares * current,
  };
}

export function computeCashflowSummary(
  start: string,
  end: string,
  transactions: Transaction[],
  jobIncomes: JobIncome[],
  fixedExpenses: FixedExpense[],
  subscriptions: Subscription[]
): CashflowSummary {
  const startD = new Date(start);
  const endD = new Date(end);
  let transaction_income = 0;
  let transaction_expenses = 0;
  for (const tx of transactions) {
    const d = new Date(tx.date);
    if (d < startD || d > endD) continue;
    const amt = Number(tx.amount) || 0;
    if (tx.type === 'income') transaction_income += amt;
    else transaction_expenses += Math.abs(amt);
  }
  const planned_income = jobIncomes
    .map(enrichJobIncome)
    .reduce((s, j) => s + (Number(j.monthly_net) || 0), 0);
  const fixed_total = fixedExpenses
    .map(enrichFixedExpense)
    .reduce((s, f) => s + (Number(f.monthly_amount) || 0), 0);
  const sub_total = subscriptions
    .map(enrichSubscription)
    .reduce((s, srow) => s + (Number(srow.monthly_amount) || 0), 0);
  const total_income = transaction_income + planned_income;
  const total_expenses = transaction_expenses + fixed_total + sub_total;
  const net_cashflow = total_income - total_expenses;
  const days = Math.max(
    1,
    (new Date(end).getTime() - new Date(start).getTime()) / (1000 * 60 * 60 * 24) + 1
  );
  return {
    start_date: start,
    end_date: end,
    transaction_income,
    transaction_expenses,
    planned_income,
    fixed_expenses: fixed_total,
    subscriptions: sub_total,
    total_income,
    total_expenses,
    net_cashflow,
    savings_rate: total_income > 0 ? (net_cashflow / total_income) * 100 : null,
    average_daily_spend: total_expenses / days,
    fixed_occurrences: [],
    subscription_occurrences: [],
  };
}
