/** Locale-aware money/date helpers (PLAT-002). Uses runtime locale unless overridden. */

export function formatMoney(
  value: number | null | undefined,
  currency = 'USD',
  locale?: string
): string {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return '—';
  }
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(Number(value));
}

export function formatCompactMoney(
  value: number | null | undefined,
  currency = 'USD',
  locale?: string
): string {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return '—';
  }
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(Number(value));
}

export function formatDate(isoOrDate: string | Date, locale?: string): string {
  const d = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate;
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(d);
}

export function formatMonthYear(isoOrDate: string | Date, locale?: string): string {
  const d = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate;
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(d);
}
