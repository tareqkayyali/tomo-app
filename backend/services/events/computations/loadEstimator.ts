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
 * Rate tables (AU per hour per bucket, academic rate, event-type overrides)
 * come from the intensity_catalog_v1 CMS config — see
 * services/events/intensityCatalogConfig.ts. When a caller doesn't pass
 * a config, the hardcoded DEFAULT is used so tests and legacy callers
 * keep working byte-for-byte.
 */

import {
  INTENSITY_CATALOG_DEFAULT,
  type IntensityCatalog,
  type IntensityBucket,
} from '../intensityCatalogConfig';

export interface LoadEstimateInput {
  event_type: string;        // training | match | recovery | study | exam | other
  intensity: string | null;  // REST | LIGHT | MODERATE | HARD | null
  duration_min: number;      // derived from start_at/end_at difference
}

export interface LoadEstimate {
  training_load_au: number;  // 0 for non-physical events
  academic_load_au: number;  // 0 for non-academic events
}

function normalizeBucket(value: string | null | undefined): IntensityBucket | null {
  if (!value) return null;
  const upper = value.toUpperCase();
  if (upper === 'REST' || upper === 'LIGHT' || upper === 'MODERATE'
   || upper === 'HARD' || upper === 'MATCH' || upper === 'RECOVERY') {
    return upper as IntensityBucket;
  }
  return null;
}

/**
 * Estimate training and academic load from calendar event metadata.
 * Returns { training_load_au, academic_load_au } — one or both will be 0
 * depending on event_type.
 */
export function estimateLoad(
  input: LoadEstimateInput,
  config: IntensityCatalog = INTENSITY_CATALOG_DEFAULT,
): LoadEstimate {
  const { event_type, intensity, duration_min } = input;
  const hours = Math.max(0, duration_min) / 60;

  // Academic events (study, exam)
  if (event_type === 'study' || event_type === 'exam') {
    return {
      training_load_au: 0,
      academic_load_au: Math.round(hours * config.academic_au_per_hour * 10) / 10,
    };
  }

  // Event-type override with a fixed always_intensity (e.g. match=MATCH, recovery=LIGHT).
  const override = config.event_type_overrides[event_type];

  if (override?.au_per_hour != null) {
    return {
      training_load_au: Math.round(hours * override.au_per_hour * 10) / 10,
      academic_load_au: 0,
    };
  }

  if (override?.always_intensity) {
    const au = config.au_per_hour[override.always_intensity];
    return {
      training_load_au: Math.round(hours * au * 10) / 10,
      academic_load_au: 0,
    };
  }

  // Training — use intensity-based RPE proxy (or default_intensity fallback).
  if (event_type === 'training') {
    const bucket = normalizeBucket(intensity) ?? config.default_intensity;
    const auPerHour = config.au_per_hour[bucket];
    return {
      training_load_au: Math.round(hours * auPerHour * 10) / 10,
      academic_load_au: 0,
    };
  }

  // Any other event type (e.g., 'other') — no load.
  return { training_load_au: 0, academic_load_au: 0 };
}

/**
 * Convenience: compute total estimated load (training + academic).
 * Returns null if both are 0 (for non-load events).
 */
export function estimateTotalLoad(
  input: LoadEstimateInput,
  config: IntensityCatalog = INTENSITY_CATALOG_DEFAULT,
): number | null {
  const est = estimateLoad(input, config);
  const total = est.training_load_au + est.academic_load_au;
  return total > 0 ? total : null;
}
