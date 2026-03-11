/**
 * Tomo Football Calculation Engine
 * All formulas backed by the Tomo Football Performance & Readiness Research.
 *
 * Research basis:
 * - ACWR sweet spot 0.80-1.30 (Bowen et al., 2020)
 * - Sleep <=8h = 1.7x injury risk (PMC, 2023)
 * - Post-match recovery: 48h min, 72h optimal for youth (PMC, 2025)
 * - Subjective wellness MORE sensitive than HR-derived indices (PMC, 2020)
 * - Overtraining affects 35% of youth athletes (AAP, 2024)
 */

import type {
  FootballAttribute,
  FootballPosition,
  FootballRatingLevel,
} from '../types/football';
import {
  FOOTBALL_ATTRIBUTE_ORDER,
  FOOTBALL_ATTRIBUTE_CONFIG,
  FOOTBALL_POSITION_WEIGHTS,
  FOOTBALL_RATING_LEVELS,
} from '../types/football';

// ═══ NORMATIVE DATA ═══
// Age-group norms for the 0-99 attribute score space.
// Derived from research Sections 6.1-6.6 and Tomo Football Metrics Database.
// mean = expected average score for that age group; sd = spread.
// Younger players have lower means because their physical baselines are lower.

interface AgeNorm {
  ageMin: number;
  ageMax: number;
  mean: number;
  sd: number;
}

/**
 * Normative data per attribute, indexed by age group.
 * Values derived from:
 * - PAC: Sprint norms (Research Section 6.1) — 30m sprint improves ~15% from U14 to senior
 * - SHO: Shot power/distance norms — kick velocity increases with leg strength maturation
 * - PAS: Pass distance/accuracy norms — follows power maturation curve
 * - DRI: Agility norms (Research Section 6.3) — neural, peaks earlier than power
 * - DEF: Jump + strength norms (Research Sections 6.2, 6.6) — follows power curve
 * - PHY: Yo-Yo IR1, VO2max, CMJ norms (Research Sections 6.2, 6.4) — endurance curve
 */
export const FOOTBALL_NORMATIVE_DATA: Record<FootballAttribute, AgeNorm[]> = {
  pace: [
    { ageMin: 13, ageMax: 14, mean: 35, sd: 12 },
    { ageMin: 15, ageMax: 16, mean: 42, sd: 13 },
    { ageMin: 17, ageMax: 18, mean: 50, sd: 14 },
    { ageMin: 19, ageMax: 20, mean: 55, sd: 14 },
    { ageMin: 21, ageMax: 99, mean: 55, sd: 15 },
  ],
  shooting: [
    { ageMin: 13, ageMax: 14, mean: 30, sd: 12 },
    { ageMin: 15, ageMax: 16, mean: 38, sd: 13 },
    { ageMin: 17, ageMax: 18, mean: 47, sd: 14 },
    { ageMin: 19, ageMax: 20, mean: 52, sd: 14 },
    { ageMin: 21, ageMax: 99, mean: 55, sd: 15 },
  ],
  passing: [
    { ageMin: 13, ageMax: 14, mean: 33, sd: 12 },
    { ageMin: 15, ageMax: 16, mean: 40, sd: 13 },
    { ageMin: 17, ageMax: 18, mean: 48, sd: 14 },
    { ageMin: 19, ageMax: 20, mean: 53, sd: 14 },
    { ageMin: 21, ageMax: 99, mean: 55, sd: 15 },
  ],
  dribbling: [
    { ageMin: 13, ageMax: 14, mean: 38, sd: 12 },
    { ageMin: 15, ageMax: 16, mean: 45, sd: 13 },
    { ageMin: 17, ageMax: 18, mean: 52, sd: 14 },
    { ageMin: 19, ageMax: 20, mean: 55, sd: 14 },
    { ageMin: 21, ageMax: 99, mean: 55, sd: 15 },
  ],
  defending: [
    { ageMin: 13, ageMax: 14, mean: 32, sd: 12 },
    { ageMin: 15, ageMax: 16, mean: 40, sd: 13 },
    { ageMin: 17, ageMax: 18, mean: 48, sd: 14 },
    { ageMin: 19, ageMax: 20, mean: 53, sd: 14 },
    { ageMin: 21, ageMax: 99, mean: 55, sd: 15 },
  ],
  physicality: [
    { ageMin: 13, ageMax: 14, mean: 30, sd: 12 },
    { ageMin: 15, ageMax: 16, mean: 38, sd: 13 },
    { ageMin: 17, ageMax: 18, mean: 47, sd: 14 },
    { ageMin: 19, ageMax: 20, mean: 53, sd: 14 },
    { ageMin: 21, ageMax: 99, mean: 55, sd: 15 },
  ],
};

// ═══ ATTRIBUTE COLORS ═══

export const FOOTBALL_ATTRIBUTE_COLORS: Record<FootballAttribute, string> = {
  pace: '#3498DB',
  shooting: '#2ECC71',
  passing: '#2ECC71',
  dribbling: '#3498DB',
  defending: '#7B61FF',
  physicality: '#E74C3C',
};

// ═══ INTERNAL HELPERS ═══

/**
 * Clamp a value between min and max.
 */
function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Standard normal CDF approximation (Abramowitz & Stegun).
 * Maximum error: 1.5e-7.
 */
function normalCDF(z: number): number {
  if (z < -6) return 0;
  if (z > 6) return 1;
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return 0.5 * (1.0 + sign * y);
}

/**
 * Find the age-norm entry for a given attribute and age.
 * Falls back to the nearest age bracket if out of range.
 */
function findAgeNorm(attribute: FootballAttribute, age: number): AgeNorm {
  const norms = FOOTBALL_NORMATIVE_DATA[attribute];
  const clamped = clamp(age, 13, 99);
  for (const norm of norms) {
    if (clamped >= norm.ageMin && clamped <= norm.ageMax) {
      return norm;
    }
  }
  // Fallback: return last bracket (senior)
  return norms[norms.length - 1];
}

// ═══ DNA ATTRIBUTE CALCULATION ═══

/**
 * Calculate a single football attribute score from its 7 sub-attribute scores.
 * Uses weighted average with weights from the Tomo Football Metrics Database.
 *
 * @param attribute - Which of the 6 DNA attributes
 * @param subAttributeScores - Array of 7 scores (0-99 each), in the same order
 *   as FOOTBALL_ATTRIBUTE_CONFIG[attribute].subAttributes
 * @returns Weighted average, rounded and clamped to 0-99
 *
 * Research basis: Sub-attribute weights reflect the relative importance of each
 * physical test to overall attribute performance (Research Section 14.1).
 */
export function calculateFootballAttribute(
  attribute: FootballAttribute,
  subAttributeScores: number[],
): number {
  const config = FOOTBALL_ATTRIBUTE_CONFIG[attribute];
  const weights = config.subAttributes.map(sa => sa.weight);
  let sum = 0;
  for (let i = 0; i < weights.length; i++) {
    sum += (subAttributeScores[i] || 0) * weights[i];
  }
  return clamp(Math.round(sum), 0, 99);
}

// ═══ OVERALL RATING ═══

/**
 * Calculate overall rating from 6 attribute scores, weighted by position.
 * Uses position-specific weights from Research Section 14.2.
 *
 * @param attributes - Record of 6 attribute scores (0-99 each)
 * @param position - Player's primary position
 * @returns Position-weighted overall, rounded and clamped to 0-99
 *
 * Research basis: Position weights reflect the physical demands profile
 * of each role. A CB values DEF+PHY (0.35 each), while a WM values
 * DRI (0.25) and PAC (0.20) (Research Section 14.2, Table 14.2).
 */
export function calculateOverallRating(
  attributes: Record<FootballAttribute, number>,
  position: FootballPosition,
): number {
  const weights = FOOTBALL_POSITION_WEIGHTS[position];
  let sum = 0;
  for (const attr of FOOTBALL_ATTRIBUTE_ORDER) {
    sum += (attributes[attr] || 0) * weights[attr];
  }
  return clamp(Math.round(sum), 0, 99);
}

// ═══ PATHWAY RATING (0-1000) ═══

/**
 * Map a 0-99 overall rating to the 0-1000 pathway scale.
 * Incorporates age potential, experience, and competition level.
 *
 * @param overallRating - 0-99 attribute-based overall
 * @param age - Player's age in years
 * @param experience - Self-reported experience tier
 * @param competitionLevel - Highest level of regular competition
 * @returns Pathway rating, clamped 0-1000
 *
 * Research basis: Youth athletes show 15-25% physical improvement per year
 * during maturation (Research Section 5). Younger players with high scores
 * indicate greater potential ceiling, hence the age bonus.
 */
export function calculatePathwayRating(
  overallRating: number,
  age: number,
  experience: 'beginner' | 'intermediate' | 'advanced' | 'elite',
  competitionLevel: 'recreational' | 'club' | 'academy' | 'professional',
): number {
  // Base: 0-99 maps to 0-990
  const base = overallRating * 10;

  // Age adjustment: younger players get a potential bonus
  let ageMod = 0;
  if (age < 16) ageMod = 25;
  else if (age < 18) ageMod = 15;
  else if (age < 21) ageMod = 5;

  // Experience modifier
  const expModMap: Record<string, number> = {
    beginner: -20,
    intermediate: 0,
    advanced: 15,
    elite: 25,
  };
  const expMod = expModMap[experience] ?? 0;

  // Competition level bonus
  const compModMap: Record<string, number> = {
    recreational: 0,
    club: 10,
    academy: 25,
    professional: 40,
  };
  const compMod = compModMap[competitionLevel] ?? 0;

  return clamp(Math.round(base + ageMod + expMod + compMod), 0, 1000);
}

// ═══ RATING LEVEL ═══

/**
 * Map a 0-1000 pathway rating to one of 10 named levels.
 *
 * @param pathwayRating - 0-1000 rating
 * @returns The matching FootballRatingLevel
 *
 * Levels: Newcomer (0-199), Beginner (200-349), Park Player (350-449),
 * Sunday League (450-549), Club Player (550-649), Academy Elite (650-749),
 * Semi-Pro (750-849), Professional (850-929), World Class (930-979),
 * Legend (980-1000).
 */
export function getFootballRatingLevel(pathwayRating: number): FootballRatingLevel {
  const clamped = clamp(pathwayRating, 0, 1000);
  for (const level of FOOTBALL_RATING_LEVELS) {
    if (clamped >= level.minRating && clamped <= level.maxRating) {
      return level;
    }
  }
  // Fallback (should never reach)
  return FOOTBALL_RATING_LEVELS[0];
}

// ═══ SKILL RATING ═══

/**
 * Calculate a skill's overall rating from its 3 sub-metrics.
 * Simple average, as each sub-metric is equally important within a skill.
 *
 * @param subMetrics - Array of 3 scores (0-99 each)
 * @returns Average, rounded and clamped to 0-99
 */
export function calculateSkillRating(subMetrics: number[]): number {
  if (subMetrics.length === 0) return 0;
  const sum = subMetrics.reduce((a, b) => a + b, 0);
  return clamp(Math.round(sum / subMetrics.length), 0, 99);
}

// ═══ PERCENTILE ═══

/**
 * Calculate the age-relative percentile for an attribute score.
 * Uses normative data derived from Research Sections 6.1-6.6.
 *
 * For scored attributes (0-99 scale), maps through a normal distribution
 * with age-specific mean and SD from the FOOTBALL_NORMATIVE_DATA table.
 *
 * @param attribute - Which DNA attribute
 * @param value - The 0-99 attribute score
 * @param age - Player's age in years
 * @param _position - Reserved for position-adjusted norms (future)
 * @returns 0-100 percentile within the age group
 *
 * Research basis: Physical capacity norms by age (Research Sections 6.1-6.6).
 * Sprint performance improves ~15% from U14 to senior (Section 6.1).
 * CMJ increases ~50% from U14 to senior (Section 6.2).
 * Yo-Yo IR1 doubles from U14 to senior (Section 6.4).
 */
export function getAttributePercentile(
  attribute: FootballAttribute,
  value: number,
  age: number,
  _position: FootballPosition,
): number {
  const norm = findAgeNorm(attribute, age);
  const z = (value - norm.mean) / norm.sd;
  const percentile = normalCDF(z) * 100;
  return clamp(Math.round(percentile), 0, 100);
}

// ═══ READINESS RECOMMENDATION ═══

interface ReadinessRecommendation {
  intensity: string;
  description: string;
  researchBasis: string;
}

/**
 * Generate a training intensity recommendation based on readiness signals.
 * Follows Tomo's safety-first readiness logic (CLAUDE.md).
 *
 * Priority order (most restrictive wins):
 * 1. Pain -> rest (ALWAYS, non-negotiable)
 * 2. daysSinceRest >= 6 -> rest
 * 3. RED readiness -> rest
 * 4. YELLOW readiness -> light
 * 5. yesterdayEffort >= 8 -> light
 * 6. GREEN + moderate yesterday (effort >= 5) -> moderate
 * 7. GREEN + easy yesterday (effort < 5) -> hard
 *
 * @param readinessColor - Current readiness status
 * @param daysSinceRest - Consecutive training days without rest
 * @param painFlag - Whether the athlete reported any pain
 * @param yesterdayEffort - Yesterday's training effort (0-10 RPE)
 * @returns Intensity recommendation with research citation
 *
 * Research basis:
 * - ACWR sweet spot 0.80-1.30 (Bowen et al., 2020)
 * - Sleep <=8h = 1.7x injury risk (PMC, 2023)
 * - Post-match recovery: 48h min, 72h optimal for youth (PMC, 2025)
 * - Subjective wellness MORE sensitive than HR indices (PMC, 2020)
 * - Overtraining affects 35% of youth athletes (AAP, 2024)
 */
export function getReadinessRecommendation(
  readinessColor: 'GREEN' | 'YELLOW' | 'RED',
  daysSinceRest: number,
  painFlag: boolean,
  yesterdayEffort: number,
): ReadinessRecommendation {
  // 1. Pain — ALWAYS rest (non-negotiable safety rule)
  if (painFlag) {
    return {
      intensity: 'rest',
      description: 'Pain reported — complete rest recommended. Do not train through pain.',
      researchBasis: 'Pain signals tissue stress requiring recovery; training through pain risks chronic injury (AAP, 2024). This is not medical advice.',
    };
  }

  // 2. Overtraining guard — 6+ consecutive days
  if (daysSinceRest >= 6) {
    return {
      intensity: 'rest',
      description: 'You have trained 6+ days without rest. Take a recovery day.',
      researchBasis: 'Overtraining affects 35% of youth athletes; scheduled rest prevents overuse syndrome (AAP, 2024). ACWR spikes above 1.5 correlate with injury (Bowen et al., 2020).',
    };
  }

  // 3. RED readiness — rest
  if (readinessColor === 'RED') {
    return {
      intensity: 'rest',
      description: 'Red readiness detected — rest and recover today.',
      researchBasis: 'Sleep <5h increases injury risk by 1.7x (PMC, 2023). Subjective wellness is more sensitive than HR-derived indices for detecting fatigue (PMC, 2020).',
    };
  }

  // 4. YELLOW readiness — light
  if (readinessColor === 'YELLOW') {
    return {
      intensity: 'light',
      description: 'Yellow readiness — keep it light today. Focus on technique or mobility.',
      researchBasis: 'Maintaining ACWR in 0.80-1.30 sweet spot during fatigue reduces injury risk (Bowen et al., 2020). Light activity supports active recovery (PMC, 2025).',
    };
  }

  // 5. High effort yesterday — light
  if (yesterdayEffort >= 8) {
    return {
      intensity: 'light',
      description: 'High effort yesterday — active recovery recommended.',
      researchBasis: 'Post-match recovery: 48h minimum, 72h optimal for youth athletes (PMC, 2025). Consecutive high-load days spike ACWR above safe zone (Bowen et al., 2020).',
    };
  }

  // 6. GREEN + moderate yesterday — moderate
  if (yesterdayEffort >= 5) {
    return {
      intensity: 'moderate',
      description: 'Good readiness after moderate effort — train at moderate intensity.',
      researchBasis: 'Progressive load within ACWR 0.80-1.30 builds fitness while managing injury risk (Bowen et al., 2020).',
    };
  }

  // 7. GREEN + easy yesterday — hard
  return {
    intensity: 'hard',
    description: 'Fully recovered — you are cleared for high-intensity training.',
    researchBasis: 'Full recovery state supports progressive overload; ACWR guidelines allow high-load days after adequate rest (Bowen et al., 2020).',
  };
}
