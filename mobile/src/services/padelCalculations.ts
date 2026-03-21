/**
 * Tomo Padel Calculation Engine
 * All formulas from the Padel Performance Blueprint.
 */

import type { DNAAttribute, DNATier, ShotType } from '../types/padel';
import { colors } from '../theme/colors';

// ═══ DNA ATTRIBUTE WEIGHTS (for Overall) ═══

export const DNA_OVERALL_WEIGHTS: Record<DNAAttribute, number> = {
  power: 0.15,
  reflexes: 0.18,
  control: 0.25,  // Highest — padel is control-dominant
  stamina: 0.12,
  agility: 0.15,
  tactics: 0.15,
};

// ═══ DNA CALCULATIONS ═══

export function calculateOverallRating(
  attributes: Record<DNAAttribute, number>,
): number {
  let sum = 0;
  for (const attr of Object.keys(DNA_OVERALL_WEIGHTS) as DNAAttribute[]) {
    sum += (attributes[attr] || 0) * DNA_OVERALL_WEIGHTS[attr];
  }
  return Math.round(sum);
}

export function getDNATier(overall: number): DNATier {
  if (overall >= 80) return 'diamond';
  if (overall >= 60) return 'gold';
  if (overall >= 40) return 'silver';
  return 'bronze';
}

export function getTierLabel(tier: DNATier): string {
  switch (tier) {
    case 'diamond': return 'Diamond';
    case 'gold': return 'Gold';
    case 'silver': return 'Silver';
    case 'bronze': return 'Bronze';
  }
}

// ═══ TIER COLORS ═══

export const TIER_COLORS: Record<DNATier, {
  gradient: [string, string];
  border: string;
  text: string;
}> = {
  bronze: {
    gradient: [colors.tierBronze, colors.tierBronzeDark],
    border: colors.tierBronze,
    text: colors.textPrimary,
  },
  silver: {
    gradient: [colors.tierSilver, colors.tierSilverDark],
    border: colors.tierSilver,
    text: colors.textPrimary,
  },
  gold: {
    gradient: [colors.accent, colors.info],
    border: colors.accent,
    text: colors.textPrimary,
  },
  diamond: {
    gradient: [colors.warning, colors.warning],
    border: colors.info,
    text: colors.textPrimary,
  },
};

// ═══ DNA ATTRIBUTE COLORS ═══

export const DNA_ATTRIBUTE_COLORS: Record<DNAAttribute, string> = {
  power: colors.accent,    // orange
  reflexes: colors.warning, // yellow
  control: colors.accent,  // green
  stamina: colors.info,  // cyan
  agility: colors.warning,  // amber
  tactics: colors.info,  // indigo
};

// ═══ SHOT RATING CALCULATIONS ═══

export function calculateShotRating(
  sub1: number,
  sub2: number,
  sub3: number,
): number {
  // Each sub-metric is 1-10, total max = 30
  return Math.round(((sub1 + sub2 + sub3) / 30) * 100);
}

export function rollingWeightedAverage(
  recentSessions: number[],   // last 5
  mediumSessions: number[],   // last 20
  allSessions: number[],      // all-time
): number {
  const avg = (arr: number[]) =>
    arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

  const recent = avg(recentSessions);
  const medium = avg(mediumSessions);
  const all = avg(allSessions);

  // 50% recent, 30% medium, 20% all-time
  if (recentSessions.length === 0) return all;
  if (mediumSessions.length === 0) return recent;
  return Math.round(recent * 0.5 + medium * 0.3 + all * 0.2);
}

export function calculateShotVarietyIndex(
  shots: Record<ShotType, { rating: number }>,
): number {
  const above50 = Object.values(shots).filter(s => s.rating > 50).length;
  return Math.round((above50 / 8) * 100);
}

// ═══ PADEL RATING (0-1000) ═══

export function calculatePadelRating(
  dnaOverall: number,
  experienceYears: number,
  competitionLevel: number,
  consistencyStreak: number,
): number {
  // Base: DNA Overall × 7.5 (maps 0-99 to 0-742)
  const base = dnaOverall * 7.5;

  // Experience modifier: up to 100 points
  const expMod = Math.min(experienceYears * 15, 100);

  // Competition modifier: up to 150 points (self-reported level)
  const compMod = Math.min(competitionLevel, 150);

  // Consistency modifier: up to 8 points
  const consMod = Math.min(consistencyStreak * 0.5, 8);

  return Math.min(Math.round(base + expMod + compMod + consMod), 1000);
}

export function getPadelLevel(rating: number): string {
  if (rating >= 900) return 'Legend';
  if (rating >= 800) return 'World Class';
  if (rating >= 700) return 'Professional';
  if (rating >= 600) return 'Semi-Pro';
  if (rating >= 500) return 'Elite Amateur';
  if (rating >= 400) return 'Advanced';
  if (rating >= 300) return 'Intermediate';
  if (rating >= 200) return 'Developing';
  if (rating >= 100) return 'Beginner';
  return 'Newcomer';
}

export const PADEL_RATING_LEVELS = [
  { range: [900, 1000] as [number, number], name: 'Legend', description: 'Top 10-20 in the world' },
  { range: [800, 899] as [number, number], name: 'World Class', description: 'Top 50 worldwide' },
  { range: [700, 799] as [number, number], name: 'Professional', description: 'Touring professional' },
  { range: [600, 699] as [number, number], name: 'Semi-Pro', description: 'National competitor' },
  { range: [500, 599] as [number, number], name: 'Elite Amateur', description: 'Regional champion' },
  { range: [400, 499] as [number, number], name: 'Advanced', description: 'Strong club player' },
  { range: [300, 399] as [number, number], name: 'Intermediate', description: 'Solid fundamentals' },
  { range: [200, 299] as [number, number], name: 'Developing', description: 'Building consistency' },
  { range: [100, 199] as [number, number], name: 'Beginner', description: 'Learning the game' },
  { range: [0, 99] as [number, number], name: 'Newcomer', description: 'First steps in padel' },
];

// ═══ UTILITY ═══

export function getRatingTier(rating: number): number {
  // Returns 0-4 for 0-200, 200-400, 400-600, 600-800, 800-1000
  if (rating >= 800) return 4;
  if (rating >= 600) return 3;
  if (rating >= 400) return 2;
  if (rating >= 200) return 1;
  return 0;
}

export const RATING_TIER_NAMES = ['Beginner', 'Developing', 'Competitive', 'Advanced', 'Elite'];
export const RATING_TIER_COLORS = [colors.error, colors.warning, colors.warning, colors.accentLight, colors.accent];

export function getShotRatingColor(rating: number): string {
  if (rating >= 70) return colors.accent;  // green
  if (rating >= 50) return colors.warning;  // yellow
  if (rating >= 35) return colors.warning;  // orange
  return colors.info;                     // teal — growth-oriented
}
