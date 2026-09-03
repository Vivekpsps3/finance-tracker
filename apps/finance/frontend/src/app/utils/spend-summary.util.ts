export interface SpendCategoryRow {
  label: string;
  value: number;
  pct: number;
}

export interface SpendPurchaseRow {
  id: number;
  date: string;
  description: string;
  category: string;
  amount: number;
}

export interface MonthSpendSummary {
  monthKey: string;
  expenseTotal: number;
  incomeTotal: number;
  net: number;
  activeDays: number;
  categories: SpendCategoryRow[];
  topPurchases: SpendPurchaseRow[];
}

export function monthKeyFromDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function inMonth(date: string, monthKey: string): boolean {
  return !!monthKey && date.startsWith(`${monthKey}-`);
}

export function summarizeMonthSpend(
  transactions: Array<{
    id: number;
    date: string;
    type: string;
    category: string;
    description?: string | null;
    amount: number;
  }>,
  monthKey: string,
  topN = 5
): MonthSpendSummary {
  const rows = monthKey ? transactions.filter(tx => inMonth(tx.date, monthKey)) : transactions;
  const expenses = rows.filter(tx => tx.type === 'expense');
  const incomeTotal = rows.filter(tx => tx.type === 'income').reduce((sum, tx) => sum + tx.amount, 0);
  const expenseTotal = expenses.reduce((sum, tx) => sum + tx.amount, 0);
  const byCategory = new Map<string, number>();
  for (const tx of expenses) {
    const label = tx.category.trim() || 'Uncategorized';
    byCategory.set(label, (byCategory.get(label) || 0) + tx.amount);
  }
  const categories = [...byCategory.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([label, value]) => ({
      label,
      value,
      pct: expenseTotal ? (value / expenseTotal) * 100 : 0,
    }));
  const topPurchases = [...expenses]
    .sort((a, b) => b.amount - a.amount || b.date.localeCompare(a.date))
    .slice(0, topN)
    .map(tx => ({
      id: tx.id,
      date: tx.date,
      description: (tx.description || '').trim() || tx.category,
      category: tx.category,
      amount: tx.amount,
    }));
  return {
    monthKey,
    expenseTotal,
    incomeTotal,
    net: incomeTotal - expenseTotal,
    activeDays: new Set(rows.map(tx => tx.date)).size,
    categories,
    topPurchases,
  };
}
