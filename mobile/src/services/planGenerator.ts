/**
 * Plan Generator Service
 * Generates sport-specific, readiness-adapted, archetype-tuned daily plans.
 *
 * Recovery-first — RED always means rest-only.
 * SAFETY: Pain should force RED before reaching this function.
 *
 * Structure:
 *   1. EXERCISE_DB — sport + readiness → base exercises
 *   2. ARCHETYPE_EXTRAS — archetype → 1 extra exercise swapped in
 *   3. generatePlan() — assembles DailyPlan from inputs
 *
 * Modular: add sports by extending EXERCISE_DB, add archetypes
 * by extending ARCHETYPE_EXTRAS. Future: remote coach uploads
 * can override EXERCISE_DB entries at runtime.
 */

import type { ReadinessLevel, Archetype } from '../types';
import { getArchetypeProfile } from './archetypeProfile';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PlanSport = 'football' | 'basketball' | 'tennis' | 'padel';

export interface DailyPlan {
  warmup: string[];
  mainSet: string[];
  cooldown: string[];
  disclaimer: string;
  recommendedIntensity: string;
  focusAreas: string[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DISCLAIMER = 'This is not medical advice. Listen to your body.';

const VALID_READINESS: ReadinessLevel[] = ['GREEN', 'YELLOW', 'RED'];
const VALID_SPORTS: PlanSport[] = ['football', 'basketball', 'tennis', 'padel'];

// ---------------------------------------------------------------------------
// Exercise database — sport × readiness → { warmup, mainSet, cooldown }
//
// Each entry is a string array. Strings are short, actionable cues
// that a 13–23-year-old athlete can follow on their phone.
// GREEN = full session, YELLOW = light/technical, RED = recovery only.
// ---------------------------------------------------------------------------

type ReadinessExercises = Record<ReadinessLevel, {
  warmup: string[];
  mainSet: string[];
  cooldown: string[];
}>;

const EXERCISE_DB: Record<PlanSport, ReadinessExercises> = {
  football: {
    GREEN: {
      warmup: [
        '5-min ball touches',
        'High knees (2 min)',
        'Dynamic quad stretch',
      ],
      mainSet: [
        '4x4 MAS runs',
        'Small-sided game (15 min)',
        'Passing drills — short and long',
        'Shooting practice (10 min)',
      ],
      cooldown: [
        '90s quad hold each leg',
        '5-min walk',
        'Hydration and deep breaths',
      ],
    },
    YELLOW: {
      warmup: [
        'Light jog (3 min)',
        'Hip circles (10 each)',
        'Leg swings (10 each)',
      ],
      mainSet: [
        'Low-speed passing drill',
        'First touch practice (10 min)',
        'Stationary ball mastery',
      ],
      cooldown: [
        'Static hamstring stretch',
        'Calf foam roll (2 min each)',
      ],
    },
    RED: {
      warmup: [
        'Gentle walk (5 min)',
        'Breathing exercises',
      ],
      mainSet: [],
      cooldown: [
        'Full-body static stretch (10 min)',
        'Hydrate and rest',
      ],
    },
  },

  basketball: {
    GREEN: {
      warmup: [
        'High knees and butt kicks (3 min)',
        'Dynamic stretching circuit',
        'Ball handling warm-up (3 min)',
      ],
      mainSet: [
        'Spot-up shooting — 5 locations (50 shots)',
        'Layup variations (10 min)',
        'Full-court sprints (6 reps)',
        'Defensive slides (5 min)',
      ],
      cooldown: [
        'Light free throws (10 shots)',
        'Static stretch — quads, hips, shoulders',
        '3-min cool-down walk',
      ],
    },
    YELLOW: {
      warmup: [
        'Light jogging (3 min)',
        'Arm circles and wrist rotations',
        'Light ball handling',
      ],
      mainSet: [
        'Form shooting — close range (30 shots)',
        'Stationary ball handling (10 min)',
        'Free throw practice (20 shots)',
      ],
      cooldown: [
        'Static stretching (5 min)',
        'Ankle and hip mobility',
      ],
    },
    RED: {
      warmup: [
        'Gentle walk (5 min)',
        'Breathing exercises',
      ],
      mainSet: [],
      cooldown: [
        'Full-body static stretch (10 min)',
        'Hydrate and rest',
      ],
    },
  },

  tennis: {
    GREEN: {
      warmup: [
        'Jog with side shuffles (5 min)',
        'Dynamic arm and shoulder stretch',
        'Shadow swings — forehand and backhand',
      ],
      mainSet: [
        'Serve practice with targets (15 min)',
        'Groundstroke rally — game speed (15 min)',
        'Approach and volley drills (10 min)',
        'Point play simulation (15 min)',
      ],
      cooldown: [
        'Light hitting (3 min)',
        'Static stretch — shoulders, forearms, calves',
        'Wrist and forearm release',
      ],
    },
    YELLOW: {
      warmup: [
        'Light jog (3 min)',
        'Shoulder circles',
        'Shadow swings — easy pace',
      ],
      mainSet: [
        'Mini tennis rally (10 min)',
        'Serve technique — focus on form',
        'Forehand consistency drill (10 min)',
      ],
      cooldown: [
        'Wrist release stretch',
        'Foam roll shoulders and calves',
      ],
    },
    RED: {
      warmup: [
        'Gentle walk (5 min)',
        'Breathing exercises',
      ],
      mainSet: [],
      cooldown: [
        'Full-body static stretch (10 min)',
        'Hydrate and rest',
      ],
    },
  },

  padel: {
    GREEN: {
      warmup: [
        'Jogging with direction changes (5 min)',
        'Wrist rotations and arm swings',
        'Wall bounce practice (3 min)',
      ],
      mainSet: [
        'Bandeja and vibora practice (15 min)',
        'Volley drills at the net (10 min)',
        'Serve and return patterns (10 min)',
        'Point simulation (15 min)',
      ],
      cooldown: [
        'Easy hitting (3 min)',
        'Static stretch — wrists, hips, shoulders',
        'Hydration and deep breaths',
      ],
    },
    YELLOW: {
      warmup: [
        'Shoulder circles',
        'Mini volleys (5 min)',
        'Mobility band — shoulders and hips',
      ],
      mainSet: [
        'Low-speed control rally',
        'Serve placement practice',
      ],
      cooldown: [
        'Wrist release stretch',
        'Foam roll calves (2 min each)',
      ],
    },
    RED: {
      warmup: [
        'Gentle walk (5 min)',
        'Breathing exercises',
      ],
      mainSet: [],
      cooldown: [
        'Full-body static stretch (10 min)',
        'Hydrate and rest',
      ],
    },
  },
};

// ---------------------------------------------------------------------------
// Archetype exercise overlays
//
// For GREEN and YELLOW plans, one extra exercise is added to mainSet
// based on archetype training style. RED is never modified.
//
// Phoenix  → cyclical, recovery-aware pacing
// Titan    → steady volume, accumulation
// Blade    → precision, peak quality
// Surge    → explosive, varied
// ---------------------------------------------------------------------------

type ArchetypeOverlay = Record<ReadinessLevel, string | null>;

const ARCHETYPE_EXTRAS: Record<string, Record<PlanSport, ArchetypeOverlay>> = {
  phoenix: {
    football: {
      GREEN: 'Interval pacing run — 3 min on, 1 min off (x3)',
      YELLOW: 'Light tempo jog with ball (5 min)',
      RED: null,
    },
    basketball: {
      GREEN: 'Continuous layup circuit — steady pace (5 min)',
      YELLOW: 'Light shooting around the key (5 min)',
      RED: null,
    },
    tennis: {
      GREEN: 'Rally pacing drill — controlled tempo (10 min)',
      YELLOW: 'Easy cross-court rally — rhythm focus',
      RED: null,
    },
    padel: {
      GREEN: 'Rally rhythm drill — steady tempo (10 min)',
      YELLOW: 'Controlled wall play — pacing focus',
      RED: null,
    },
  },

  titan: {
    football: {
      GREEN: 'Extra passing reps — long and short (5 min)',
      YELLOW: 'Extended ball mastery — slow build (5 min)',
      RED: null,
    },
    basketball: {
      GREEN: 'Extended shooting drill — 20 extra shots each spot',
      YELLOW: 'Extra free throws — focus on repetition (20 shots)',
      RED: null,
    },
    tennis: {
      GREEN: 'Extended baseline rally — build volume (10 min)',
      YELLOW: 'Extra serve reps — 20 serves, no power',
      RED: null,
    },
    padel: {
      GREEN: 'Extended volley drill — steady reps (10 min)',
      YELLOW: 'Extra wall shots — forehand and backhand (5 min)',
      RED: null,
    },
  },

  blade: {
    football: {
      GREEN: 'Precision finishing — 10 shots, exact placement',
      YELLOW: 'First touch accuracy drill — cones (5 min)',
      RED: null,
    },
    basketball: {
      GREEN: 'Spot shooting — 10 perfect-form shots per spot',
      YELLOW: 'Form shooting — 15 close-range, perfect arc',
      RED: null,
    },
    tennis: {
      GREEN: 'Target serve practice — aim for corners (15 serves)',
      YELLOW: 'Forehand placement — cross and down the line',
      RED: null,
    },
    padel: {
      GREEN: 'Overhead placement drill — aim for zones (10 min)',
      YELLOW: 'Serve accuracy — target practice (10 serves)',
      RED: null,
    },
  },

  surge: {
    football: {
      GREEN: 'Explosive drill stations — sprint, pass, shoot (8 min)',
      YELLOW: 'Juggling freestyle — keep it creative (5 min)',
      RED: null,
    },
    basketball: {
      GREEN: 'Fast-break simulation — explosive transitions (8 min)',
      YELLOW: 'Creative dribble moves — freestyle (5 min)',
      RED: null,
    },
    tennis: {
      GREEN: 'Mixed shot drill — drop, lob, drive, slice (10 min)',
      YELLOW: 'Shot variety rally — alternate spin and flat',
      RED: null,
    },
    padel: {
      GREEN: 'Mixed shot circuit — lob, overhead, drop, volley (10 min)',
      YELLOW: 'Creative wall play — try new angles (5 min)',
      RED: null,
    },
  },
};

// ---------------------------------------------------------------------------
// Readiness → recommended intensity mapping
// ---------------------------------------------------------------------------

const INTENSITY_MAP: Record<ReadinessLevel, string> = {
  GREEN: 'MODERATE',
  YELLOW: 'LIGHT',
  RED: 'REST',
};

// ---------------------------------------------------------------------------
// Sport → focus areas
// ---------------------------------------------------------------------------

const FOCUS_AREAS: Record<PlanSport, string[]> = {
  football: ['Agility', 'Passing', 'Endurance', 'Shooting'],
  basketball: ['Shooting', 'Ball Handling', 'Defense', 'Speed'],
  tennis: ['Serve', 'Groundstrokes', 'Footwork', 'Endurance'],
  padel: ['Net Play', 'Positioning', 'Wall Shots', 'Serve'],
};

// ---------------------------------------------------------------------------
// Generator
// ---------------------------------------------------------------------------

/**
 * Generate a daily training plan based on readiness, sport, and archetype.
 *
 * SAFETY:
 *   RED → mainSet is always empty ("Recovery only today")
 *   Disclaimer is always included
 *
 * @param readiness - GREEN, YELLOW, or RED
 * @param sport - football, basketball, tennis, or padel
 * @param archetype - Archetype string or null (unassigned)
 * @returns DailyPlan with warmup, mainSet, cooldown, disclaimer
 */
export function generatePlan(
  readiness: string,
  sport: string,
  archetype: string | null,
): DailyPlan {
  // Normalize inputs
  const normalizedReadiness = readiness?.toUpperCase() as ReadinessLevel;
  const normalizedSport = sport?.toLowerCase() as PlanSport;

  // Validate readiness
  if (!normalizedReadiness || !VALID_READINESS.includes(normalizedReadiness)) {
    throw new Error(
      `Invalid readiness: "${readiness}". Must be GREEN, YELLOW, or RED.`,
    );
  }

  // Validate sport
  if (!normalizedSport || !VALID_SPORTS.includes(normalizedSport)) {
    throw new Error(
      `Invalid sport: "${sport}". Must be football, basketball, tennis, or padel.`,
    );
  }

  // Look up base exercises
  const base = EXERCISE_DB[normalizedSport][normalizedReadiness];

  // Copy arrays so callers can't mutate the source
  const warmup = [...base.warmup];
  const mainSet = [...base.mainSet];
  const cooldown = [...base.cooldown];

  const recommendedIntensity = INTENSITY_MAP[normalizedReadiness];
  const focusAreas = normalizedReadiness === 'RED' ? [] : FOCUS_AREAS[normalizedSport];

  // SAFETY: RED → mainSet must be empty, always
  if (normalizedReadiness === 'RED') {
    return { warmup, mainSet: [], cooldown, disclaimer: DISCLAIMER, recommendedIntensity, focusAreas };
  }

  // Archetype overlay — add extra exercise to mainSet
  const profile = getArchetypeProfile(archetype);
  const normalizedArchetype = archetype?.toLowerCase();

  if (
    normalizedArchetype &&
    ARCHETYPE_EXTRAS[normalizedArchetype]
  ) {
    const overlay = ARCHETYPE_EXTRAS[normalizedArchetype][normalizedSport];
    if (overlay) {
      const extra = overlay[normalizedReadiness];
      if (extra) {
        mainSet.push(extra);
      }
    }
  }

  return { warmup, mainSet, cooldown, disclaimer: DISCLAIMER, recommendedIntensity, focusAreas };
}
