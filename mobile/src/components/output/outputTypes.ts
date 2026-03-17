/**
 * Output Page — Shared Types & Color Helpers
 */

// ── RAG Status Colors ────────────────────────────────────────────────
export const RAG_COLORS = {
  green: '#30D158',
  amber: '#F39C12',
  red: '#E74C3C',
  none: '#6B6B6B',
} as const;

export const RAG_BG_COLORS = {
  green: 'rgba(48, 209, 88, 0.15)',
  amber: 'rgba(243, 156, 18, 0.15)',
  red: 'rgba(231, 76, 60, 0.15)',
  none: 'rgba(107, 107, 107, 0.10)',
} as const;

export type RagStatus = 'green' | 'amber' | 'red' | 'none';

export function getRagColor(status: RagStatus): string {
  return RAG_COLORS[status];
}

export function getRagBgColor(status: RagStatus): string {
  return RAG_BG_COLORS[status];
}

// ── Zone Colors (Percentile-based) ──────────────────────────────────
export const ZONE_COLORS = {
  elite: '#27AE60',
  good: '#2ECC71',
  average: '#3498DB',
  developing: '#F39C12',
  below: '#E74C3C',
} as const;

export type PercentileZone = 'elite' | 'good' | 'average' | 'developing' | 'below';

export function getZoneFromPercentile(p: number): PercentileZone {
  if (p >= 90) return 'elite';
  if (p >= 75) return 'good';
  if (p >= 50) return 'average';
  if (p >= 25) return 'developing';
  return 'below';
}

export function getZoneColor(p: number): string {
  return ZONE_COLORS[getZoneFromPercentile(p)];
}

export function getZoneLabel(p: number): string {
  if (p >= 90) return 'Elite';
  if (p >= 75) return 'Strong';
  if (p >= 50) return 'Solid';
  if (p >= 25) return 'Developing';
  return 'Focus Area';
}

// ── Group Color Themes ──────────────────────────────────────────────
export const GROUP_THEME_COLORS: Record<string, string> = {
  yellow: '#FFD60A',
  orange: '#FF6B35',
  teal: '#00D9FF',
  blue: '#3498DB',
  red: '#E74C3C',
  green: '#30D158',
  purple: '#A855F7',
  pink: '#FF6B9D',
};

export function getGroupThemeColor(theme: string): string {
  return GROUP_THEME_COLORS[theme] || '#FF6B35';
}

// ── Trend Helpers ───────────────────────────────────────────────────
export function getTrendIcon(trend: 'up' | 'down' | 'stable'): string {
  switch (trend) {
    case 'up': return '↑';
    case 'down': return '↓';
    case 'stable': return '→';
  }
}

export function getTrendColor(trend: 'up' | 'down' | 'stable', higherIsBetter = true): string {
  if (trend === 'stable') return '#B0B0B0';
  const isGood = higherIsBetter ? trend === 'up' : trend === 'down';
  return isGood ? '#30D158' : '#E74C3C';
}
