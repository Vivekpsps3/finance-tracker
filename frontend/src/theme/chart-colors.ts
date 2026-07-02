/**
 * Chart.js palette from design tokens (--chart-1 … --chart-6 in theme/tokens.css).
 */
const CHART_VAR_NAMES = [
  '--chart-1',
  '--chart-2',
  '--chart-3',
  '--chart-4',
  '--chart-5',
  '--chart-6',
] as const;

const CHART_FALLBACKS = [
  '#3b82f6',
  '#22c55e',
  '#ef4444',
  '#f59e0b',
  '#8b5cf6',
  '#ec4899',
] as const;

export function chartPalette(): string[] {
  return CHART_VAR_NAMES.map((name, i) => cssVar(name, CHART_FALLBACKS[i]));
}

/** @deprecated Prefer chartColorAt() — reads CSS variables at runtime */
export function CHART_COLORS(): readonly string[] {
  return chartPalette();
}

export function chartColorAt(index: number): string {
  const palette = chartPalette();
  return palette[index % palette.length];
}

function cssVar(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

export function chartTextMuted(): string {
  return cssVar('--text-secondary', '#b8b8b8');
}

export function chartAccentColor(): string {
  return cssVar('--accent', '#3b82f6');
}

export function chartSuccessColor(): string {
  return cssVar('--success', '#22c55e');
}

export function chartDangerColor(): string {
  return cssVar('--danger', '#ef4444');
}

export function chartGridColor(): string {
  return cssVar('--border', '#333333');
}

export function chartTooltipTheme() {
  return {
    backgroundColor: cssVar('--card-bg', '#1a1a1a'),
    borderColor: cssVar('--border', '#333333'),
    borderWidth: 1,
    titleColor: cssVar('--text', '#f5f5f5'),
    bodyColor: cssVar('--text', '#f5f5f5'),
    padding: 10,
    cornerRadius: 8,
  };
}

export function chartLegendBottom() {
  return {
    position: 'bottom' as const,
    labels: {
      color: chartTextMuted(),
      padding: 14,
      usePointStyle: true,
    },
  };
}

export function chartCartesianScales() {
  const tick = chartTextMuted();
  const grid = chartGridColor();
  return {
    y: {
      ticks: { color: tick },
      grid: { color: grid },
      border: { color: grid },
    },
    x: {
      ticks: {
        color: tick,
        maxRotation: 45,
        autoSkip: true,
        maxTicksLimit: 12,
      },
      grid: { color: grid },
      border: { color: grid },
    },
  };
}