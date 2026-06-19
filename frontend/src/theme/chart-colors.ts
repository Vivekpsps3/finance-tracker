/**
 * Chart.js palette aligned with design tokens (--chart-* / tailwind chart.*).
 */
export const CHART_COLORS = [
  '#3b82f6',
  '#22c55e',
  '#ef4444',
  '#f59e0b',
  '#8b5cf6',
  '#ec4899',
] as const;

export function chartColorAt(index: number): string {
  return CHART_COLORS[index % CHART_COLORS.length];
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