/**
 * Load Estimator — pure function to estimate training/academic load
 * from calendar event metadata (event_type, intensity, duration).
 *
 * No database dependency. Used by:
 *   - Calendar event API (POST /api/v1/calendar/events)
 *   - Timeline agent (create_event tool)
 *   - Auto-fill-week and ghost-suggestions
 *   - Calendar bridge (for events without explicit load)
 *
 * RPE proxy mapping (AU per hour):
 *   REST=2, LIGHT=4, MODERATE=6, HARD=8, match=9, recovery=1
 * Academic load: (duration_min / 60) * 10  (matches academicHandler formula)
 */

export interface LoadEstimateInput {
  event_type: string;        // training | match | recovery | study | exam | other
  intensity: string | null;  // REST | LIGHT | MODERATE | HARD | null
  duration_min: number;      // derived from start_at/end_at difference
}

export interface LoadEstimate {
  training_load_au: number;  // 0 for non-physical events
  academic_load_au: number;  // 0 for non-academic events
}

/** RPE proxy: AU per hour by intensity */
const INTENSITY_AU_PER_HOUR: Record<string, number> = {
  REST: 2,
  LIGHT: 4,
  MODERATE: 6,
  HARD: 8,
};

/** Match load is fixed at 9 AU/hour regardless of intensity field */
const MATCH_AU_PER_HOUR = 9;

/** Recovery sessions are minimal load */
const RECOVERY_AU_PER_HOUR = 1;

/** Academic load: 10 AU per hour of study/exam (matches academicHandler.ts) */
const ACADEMIC_AU_PER_HOUR = 10;

/**
 * Estimate training and academic load from calendar event metadata.
 * Returns { training_load_au, academic_load_au } — one or both will be 0
 * depending on event_type.
 */
export function estimateLoad(input: LoadEstimateInput): LoadEstimate {
  const { event_type, intensity, duration_min } = input;
  const hours = Math.max(0, duration_min) / 60;

  // Academic events (study, exam)
  if (event_type === 'study' || event_type === 'exam') {
    return {
      training_load_au: 0,
      academic_load_au: Math.round(hours * ACADEMIC_AU_PER_HOUR * 10) / 10,
    };
  }

  // Match — fixed high RPE
  if (event_type === 'match') {
    return {
      training_load_au: Math.round(hours * MATCH_AU_PER_HOUR * 10) / 10,
      academic_load_au: 0,
    };
  }

  // Recovery — minimal load
  if (event_type === 'recovery') {
    return {
      training_load_au: Math.round(hours * RECOVERY_AU_PER_HOUR * 10) / 10,
      academic_load_au: 0,
    };
  }

  // Training — use intensity-based RPE proxy
  if (event_type === 'training') {
    const auPerHour = intensity
      ? (INTENSITY_AU_PER_HOUR[intensity.toUpperCase()] ?? INTENSITY_AU_PER_HOUR.MODERATE)
      : INTENSITY_AU_PER_HOUR.MODERATE; // default to MODERATE if no intensity
    return {
      training_load_au: Math.round(hours * auPerHour * 10) / 10,
      academic_load_au: 0,
    };
  }

  // Other event types (e.g., 'other') — no load
  return { training_load_au: 0, academic_load_au: 0 };
}

/**
 * Convenience: compute total estimated load (training + academic).
 * Returns null if both are 0 (for non-load events).
 */
export function estimateTotalLoad(input: LoadEstimateInput): number | null {
  const est = estimateLoad(input);
  const total = est.training_load_au + est.academic_load_au;
  return total > 0 ? total : null;
}
