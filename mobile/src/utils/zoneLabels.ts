/**
 * Athlete-facing zone vocabulary (April 2026).
 *
 * Replaces raw "P99 · Elite" pills with a 5-tier coach-voice vocabulary
 * so young athletes read their result in terms of development stage
 * rather than rank-vs-peers. Percentiles carry false precision (stored
 * SDs are ±15% uncertain, see backend migration 080) and push users
 * into a competitive rank framing instead of their own trajectory —
 * which is the opposite of Tomo's thesis.
 *
 * Thresholds intentionally MATCH the backend `getPercentileZone` at
 * football_benchmark_seed.ts (90/75/40/20). Prior mobile thresholds
 * (50/25) diverged from the backend, causing inconsistent labels on
 * mid-range metrics. Single source of truth now: this file.
 *
 * Admin / CMS surfaces still show the raw percentile + numeric zone —
 * this module is athlete-facing only.
 */

import { colors } from '../theme/colors';

export type AthleteZoneKey =
  | 'elite'
  | 'advanced'
  | 'on_track'
  | 'building'
  | 'foundation';

export interface AthleteZoneInfo {
  key: AthleteZoneKey;
  /** Full label for the pill ("Elite", "Foundation Phase"). */
  label: string;
  /** Truncated label for tight spaces like progress-bar dividers. */
  shortLabel: string;
  /** Theme color for the badge and progress-fill. */
  color: string;
  /** Lower bound (inclusive) of the percentile range — use for comparisons. */
  minPercentile: number;
}

export const ATHLETE_ZONES: Record<AthleteZoneKey, AthleteZoneInfo> = {
  elite: {
    key: 'elite',
    label: 'Elite',
    shortLabel: 'Elite',
    color: colors.accentDark,
    minPercentile: 90,
  },
  advanced: {
    key: 'advanced',
    label: 'Advanced',
    shortLabel: 'Advanced',
    color: colors.accent,
    minPercentile: 75,
  },
  on_track: {
    key: 'on_track',
    label: 'On Track',
    shortLabel: 'On Track',
    color: colors.info,
    minPercentile: 40,
  },
  building: {
    key: 'building',
    label: 'Building',
    shortLabel: 'Building',
    color: colors.warning,
    minPercentile: 20,
  },
  foundation: {
    key: 'foundation',
    label: 'Foundation Phase',
    shortLabel: 'Foundation',
    color: colors.accent1,
    minPercentile: 0,
  },
};

/**
 * The 5 zones in ascending order of the threshold — useful for rendering
 * progress-bar dividers (p10 → p90).
 */
export const ATHLETE_ZONES_ORDERED: AthleteZoneInfo[] = [
  ATHLETE_ZONES.foundation,
  ATHLETE_ZONES.building,
  ATHLETE_ZONES.on_track,
  ATHLETE_ZONES.advanced,
  ATHLETE_ZONES.elite,
];

/** Return the zone info for a given percentile, or null when no data. */
export function getAthleteZone(
  percentile: number | null | undefined
): AthleteZoneInfo | null {
  if (percentile == null || !Number.isFinite(percentile)) return null;
  if (percentile >= 90) return ATHLETE_ZONES.elite;
  if (percentile >= 75) return ATHLETE_ZONES.advanced;
  if (percentile >= 40) return ATHLETE_ZONES.on_track;
  if (percentile >= 20) return ATHLETE_ZONES.building;
  return ATHLETE_ZONES.foundation;
}

/** Shorthand for the label string (or empty when no data). */
export function getAthleteZoneLabel(
  percentile: number | null | undefined
): string {
  return getAthleteZone(percentile)?.label ?? '';
}

/** Shorthand for the short label (for tight UI like bar dividers). */
export function getAthleteZoneShortLabel(
  percentile: number | null | undefined
): string {
  return getAthleteZone(percentile)?.shortLabel ?? '';
}

/** Shorthand for the badge color. */
export function getAthleteZoneColor(
  percentile: number | null | undefined
): string {
  return getAthleteZone(percentile)?.color ?? colors.textDisabled;
}

/**
 * Trend modifier shown as a tiny line under the tier label. Returns null
 * when there isn't enough signal (missing data, or delta below 1 point
 * which is within single-test noise).
 *
 *   improvementPct > +1  →  "improving"
 *   improvementPct < -1  →  "regressing"
 *   else                 →  "steady"
 *
 * For lower_better metrics the caller should pre-invert so that negative
 * delta = improvement.
 */
export function getAthleteTrendModifier(
  improvementPct: number | null | undefined
): 'improving' | 'steady' | 'regressing' | null {
  if (improvementPct == null || !Number.isFinite(improvementPct)) return null;
  if (improvementPct > 1) return 'improving';
  if (improvementPct < -1) return 'regressing';
  return 'steady';
}
