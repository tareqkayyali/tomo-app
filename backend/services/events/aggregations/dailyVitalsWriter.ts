/**
 * ════════════════════════════════════════════════════════════════════════════
 * Daily Vitals Writer — Source Priority Resolution
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Populates athlete_daily_vitals with ONE resolved value per field per day.
 * Source priority chain per field:
 *
 *   Sleep:      WEARABLE (whoop/garmin) > SLEEP_LOG > CHECKIN
 *   HRV:        WEARABLE > PHONE_TEST
 *   Resting HR: WEARABLE > CHECKIN
 *   Readiness:  COMPUTED (always from resolved fields, never raw)
 *   Energy:     CHECKIN (only source)
 *   Soreness:   CHECKIN (only source)
 *   Mood:       CHECKIN (only source)
 *
 * Called by event handlers AFTER writeSnapshot():
 *   - wellnessHandler → upsertDailyVitals (energy, soreness, mood, sleep from checkin)
 *   - vitalHandler    → upsertDailyVitals (HRV, RHR from wearable)
 *
 * The writer merges new data with existing row, respecting priority.
 * If a wearable HRV already exists, a checkin HRV won't overwrite it.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { supabaseAdmin } from '@/lib/supabase/admin';

// ============================================================================
// SOURCE PRIORITY
// ============================================================================

const SOURCE_PRIORITY: Record<string, string[]> = {
  hrv_morning_ms: ['whoop', 'garmin', 'oura', 'wearable', 'phone_test', 'checkin'],
  resting_hr_bpm: ['whoop', 'garmin', 'oura', 'wearable', 'checkin'],
  sleep_hours:    ['whoop', 'garmin', 'oura', 'wearable', 'sleep_log', 'checkin'],
  sleep_quality:  ['whoop', 'garmin', 'oura', 'wearable', 'sleep_log', 'checkin'],
  deep_sleep_min: ['whoop', 'garmin', 'oura', 'wearable'],
  rem_sleep_min:  ['whoop', 'garmin', 'oura', 'wearable'],
};

/**
 * Returns true if the new source has higher priority than the existing source.
 */
function isHigherPriority(field: string, newSource: string, existingSource: string | null): boolean {
  if (!existingSource) return true;
  const chain = SOURCE_PRIORITY[field];
  if (!chain) return true;
  const newRank = chain.indexOf(newSource.toLowerCase());
  const existingRank = chain.indexOf(existingSource.toLowerCase());
  if (newRank === -1) return false; // Unknown source = lowest priority
  if (existingRank === -1) return true; // Existing is unknown = new wins
  return newRank <= existingRank; // Lower index = higher priority
}


// ============================================================================
// PUBLIC API
// ============================================================================

export interface VitalsUpdate {
  source: string;  // 'whoop' | 'garmin' | 'checkin' | 'sleep_log' | 'phone_test'

  hrv_morning_ms?:   number;
  hrv_avg_ms?:       number;
  resting_hr_bpm?:   number;
  sleep_hours?:      number;
  sleep_quality?:    number;
  deep_sleep_min?:   number;
  rem_sleep_min?:    number;
  spo2_percent?:     number;
  recovery_score?:   number;
  steps?:            number;
  active_calories?:  number;

  energy?:           number;
  soreness?:         number;
  mood?:             number;
  academic_stress?:  number;
  pain_flag?:        boolean;

  // Pre-computed readiness (from wellnessHandler)
  readiness_score?:  number;
  readiness_rag?:    string;
}

/**
 * Upsert daily vitals for an athlete on a specific date.
 * Respects source priority — a lower-priority source won't overwrite
 * a higher-priority source's value.
 *
 * @param athleteId - The athlete's UUID
 * @param date      - The date (YYYY-MM-DD)
 * @param update    - New vitals data with source
 */
export async function upsertDailyVitals(
  athleteId: string,
  date: string,
  update: VitalsUpdate,
): Promise<void> {
  const db = supabaseAdmin();

  // Read existing row to check source priorities
  const { data: existing } = await (db as any)
    .from('athlete_daily_vitals')
    .select('sources_resolved')
    .eq('athlete_id', athleteId)
    .eq('vitals_date', date)
    .single();

  const sources: Record<string, string> = existing?.sources_resolved ?? {};
  const upsertData: Record<string, unknown> = {
    athlete_id: athleteId,
    vitals_date: date,
    updated_at: new Date().toISOString(),
  };

  // Apply each field only if the new source has priority
  const fieldsToCheck: Array<{ field: string; value: unknown }> = [
    { field: 'hrv_morning_ms',  value: update.hrv_morning_ms },
    { field: 'hrv_avg_ms',      value: update.hrv_avg_ms },
    { field: 'resting_hr_bpm',  value: update.resting_hr_bpm },
    { field: 'sleep_hours',     value: update.sleep_hours },
    { field: 'sleep_quality',   value: update.sleep_quality },
    { field: 'deep_sleep_min',  value: update.deep_sleep_min },
    { field: 'rem_sleep_min',   value: update.rem_sleep_min },
  ];

  for (const { field, value } of fieldsToCheck) {
    if (value != null && isHigherPriority(field, update.source, sources[field] ?? null)) {
      upsertData[field] = value;
      sources[field] = update.source;
    }
  }

  // Non-priority fields (only from checkin, or always update)
  if (update.energy != null) upsertData.energy = update.energy;
  if (update.soreness != null) upsertData.soreness = update.soreness;
  if (update.mood != null) upsertData.mood = update.mood;
  if (update.academic_stress != null) upsertData.academic_stress = update.academic_stress;
  if (update.pain_flag !== undefined) upsertData.pain_flag = update.pain_flag;
  if (update.spo2_percent != null) upsertData.spo2_percent = update.spo2_percent;
  if (update.recovery_score != null) upsertData.recovery_score = update.recovery_score;
  if (update.steps != null) upsertData.steps = update.steps;
  if (update.active_calories != null) upsertData.active_calories = update.active_calories;

  // Readiness (always overwrite — computed from resolved fields)
  if (update.readiness_score != null) {
    upsertData.readiness_score = update.readiness_score;
    sources['readiness'] = 'computed';
  }
  if (update.readiness_rag != null) {
    upsertData.readiness_rag = update.readiness_rag;
  }

  // Directive text and intensity cap (computed from readiness + snapshot context)
  upsertData.directive_text = computeDirectiveText(
    update.readiness_rag ?? null,
    update.energy ?? null,
  );
  upsertData.intensity_cap = computeIntensityCap(update.readiness_rag ?? null);

  upsertData.sources_resolved = sources;

  const { error } = await (db as any)
    .from('athlete_daily_vitals')
    .upsert(upsertData, { onConflict: 'athlete_id,vitals_date' });

  if (error) {
    console.error('[DailyVitalsWriter] Upsert failed:', error.message, { athleteId, date });
  }
}


// ============================================================================
// DIRECTIVE COMPUTATION
// ============================================================================

/**
 * Compute a pre-baked directive text based on readiness.
 * This ensures every surface shows the same message — no recomputation.
 */
function computeDirectiveText(
  readinessRag: string | null,
  energy: number | null,
): string {
  if (readinessRag === 'RED') {
    return 'Your body needs rest today. Recovery or light movement only.';
  }
  if (readinessRag === 'AMBER') {
    return 'Moderate day — stick to planned load, no extra sets.';
  }
  if (readinessRag === 'GREEN' && energy != null && energy >= 4) {
    return 'Your body is recovered. Full session — push the intensity.';
  }
  if (readinessRag === 'GREEN') {
    return 'Good to go. Follow your planned session.';
  }
  return 'Check in to get your daily directive.';
}

/**
 * Compute intensity cap from readiness RAG.
 */
function computeIntensityCap(readinessRag: string | null): string {
  switch (readinessRag) {
    case 'RED':    return 'rest';
    case 'AMBER':  return 'moderate';
    case 'GREEN':  return 'full';
    default:       return 'moderate'; // Default to moderate when unknown
  }
}
