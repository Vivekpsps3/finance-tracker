from __future__ import annotations

from calendar import monthrange
from dataclasses import dataclass
from datetime import date, timedelta

from sqlalchemy.orm import Session

from models import (
    FixedExpense,
    FixedExpenseFrequency,
    IncomePayFrequency,
    JobIncome,
    Subscription,
    Transaction,
    TransactionType,
)


def periods_per_year(frequency: IncomePayFrequency | str) -> int:
    value = frequency.value if hasattr(frequency, "value") else str(frequency)
    return {
        "monthly": 12,
        "semimonthly": 24,
        "biweekly": 26,
        "weekly": 52,
        "hourly": 52,
        "annual": 1,
    }.get(value, 1)


def annual_base_pay(row: JobIncome) -> float:
    base = float(row.base_pay or 0)
    frequency = row.pay_frequency
    if frequency == IncomePayFrequency.monthly:
        return base * 12
    if frequency == IncomePayFrequency.semimonthly:
        return base * 24
    if frequency == IncomePayFrequency.biweekly:
        return base * 26
    if frequency == IncomePayFrequency.weekly:
        return base * 52
    if frequency == IncomePayFrequency.hourly:
        return base * float(row.hours_per_week or 0) * 52
    return base


def annual_income_gross(row: JobIncome) -> float:
    return round(
        annual_base_pay(row)
        + float(row.annual_bonus or 0)
        + float(row.annual_equity or 0)
        + float(row.annual_other or 0),
        2,
    )


def income_period_adjustments(row: JobIncome) -> tuple[float, float]:
    periods = periods_per_year(row.pay_frequency)
    taxes = float(row.taxes_per_period or 0)
    deductions = float(row.deductions_per_period or 0)
    if taxes == 0 and float(row.annual_taxes or 0) > 0:
        taxes = float(row.annual_taxes or 0) / periods
    if deductions == 0 and float(row.annual_deductions or 0) > 0:
        deductions = float(row.annual_deductions or 0) / periods
    return round(taxes, 2), round(deductions, 2)


def income_summary(row: JobIncome) -> dict[str, float]:
    periods = periods_per_year(row.pay_frequency)
    annual_gross = annual_income_gross(row)
    period_gross = annual_gross / periods if periods else annual_gross
    taxes_per_period, deductions_per_period = income_period_adjustments(row)
    annual_taxes = taxes_per_period * periods
    annual_deductions = deductions_per_period * periods
    annual_net = max(annual_gross - annual_taxes - annual_deductions, 0)
    return {
        "pay_periods_per_year": periods,
        "annual_base_pay": round(annual_base_pay(row), 2),
        "annual_gross": round(annual_gross, 2),
        "monthly_gross": round(annual_gross / 12, 2),
        "period_gross": round(period_gross, 2),
        "taxes_per_period": round(taxes_per_period, 2),
        "deductions_per_period": round(deductions_per_period, 2),
        "period_net": round(max(period_gross - taxes_per_period - deductions_per_period, 0), 2),
        "annual_taxes": round(annual_taxes, 2),
        "annual_deductions": round(annual_deductions, 2),
        "annual_net": round(annual_net, 2),
        "monthly_net": round(annual_net / 12, 2),
    }


def annual_recurring_amount(amount: float, frequency: FixedExpenseFrequency | str) -> float:
    value = frequency.value if hasattr(frequency, "value") else str(frequency)
    if value == "annual":
        return amount
    if value == "quarterly":
        return amount * 4
    if value == "biweekly":
        return amount * 26
    if value == "weekly":
        return amount * 52
    return amount * 12


def next_occurrence(start: date, frequency: FixedExpenseFrequency | str, today: date | None = None) -> date:
    today = today or date.today()
    if start >= today:
        return start
    cursor = start
    value = frequency.value if hasattr(frequency, "value") else str(frequency)
    while cursor < today:
        if value == "weekly":
            cursor += timedelta(days=7)
        elif value == "biweekly":
            cursor += timedelta(days=14)
        elif value == "quarterly":
            cursor = _add_months(cursor, 3)
        elif value == "annual":
            cursor = _add_months(cursor, 12)
        else:
            cursor = _add_months(cursor, 1)
    return cursor


def occurrences_between(
    start: date,
    frequency: FixedExpenseFrequency | str,
    range_start: date,
    range_end: date,
    end_date: date | None = None,
) -> list[date]:
    if range_end < range_start:
        return []
    cursor = next_occurrence(start, frequency, range_start)
    out: list[date] = []
    while cursor <= range_end and (end_date is None or cursor <= end_date):
        out.append(cursor)
        value = frequency.value if hasattr(frequency, "value") else str(frequency)
        if value == "weekly":
            cursor += timedelta(days=7)
        elif value == "biweekly":
            cursor += timedelta(days=14)
        elif value == "quarterly":
            cursor = _add_months(cursor, 3)
        elif value == "annual":
            cursor = _add_months(cursor, 12)
        else:
            cursor = _add_months(cursor, 1)
    return out


@dataclass(frozen=True)
class CashflowSummary:
    start_date: date
    end_date: date
    transaction_income: float
    transaction_expenses: float
    planned_income: float
    fixed_expenses: float
    subscriptions: float
    total_income: float
    total_expenses: float
    net_cashflow: float
    savings_rate: float | None
    average_daily_spend: float
    fixed_occurrences: list[dict]
    subscription_occurrences: list[dict]


def build_cashflow_summary(db: Session, user_id: int, start: date, end: date) -> CashflowSummary:
    txs = (
        db.query(Transaction)
        .filter(Transaction.user_id == user_id, Transaction.date >= start, Transaction.date <= end)
        .all()
    )
    transaction_income = round(sum(float(t.amount or 0) for t in txs if t.type == TransactionType.income), 2)
    transaction_expenses = round(sum(float(t.amount or 0) for t in txs if t.type == TransactionType.expense), 2)

    planned_income = 0.0
    for income in db.query(JobIncome).filter(JobIncome.user_id == user_id, JobIncome.is_active.is_(True)).all():
        if income.effective_date > end:
            continue
        active_start = max(start, income.effective_date)
        days = max((end - active_start).days + 1, 0)
        planned_income += income_summary(income)["annual_net"] * days / 365.25

    fixed_total = 0.0
    fixed_events: list[dict] = []
    for expense in db.query(FixedExpense).filter(FixedExpense.user_id == user_id, FixedExpense.is_active.is_(True)).all():
        dates = occurrences_between(expense.start_date, expense.frequency, start, end, expense.end_date)
        fixed_total += float(expense.amount or 0) * len(dates)
        for d in dates:
            fixed_events.append({"date": d, "name": expense.name, "category": expense.category, "amount": round(expense.amount or 0, 2)})

    subscription_total = 0.0
    subscription_events: list[dict] = []
    for sub in db.query(Subscription).filter(Subscription.user_id == user_id, Subscription.is_active.is_(True)).all():
        dates = occurrences_between(sub.next_bill_date, sub.frequency, start, end, sub.end_date)
        subscription_total += float(sub.amount or 0) * len(dates)
        for d in dates:
            subscription_events.append({"date": d, "name": sub.name, "category": sub.category, "amount": round(sub.amount or 0, 2)})

    planned_income = round(planned_income, 2)
    fixed_total = round(fixed_total, 2)
    subscription_total = round(subscription_total, 2)
    total_income = round(transaction_income + planned_income, 2)
    total_expenses = round(transaction_expenses + fixed_total + subscription_total, 2)
    net_cashflow = round(total_income - total_expenses, 2)
    days = max((end - start).days + 1, 1)
    return CashflowSummary(
        start_date=start,
        end_date=end,
        transaction_income=transaction_income,
        transaction_expenses=transaction_expenses,
        planned_income=planned_income,
        fixed_expenses=fixed_total,
        subscriptions=subscription_total,
        total_income=total_income,
        total_expenses=total_expenses,
        net_cashflow=net_cashflow,
        savings_rate=round((net_cashflow / total_income) * 100, 2) if total_income > 0 else None,
        average_daily_spend=round(total_expenses / days, 2),
        fixed_occurrences=sorted(fixed_events, key=lambda x: x["date"]),
        subscription_occurrences=sorted(subscription_events, key=lambda x: x["date"]),
    )


def _add_months(d: date, months: int) -> date:
    month_index = d.month - 1 + months
    year = d.year + month_index // 12
    month = month_index % 12 + 1
    day = min(d.day, monthrange(year, month)[1])
    return date(year, month, day)
