/**
 * ════════════════════════════════════════════════════════════════════════════
 * Session Completion Resolution (pure)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Pure helpers used by POST /api/v1/calendar/events/[id]/complete. Extracted
 * from the route handler so tests can exercise the intensity + duration
 * resolution logic without mocking Supabase.
 *
 * No DB calls here — callers pass the resolved config + event fields.
 * ════════════════════════════════════════════════════════════════════════════
 */

import {
  rpeToIntensity,
  type IntensityBucket,
  type IntensityCatalog,
} from "@/services/events/intensityCatalogConfig";

export type CalendarIntensity = "REST" | "LIGHT" | "MODERATE" | "HARD";

const CALENDAR_INTENSITIES: readonly CalendarIntensity[] = ["REST", "LIGHT", "MODERATE", "HARD"];

/**
 * Collapse a full IntensityBucket (may include MATCH/RECOVERY) to one of the
 * four values the calendar_events.effective_intensity CHECK constraint
 * accepts. MATCH → HARD, RECOVERY → LIGHT, others unchanged.
 */
export function toCalendarIntensity(bucket: IntensityBucket): CalendarIntensity {
  if (bucket === "MATCH") return "HARD";
  if (bucket === "RECOVERY") return "LIGHT";
  return bucket;
}

/**
 * Resolve the intensity bucket that should drive the SESSION_LOG load
 * calculation for a completed event.
 *
 * Cascade (first non-null wins):
 *   1. Athlete-reported RPE  (intensity via rpeToIntensity)
 *   2. Scheduled intensity on the calendar row
 *   3. Catalog default_intensity (MODERATE by default)
 *
 * Returns a calendar-valid bucket (REST/LIGHT/MODERATE/HARD).
 */
export function resolveEffectiveIntensity(params: {
  catalog:            IntensityCatalog;
  rpe:                number | null | undefined;
  scheduledIntensity: string | null | undefined;
}): CalendarIntensity {
  const { catalog, rpe, scheduledIntensity } = params;

  if (typeof rpe === "number" && Number.isFinite(rpe)) {
    return toCalendarIntensity(rpeToIntensity(catalog, rpe));
  }

  if (scheduledIntensity && (CALENDAR_INTENSITIES as readonly string[]).includes(scheduledIntensity)) {
    return scheduledIntensity as CalendarIntensity;
  }

  return toCalendarIntensity(catalog.default_intensity);
}

/**
 * Resolve effective session duration (minutes).
 *
 * Cascade:
 *   1. Athlete-reported duration (when present and positive)
 *   2. Scheduled: end_at − start_at in minutes
 *   3. Fallback: 60 minutes (rather than 0 so AU is never silently zero)
 *
 * Inputs are ISO timestamp strings or null; positive-integer validation
 * on the reported value happens at the API layer.
 */
export function resolveEffectiveDuration(params: {
  reported:       number | null | undefined;
  scheduledStart: string | null | undefined;
  scheduledEnd:   string | null | undefined;
}): number {
  const { reported, scheduledStart, scheduledEnd } = params;

  if (typeof reported === "number" && Number.isFinite(reported) && reported > 0) {
    return reported;
  }

  if (scheduledStart && scheduledEnd) {
    const start = new Date(scheduledStart).getTime();
    const end   = new Date(scheduledEnd).getTime();
    if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
      return Math.max(1, Math.round((end - start) / 60000));
    }
  }

  return 60;
}
