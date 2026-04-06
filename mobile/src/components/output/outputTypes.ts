import { colors } from '../../theme/colors';
/**
 * Output Page — Shared Types & Color Helpers
 */

// ── RAG Status Colors ────────────────────────────────────────────────
export const RAG_COLORS = {
  green: colors.accent,
  amber: colors.warning,
  red: colors.error,
  none: colors.textDisabled,
} as const;

export const RAG_BG_COLORS = {
  green: colors.accentSoft,
  amber: colors.secondarySubtle,
  red: colors.secondarySubtle,
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
  elite: colors.accentDark,
  good: colors.accent,
  average: colors.info,
  developing: colors.warning,
  below: colors.error,
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
  yellow: colors.warning,
  orange: colors.accent,
  teal: colors.info,
  blue: colors.info,
  red: colors.error,
  green: colors.accent,
  purple: colors.info,
  pink: colors.error,
};

export function getGroupThemeColor(theme: string): string {
  return GROUP_THEME_COLORS[theme] || colors.accent;
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
  if (trend === 'stable') return colors.textSecondary;
  const isGood = higherIsBetter ? trend === 'up' : trend === 'down';
  return isGood ? colors.accent : colors.error;
}

// ── Vital Context Helpers ───────────────────────────────────────────

export const ZONE_BG_COLORS: Record<string, string> = {
  elite: colors.accentSoft,
  good: colors.accentMuted,
  average: colors.accentMuted,
  developing: colors.secondarySubtle,
  below: colors.secondarySubtle,
};

export function getZoneBadgeColor(zone: string | null | undefined): string {
  if (!zone) return colors.textDisabled;
  return ZONE_COLORS[zone as PercentileZone] || colors.textDisabled;
}

export function getZoneBadgeBg(zone: string | null | undefined): string {
  if (!zone) return 'rgba(107, 107, 107, 0.10)';
  return ZONE_BG_COLORS[zone] || 'rgba(107, 107, 107, 0.10)';
}

export function getBaselineText(deviation: number | null | undefined): string {
  if (deviation == null || Math.abs(deviation) < 5) return '';
  const dir = deviation > 0 ? 'above' : 'below';
  return `${Math.abs(Math.round(deviation))}% ${dir} your usual`;
}

export function getStoryStatusColor(status: 'strong' | 'mixed' | 'weak'): string {
  switch (status) {
    case 'strong': return colors.accent;
    case 'mixed': return colors.textSecondary;
    case 'weak': return colors.textSecondary;
  }
}
