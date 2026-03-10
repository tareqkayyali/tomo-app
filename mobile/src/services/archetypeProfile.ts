/**
 * Archetype Profile Service
 * Returns display metadata for each Tomo archetype — name, tone,
 * accent color, and sample motivational microcopy.
 *
 * Archetypes:
 *   Phoenix — fast recovery, smart pacing, self-renewal
 *   Titan   — steady force, high volume tolerance, patience
 *   Blade   — precision, peak quality, minimalist
 *   Surge   — dynamic energy, variety, explosive bursts
 *
 * USE CASES:
 *   - Plan screen headers (e.g. "The Phoenix" in accent color)
 *   - UI accent gradients
 *   - Archetype-aligned motivation copy
 *
 * Returns a neutral default when archetype is null, undefined,
 * or unrecognized — so callers never need null-checks.
 */

import type { Archetype } from '../types';

export interface ArchetypeProfile {
  name: string;
  tone: string;
  color: string;
  microcopyExamples: string[];
}

const PROFILES: Record<Archetype, ArchetypeProfile> = {
  phoenix: {
    name: 'The Phoenix',
    tone: 'Self-renewal, smart pacing',
    color: '#FF6B6B',
    microcopyExamples: [
      'Rise again, stronger than before.',
      'Recovery is your superpower.',
      'Smart pacing wins the long game.',
      'Burn bright, rest well.',
    ],
  },
  titan: {
    name: 'The Titan',
    tone: 'Solid, patient force',
    color: '#4C6EF5',
    microcopyExamples: [
      'Steady effort builds greatness.',
      'Patience is your edge.',
      'Volume is your strength. Stay consistent.',
      'One rep at a time, Titan.',
    ],
  },
  blade: {
    name: 'The Blade',
    tone: 'Sharp, precise, minimalist',
    color: '#12B886',
    microcopyExamples: [
      'Quality over quantity. Always.',
      'One sharp session beats three dull ones.',
      'Precision is your craft.',
      'Less is more when every rep counts.',
    ],
  },
  surge: {
    name: 'The Surge',
    tone: 'Dynamic, emotional, explosive',
    color: '#FFD43B',
    microcopyExamples: [
      'Channel that energy today.',
      'Variety keeps you sharp.',
      'Ride the wave, Surge.',
      'Your unpredictability is your weapon.',
    ],
  },
};

const DEFAULT_PROFILE: ArchetypeProfile = {
  name: 'Athlete',
  tone: 'Balanced, encouraging',
  color: '#4A90A4',
  microcopyExamples: [
    'Every check-in counts.',
    'Stay consistent. Results will follow.',
    'Your body, your pace.',
    'Trust the process.',
  ],
};

const VALID_ARCHETYPES: Archetype[] = ['phoenix', 'titan', 'blade', 'surge'];

/**
 * Get the display profile for an archetype.
 *
 * Accepts Archetype, string (case-insensitive), null, or undefined.
 * Returns a neutral default for unassigned or unrecognized values
 * so the caller never needs a null-check.
 *
 * @param archetype - Archetype key, or null/undefined for unassigned
 * @returns ArchetypeProfile with name, tone, color, and microcopy
 */
export function getArchetypeProfile(
  archetype?: Archetype | string | null,
): ArchetypeProfile {
  let source: ArchetypeProfile;

  if (!archetype || typeof archetype !== 'string') {
    source = DEFAULT_PROFILE;
  } else {
    const normalized = archetype.toLowerCase() as Archetype;
    source = VALID_ARCHETYPES.includes(normalized) ? PROFILES[normalized] : DEFAULT_PROFILE;
  }

  return { ...source, microcopyExamples: [...source.microcopyExamples] };
}
