/**
 * Readiness Score Service
 * Computes a 0–100 readiness score and GREEN/YELLOW/RED category
 * from a daily check-in.
 *
 * Category rules (from CLAUDE.md — non-negotiable):
 *   RED:    pain OR (energy <= 2 AND soreness >= 7) OR sleep < 5
 *   YELLOW: energy <= 5 OR soreness >= 7 OR sleep < 6
 *   GREEN:  default
 *
 * SAFETY: pain always forces RED regardless of other inputs.
 */

import type { ReadinessLevel, IntensityLevel, Archetype } from '../types';

export interface CheckinInput {
  energy: number;       // 1–10
  soreness: number;     // 1–10
  sleepHours: number;   // 4–12
  mood: number;         // 1–10
  effort: number;       // 1–10 (yesterday's effort)
  pain: boolean;
}

export interface ReadinessResult {
  score: number;        // 0–100
  level: ReadinessLevel;
}

/** Clamp a number between min and max. */
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Weights for the composite score.
 * Energy and soreness are the strongest signals.
 * Sleep is critical for recovery.
 * Mood is a secondary mental-readiness factor.
 * Yesterday's effort indicates residual fatigue.
 */
const WEIGHTS = {
  energy:   0.30,
  soreness: 0.25,
  sleep:    0.25,
  mood:     0.10,
  effort:   0.10,
} as const;

/**
 * Determine readiness category using the exact rules
 * from CLAUDE.md and the backend readinessCalculator.
 * Category is the decision driver — safety-first.
 */
function getLevel(
  energy: number,
  soreness: number,
  sleepHours: number,
  pain: boolean,
): ReadinessLevel {
  // SAFETY: Pain always = RED (non-negotiable)
  if (pain) return 'RED';

  // RED: extreme exhaustion
  if (energy <= 2 && soreness >= 7) return 'RED';

  // RED: critical sleep deprivation
  if (sleepHours < 5) return 'RED';

  // YELLOW: any single moderate concern
  if (energy <= 5 || soreness >= 7 || sleepHours < 6) return 'YELLOW';

  // GREEN: no concerning flags
  return 'GREEN';
}

/**
 * Compute a 0–100 readiness score from check-in data.
 *
 * Each input is normalized to 0–1 (higher = more ready), then
 * combined via weighted sum. Pain hard-caps the score at 0.
 *
 * The score is informational context within its category band:
 *   RED    → score capped at 33
 *   YELLOW → score capped at 66
 *   GREEN  → score floored at 34
 * This ensures the numeric value never contradicts the category.
 */
export function getReadinessScore(input: CheckinInput): ReadinessResult {
  const { energy, soreness, sleepHours, mood, effort, pain } = input;

  const level = getLevel(energy, soreness, sleepHours, pain);

  // Pain → hard zero
  if (pain) {
    return { score: 0, level };
  }

  // Normalize each factor to 0–1 (higher = more ready)
  const energyNorm   = clamp((energy - 1) / 9, 0, 1);
  const sorenessNorm = clamp((10 - soreness) / 9, 0, 1);     // inverted
  const sleepNorm    = clamp((sleepHours - 4) / 4, 0, 1);    // 4h→0, 8h+→1
  const moodNorm     = clamp((mood - 1) / 9, 0, 1);
  const effortNorm   = clamp((10 - effort) / 9, 0, 1);       // inverted: high effort yesterday = less ready

  const raw =
    energyNorm   * WEIGHTS.energy +
    sorenessNorm * WEIGHTS.soreness +
    sleepNorm    * WEIGHTS.sleep +
    moodNorm     * WEIGHTS.mood +
    effortNorm   * WEIGHTS.effort;

  let score = Math.round(raw * 100);

  // Align score band with category so they never contradict
  if (level === 'RED') {
    score = clamp(score, 0, 33);
  } else if (level === 'YELLOW') {
    score = clamp(score, 1, 66);
  } else {
    score = clamp(score, 34, 100);
  }

  return { score, level };
}

// ---------------------------------------------------------------------------
// Readiness message copy
// ---------------------------------------------------------------------------

/**
 * Archetype-aware feedback copy (max 10 words per message).
 * Tone rules:
 *   Phoenix — self-renewal, smart pacing
 *   Titan   — solid, patient force
 *   Blade   — sharp, precise, minimalist
 *   Surge   — dynamic, emotional, explosive
 * Neutral fallback when archetype is absent.
 */
const MESSAGES: Record<ReadinessLevel, Record<Archetype | 'neutral', string>> = {
  GREEN: {
    phoenix: 'Your rhythm is strong. Go for it, Phoenix.',
    titan: 'Push with purpose, Titan.',
    blade: 'Sharp and ready. Execute, Blade.',
    surge: 'Let it rip, Surge!',
    neutral: "You're ready. Full session today.",
  },
  YELLOW: {
    phoenix: 'Pace yourself today, Phoenix.',
    titan: 'Steady day. Save the heavy lift, Titan.',
    blade: 'Stay sharp. Light effort today.',
    surge: 'Save the burst. Light day, Surge.',
    neutral: 'Light session recommended today.',
  },
  RED: {
    phoenix: 'Recovery is your power, Phoenix.',
    titan: 'Even Titans recharge. Rest today.',
    blade: 'Stand down and recover, Blade.',
    surge: 'Recharge that energy. Rest today, Surge.',
    neutral: 'Recovery mode today.',
  },
};

/**
 * Return a short feedback message based on readiness category
 * and optional archetype. Falls back to neutral copy when
 * archetype is null, undefined, or unrecognized.
 */
export function getReadinessMessage(
  category: ReadinessLevel,
  archetype?: Archetype | string | null,
): string {
  const validArchetypes: Archetype[] = ['phoenix', 'titan', 'blade', 'surge'];
  const normalized = archetype?.toLowerCase() as Archetype | undefined;
  const key = normalized && validArchetypes.includes(normalized) ? normalized : 'neutral';
  return MESSAGES[category][key];
}

// ---------------------------------------------------------------------------
// Compliance outcome
// ---------------------------------------------------------------------------

/** Point values — mirrors backend POINTS_V1 in complianceV1.js. */
const POINTS = {
  CHECKIN_BASE:    5,
  REST_ON_RED:    15,
  REST_ON_FORCED: 10,
  LIGHT_ON_YELLOW: 5,
  GREEN_WORKOUT:   5,
} as const;

export interface ComplianceInput {
  readiness: ReadinessLevel;
  intensity: IntensityLevel;
  daysSinceRest: number;
}

export interface ComplianceOutcome {
  compliant: boolean;
  pointsAwarded: number;
  reason: string;
}

/**
 * Determine compliance and compute points for a check-in decision.
 * Pure function — no side effects.
 *
 * Rules (mirrors backend complianceV1.evaluateCheckin):
 *   - Every check-in earns CHECKIN_BASE (5 pts).
 *   - RED + rest → compliant, +15 bonus.
 *   - RED + any non-rest → non-compliant, base only.
 *   - YELLOW + light/rest → compliant, +5 bonus.
 *   - YELLOW + moderate/hard → compliant, base only.
 *   - GREEN + any non-rest → compliant, +5 bonus.
 *   - GREEN + rest → compliant, base only.
 *   - daysSinceRest >= 6 + rest → +10 forced-rest bonus (stacks).
 */
export function getComplianceOutcome(input: ComplianceInput): ComplianceOutcome {
  const { readiness, intensity, daysSinceRest } = input;

  let points = POINTS.CHECKIN_BASE;
  const reasons: string[] = ['Daily check-in'];
  let compliant = true;

  // SAFETY: RED → must rest
  if (readiness === 'RED') {
    if (intensity === 'REST') {
      points += POINTS.REST_ON_RED;
      reasons.push('Rested on RED day');
    } else {
      compliant = false;
    }
  }

  // Forced rest after 6+ consecutive training days
  if (daysSinceRest >= 6 && intensity === 'REST') {
    points += POINTS.REST_ON_FORCED;
    reasons.push('Recovery after 6+ training days');
  }

  // YELLOW guidance followed
  if (readiness === 'YELLOW' && (intensity === 'LIGHT' || intensity === 'REST')) {
    points += POINTS.LIGHT_ON_YELLOW;
    reasons.push('Followed YELLOW guidance');
  }

  // GREEN workout completed
  if (readiness === 'GREEN' && intensity !== 'REST') {
    points += POINTS.GREEN_WORKOUT;
    reasons.push('GREEN workout completed');
  }

  return {
    compliant,
    pointsAwarded: points,
    reason: reasons.join('; '),
  };
}
