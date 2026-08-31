/** Locale-aware money helpers. Uses runtime locale unless overridden. */

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
