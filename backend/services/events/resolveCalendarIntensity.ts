/**
 * ════════════════════════════════════════════════════════════════════════════
 * Calendar Event Intensity Resolver
 * ════════════════════════════════════════════════════════════════════════════
 *
 * When an athlete (or a build_session tool) creates a calendar event
 * without explicitly picking an intensity, this module resolves what
 * intensity should land on the row so downstream load calculation has
 * a non-null signal.
 *
 * Cascade (first non-null wins):
 *   1. Explicit athlete/tool pick  (param `explicitIntensity`)
 *   2. Linked program's default_intensity column (PR 3 migration 084)
 *   3. Linked program's difficulty mapped through
 *      intensity_catalog_v1.program_difficulty_to_intensity
 *   4. Fallback: intensity_catalog_v1.default_intensity (MODERATE by default)
 *
 * Drills are intentionally not yet in this cascade — calendar-events POST
 * doesn't currently accept a drill_id and drills attach later through the
 * session_plan JSONB. A follow-up PR can extend this resolver once the
 * drill link surface exists.
 *
 * This is not a safety gate — missing intensity never blocks event
 * creation; it defaults to MODERATE so ATL/CTL always has a signal to
 * measure against.
 * ════════════════════════════════════════════════════════════════════════════
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { FOOTBALL_PROGRAMS } from '@/services/programs/footballPrograms';
import {
  getIntensityCatalog,
  type IntensityBucket,
  type IntensityCatalog,
} from './intensityCatalogConfig';

export type CalendarIntensity = 'REST' | 'LIGHT' | 'MODERATE' | 'HARD';

function normalizeExplicit(value: string | null | undefined): CalendarIntensity | null {
  if (!value) return null;
  const upper = value.toUpperCase();
  if (upper === 'REST' || upper === 'LIGHT' || upper === 'MODERATE' || upper === 'HARD') {
    return upper;
  }
  return null;
}

function toCalendarBucket(intensity: IntensityBucket): CalendarIntensity {
  // calendar_events.intensity CHECK constraint only accepts REST/LIGHT/MODERATE/HARD.
  // MATCH and RECOVERY come out of the catalog's auto-mapped buckets but
  // aren't valid on the calendar row — collapse them to their closest
  // day-to-day counterpart.
  if (intensity === 'MATCH') return 'HARD';
  if (intensity === 'RECOVERY') return 'LIGHT';
  return intensity;
}

export interface ResolveIntensityParams {
  db:                 SupabaseClient<any>;
  athleteId:          string;
  eventType:          string;       // 'training', 'match', etc.
  explicitIntensity:  string | null | undefined;
  linkedProgramSlugs: string[] | null | undefined;
  sport:              string | null | undefined;
}

/**
 * Resolve the intensity to persist on `calendar_events.intensity`.
 * Returns null when the event is a non-physical type (study, exam, other).
 */
export async function resolveCalendarIntensity(
  params: ResolveIntensityParams,
): Promise<CalendarIntensity | null> {
  const { db, eventType, explicitIntensity, linkedProgramSlugs, sport } = params;

  // Non-physical events don't carry physical intensity.
  if (eventType === 'study' || eventType === 'exam' || eventType === 'other') {
    return null;
  }

  const catalog: IntensityCatalog = await getIntensityCatalog({ sport: sport ?? null });

  // 1) Athlete/tool explicit pick.
  const explicit = normalizeExplicit(explicitIntensity ?? null);
  if (explicit) return explicit;

  // 2) Event-type override (match → HARD on calendar column; catalog returns
  //    MATCH internally which collapses via toCalendarBucket).
  const override = catalog.event_type_overrides[eventType];
  if (override?.always_intensity) {
    return toCalendarBucket(override.always_intensity);
  }

  // 3) Linked program's default_intensity or difficulty map.
  // Same slug → FOOTBALL_PROGRAMS.name → training_programs row resolution
  // as calendarLinkedProgramsHelper.autoLinkPrescribedPrograms, so the
  // intensity lookup doesn't disagree with the subsequent auto-link.
  if (linkedProgramSlugs && linkedProgramSlugs.length > 0) {
    try {
      const slugToName = new Map<string, string>(
        FOOTBALL_PROGRAMS.map((p) => [p.id, p.name]),
      );
      const names: string[] = [];
      for (const s of linkedProgramSlugs) {
        const n = slugToName.get(s);
        if (n) names.push(n);
      }
      if (names.length > 0) {
        const sportId = sport ?? 'football';
        const { data: programs } = await (db as any)
          .from('training_programs')
          .select('default_intensity, difficulty, name')
          .eq('sport_id', sportId)
          .eq('active', true)
          .in('name', names)
          .limit(1);
        const first = (programs ?? [])[0];
        if (first?.default_intensity) {
          return normalizeExplicit(first.default_intensity) ?? 'MODERATE';
        }
        if (first?.difficulty) {
          const mapped = catalog.program_difficulty_to_intensity[
            first.difficulty as keyof typeof catalog.program_difficulty_to_intensity
          ];
          if (mapped) return toCalendarBucket(mapped);
        }
      }
    } catch (err) {
      // Fail-open: log and fall through to catalog default. Never block.
      // eslint-disable-next-line no-console
      console.warn('[resolveCalendarIntensity] program lookup failed:', err);
    }
  }

  // 4) Catalog default (MODERATE by default).
  return toCalendarBucket(catalog.default_intensity);
}
