/**
 * Football Readiness Context — Sport-specific context messages
 * layered on top of the core GREEN/YELLOW/RED readiness system.
 *
 * SAFETY: The readiness calculation itself is UNCHANGED (per CLAUDE.md).
 * These functions provide additional football-specific context and
 * recommendations AFTER readiness has been determined.
 *
 * This is not medical advice.
 */

import type { ReadinessLevel, CalendarEvent } from '../types';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface FootballReadinessContext {
  contextMessage: string;
  researchNote: string | null;
}

export interface InjuryAwarenessNote {
  message: string;
  ageGroup: 'youth' | 'teen' | null;
}

export interface OvertrainingAlert {
  consecutiveDays: number;
  message: string;
}

// ─── Position-Specific Suggestions ──────────────────────────────────────────

const POSITION_SUGGESTIONS: Record<string, string> = {
  ST: 'finishing drills and movement off the ball',
  CF: 'finishing drills and movement off the ball',
  LW: 'crossing delivery and sprint repetitions',
  RW: 'crossing delivery and sprint repetitions',
  CAM: 'passing patterns and creative movement',
  CM: 'passing patterns and box-to-box fitness',
  CDM: 'defensive positioning and ball distribution',
  LM: 'crossing delivery and sprint repetitions',
  RM: 'crossing delivery and sprint repetitions',
  WM: 'crossing delivery and sprint repetitions',
  CB: 'heading practice and defensive positioning',
  LB: 'overlapping runs and 1v1 defending',
  RB: 'overlapping runs and 1v1 defending',
  FB: 'overlapping runs and 1v1 defending',
  GK: 'shot-stopping reactions and distribution',
};

function getPositionSuggestion(position: string | null | undefined): string {
  if (!position) return 'position-specific drills';
  const upper = position.toUpperCase();
  return POSITION_SUGGESTIONS[upper] ?? 'position-specific drills';
}

function getPositionLabel(position: string | null | undefined): string {
  if (!position) return 'your position';
  return position.toUpperCase();
}

// ─── Readiness Context Messages ─────────────────────────────────────────────

/**
 * Get football-specific readiness context based on readiness level
 * and player position. These messages SUPPLEMENT the existing
 * archetype-aware readiness messages — they do NOT replace them.
 *
 * SAFETY: Readiness logic is unchanged. Pain → REST, 6+ days → REST,
 * RED → REST. These are non-negotiable per CLAUDE.md.
 */
export function getFootballReadinessContext(
  level: ReadinessLevel,
  position: string | null | undefined,
): FootballReadinessContext {
  switch (level) {
    case 'GREEN':
      return {
        contextMessage:
          `You're in great shape for training today. Your readiness is green. ` +
          `Based on your position (${getPositionLabel(position)}), focus on ${getPositionSuggestion(position)}.`,
        researchNote: null,
      };

    case 'YELLOW':
      return {
        contextMessage:
          'Your body is telling you to take it easier today. Light technical work is recommended.',
        researchNote:
          'Athletes who train light on recovery days have 40% fewer injuries than those who push through (ACWR research, Bowen et al., 2020).',
      };

    case 'RED':
      return {
        contextMessage:
          'Rest day recommended for all sports. Your readiness indicators suggest your body needs recovery — rest from both football and padel.',
        researchNote:
          'Youth athletes need 48–72 hours to recover from intense sessions (PMC, 2025). Rest is not weakness — it\'s how your body gets stronger. Your body doesn\'t recover sport-by-sport.',
      };
  }
}

// ─── Injury Awareness (Age-Specific) ────────────────────────────────────────

/**
 * Returns age-specific injury awareness notes for football players.
 * These are educational supplements — not diagnoses.
 *
 * - Ages 13-15: Growth-related injury risk (Osgood-Schlatter)
 * - Ages 16-18: Muscle strain risk (hamstrings)
 * - Ages 19+: No additional note (adult-level awareness assumed)
 */
export function getInjuryAwarenessNote(
  age: number | null | undefined,
): InjuryAwarenessNote | null {
  if (!age || age < 13) return null;

  if (age <= 15) {
    return {
      message:
        'At your age, growth spurts can increase injury risk. If you feel knee or heel pain, ' +
        'tell your coach and consider rest. Osgood-Schlatter disease affects 10–17% of youth ' +
        'footballers (Guldhammer et al., 2022).',
      ageGroup: 'youth',
    };
  }

  if (age <= 18) {
    return {
      message:
        'Hamstring strains become more common at your age. Always warm up properly ' +
        "and don't skip stretching.",
      ageGroup: 'teen',
    };
  }

  return null;
}

// ─── Overtraining Alert ─────────────────────────────────────────────────────

/**
 * Count consecutive training days (any sport) looking backward from
 * the selected date. A "training day" is any day with at least one
 * non-REST event.
 *
 * Returns an alert if 6+ consecutive days detected.
 *
 * SAFETY: The core system already forces REST at 6+ days without rest.
 * This alert adds user-facing educational context about why.
 */
export function getOvertrainingAlert(
  events: CalendarEvent[],
  selectedDate: Date,
): OvertrainingAlert | null {
  // Build a set of dates that have non-REST events
  const trainingDates = new Set<string>();
  for (const evt of events) {
    if (evt.intensity !== 'REST') {
      trainingDates.add(evt.date);
    }
  }

  // Count consecutive days backward from selectedDate (inclusive)
  let consecutiveDays = 0;
  const d = new Date(selectedDate);

  for (let i = 0; i < 14; i++) {
    const ds = formatDateStr(d);
    if (trainingDates.has(ds)) {
      consecutiveDays++;
      d.setDate(d.getDate() - 1);
    } else {
      break;
    }
  }

  if (consecutiveDays >= 6) {
    return {
      consecutiveDays,
      message:
        `You've been training for ${consecutiveDays} days straight. Research shows ` +
        '~35% of youth athletes experience overtraining (AAP, 2024). A rest day ' +
        'today will make your next session more productive.',
    };
  }

  return null;
}

/** Format Date as YYYY-MM-DD (local helper, avoids importing calendarHelpers). */
function formatDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
