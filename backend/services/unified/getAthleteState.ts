/**
 * ════════════════════════════════════════════════════════════════════════════
 * getAthleteState() — THE Single Read API
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Every consumer in Tomo calls this function to get the athlete's state.
 * No consumer queries raw tables directly. No consumer computes its own
 * readiness, ACWR, or benchmarks. One function. One truth. One object.
 *
 * ── CALL FLOW ──
 *
 *   1. Resolve options (apply preset + individual overrides)
 *   2. Read athlete profile (users table)
 *   3. Read snapshot (athlete_snapshots with role-based visibility)
 *   4. Read all requested data in PARALLEL:
 *      - Daily vitals (athlete_daily_vitals)
 *      - Daily load (athlete_daily_load)
 *      - Weekly digest (athlete_weekly_digest)
 *      - Monthly summaries (athlete_monthly_summary)
 *      - Benchmark cache (athlete_benchmark_cache)
 *      - Today + upcoming calendar events
 *      - Active recommendations
 *      - Longitudinal memory (AI-only)
 *   5. Evaluate PDIL protocols → PDContext
 *   6. Return AthleteState
 *
 * ── 3-TAB CONSUMER PRESETS ──
 *
 *   Timeline:  preset='timeline'  → calendar + today vitals (~3 queries)
 *   AI Chat:   preset='chat'      → everything + memory + RAG (~8 queries)
 *   Dashboard: preset='dashboard' → vitals + metrics + recs + progress (~7 queries)
 *   Boot:      preset='boot'      → balanced for initial app load (~6 queries)
 *
 * ── PERFORMANCE ──
 *
 *   All queries run in parallel via Promise.allSettled().
 *   Partial failures return partial data (never 500).
 *   PDIL evaluation adds ~1.5ms (cached protocols).
 *   Total: 50–150ms depending on preset.
 *
 * ══════════════════════════════════════════════════════════════════════════
 */

import { supabaseAdmin } from '@/lib/supabase/admin';
import { readSnapshot } from '../events/snapshot/snapshotReader';
import { evaluatePDProtocols } from '../pdil';
import { DEFAULT_PD_CONTEXT } from '../pdil/types';
import type {
  AthleteState,
  AthleteProfile,
  GetAthleteStateOptions,
  DailyVitals,
  WeeklyDigest,
  MonthlySummary,
  BenchmarkProfile,
  CalendarEvent,
  ActiveRecommendation,
  ConsumerPreset,
} from './types';
import { CONSUMER_PRESETS } from './types';
import type { TriangleRole } from '../events/types';

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Get the complete state of an athlete — facts + PDIL decisions.
 *
 * @param athleteId - The athlete's UUID
 * @param options   - What to include (use `preset` for convenience)
 * @returns AthleteState — the single truth object
 *
 * @example
 * ```typescript
 * // Dashboard tab
 * const state = await getAthleteState(athleteId, {
 *   role: 'ATHLETE',
 *   preset: 'dashboard',
 * });
 *
 * // AI Chat
 * const state = await getAthleteState(athleteId, {
 *   role: 'ATHLETE',
 *   preset: 'chat',
 *   ragQuery: userMessage,
 * });
 * ```
 */
export async function getAthleteState(
  athleteId: string,
  options: GetAthleteStateOptions,
): Promise<AthleteState> {
  const db = supabaseAdmin();
  const opts = resolveOptions(options);
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];

  // ── Step 1: Profile + Snapshot (always needed) ──────────────────────────
  const [profileResult, snapshotResult] = await Promise.allSettled([
    fetchProfile(db, athleteId),
    readSnapshot(athleteId, opts.role),
  ]);

  const profile = profileResult.status === 'fulfilled' ? profileResult.value : defaultProfile(athleteId);
  const snapshot = (snapshotResult.status === 'fulfilled' ? snapshotResult.value : null) ?? {};

  // ── Step 2: Parallel data fetches (based on preset) ─────────────────────
  const parallelFetches: Record<string, Promise<unknown>> = {};

  // Daily vitals
  if ((opts.vitalsWindowDays ?? 7) > 0) {
    const fromDate = daysAgoStr(todayStr, opts.vitalsWindowDays ?? 7);
    parallelFetches.dailyVitals = fetchDailyVitals(db, athleteId, fromDate);
  }

  // Daily load (always fetch 28 days for ACWR context in PDIL)
  parallelFetches.dailyLoad = fetchDailyLoad(db, athleteId, daysAgoStr(todayStr, 28));

  // Calendar events
  if (opts.includeCalendar !== false) {
    const forwardDate = daysForwardStr(todayStr, opts.calendarForwardDays ?? 7);
    parallelFetches.todayEvents = fetchTodayEvents(db, athleteId, todayStr);
    parallelFetches.upcomingEvents = fetchUpcomingEvents(db, athleteId, todayStr, forwardDate);
  }

  // Recommendations
  if (opts.includeRecommendations !== false) {
    parallelFetches.recommendations = fetchRecommendations(db, athleteId, opts.recLimit ?? 5);
  }

  // Benchmarks
  if (opts.includeBenchmarks !== false) {
    parallelFetches.benchmarks = fetchBenchmarkCache(db, athleteId);
  }

  // Weekly digest
  if (opts.includeWeeklyDigest !== false) {
    parallelFetches.weeklyDigest = fetchWeeklyDigest(db, athleteId);
  }

  // Monthly summaries
  if (opts.includeMonthly) {
    parallelFetches.monthlySummaries = fetchMonthlySummaries(db, athleteId, opts.monthlyCount ?? 6);
  }

  // Longitudinal memory (AI-only)
  if (opts.includeMemory) {
    parallelFetches.memory = fetchLongitudinalMemory(db, athleteId);
  }

  // Resolve all parallel fetches
  const results = await resolveParallel(parallelFetches);

  // ── Step 3: Assemble base state ─────────────────────────────────────────
  const dailyVitals = (results.dailyVitals as DailyVitals[]) ?? [];
  const dailyLoad = (results.dailyLoad as AthleteState['dailyLoad']) ?? [];
  const todayEvents = (results.todayEvents as CalendarEvent[]) ?? [];
  const upcomingEvents = (results.upcomingEvents as CalendarEvent[]) ?? [];
  const todayVitals = dailyVitals.length > 0 ? dailyVitals[0] : null;

  // ── Step 4: Evaluate PDIL protocols ─────────────────────────────────────
  let pdContext = DEFAULT_PD_CONTEXT;
  try {
    pdContext = await evaluatePDProtocols({
      snapshot,
      todayVitals: todayVitals as Record<string, unknown> | null,
      upcomingEvents: [...todayEvents, ...upcomingEvents] as Array<{ event_type: string; start_at: string; [key: string]: unknown }>,
      recentDailyLoad: dailyLoad,
      trigger: opts.trigger ?? 'screen',
      sourceEventId: opts.sourceEventId,
    });
  } catch (err) {
    console.error('[getAthleteState] PDIL evaluation failed:', err);
    // pdContext stays as DEFAULT_PD_CONTEXT — fail-safe handled inside evaluatePDProtocols
  }

  // ── Step 5: Assemble and return AthleteState ────────────────────────────
  const state: AthleteState = {
    snapshot,
    profile,
    dailyVitals,
    dailyLoad,
    weeklyDigest:          (results.weeklyDigest as WeeklyDigest) ?? null,
    monthlySummaries:      (results.monthlySummaries as MonthlySummary[]) ?? [],
    benchmarkProfile:      (results.benchmarks as BenchmarkProfile) ?? null,
    todayEvents,
    upcomingEvents,
    activeRecommendations: (results.recommendations as ActiveRecommendation[]) ?? [],
    pdContext,
    timezone:              Intl.DateTimeFormat().resolvedOptions().timeZone,
    stateAt:               now.toISOString(),
  };

  // AI-only fields
  if (opts.includeMemory && results.memory) {
    state.longitudinalMemory = results.memory as string;
  }

  return state;
}


// ============================================================================
// OPTIONS RESOLVER
// ============================================================================

interface ResolvedOptions extends GetAthleteStateOptions {
  role: TriangleRole;
}

function resolveOptions(options: GetAthleteStateOptions): ResolvedOptions {
  if (options.preset) {
    const preset = CONSUMER_PRESETS[options.preset];
    return { ...preset, ...options, role: options.role } as ResolvedOptions;
  }
  return options as ResolvedOptions;
}


// ============================================================================
// DATA FETCHERS — Each reads from pre-aggregated tables only
// ============================================================================

async function fetchProfile(db: ReturnType<typeof supabaseAdmin>, athleteId: string): Promise<AthleteProfile> {
  // Note: position, age_band, phv_stage, dob live on athlete_snapshots, not users
  const { data } = await db
    .from('users')
    .select('id, name, sport, school_hours')
    .eq('id', athleteId)
    .single();

  if (!data) return defaultProfile(athleteId);

  return {
    athlete_id:   data.id,
    name:         (data as any).name ?? 'Athlete',
    sport:        (data as any).sport ?? null,
    position:     null,   // Comes from snapshot
    age_band:     null,   // Comes from snapshot
    phv_stage:    null,   // Comes from snapshot
    dob:          null,   // Comes from snapshot
    school_hours: (data as any).school_hours ?? null,
  };
}

async function fetchDailyVitals(
  db: ReturnType<typeof supabaseAdmin>,
  athleteId: string,
  fromDate: string,
): Promise<DailyVitals[]> {
  const { data } = await (db as any)
    .from('athlete_daily_vitals')
    .select('*')
    .eq('athlete_id', athleteId)
    .gte('vitals_date', fromDate)
    .order('vitals_date', { ascending: false });

  return (data ?? []).map((row: Record<string, unknown>) => ({
    vitals_date:      row.vitals_date as string,
    hrv_morning_ms:   row.hrv_morning_ms != null ? Number(row.hrv_morning_ms) : null,
    resting_hr_bpm:   row.resting_hr_bpm as number | null,
    sleep_hours:      row.sleep_hours != null ? Number(row.sleep_hours) : null,
    sleep_quality:    row.sleep_quality != null ? Number(row.sleep_quality) : null,
    energy:           row.energy as number | null,
    soreness:         row.soreness as number | null,
    mood:             row.mood as number | null,
    academic_stress:  row.academic_stress as number | null,
    pain_flag:        (row.pain_flag as boolean) ?? false,
    readiness_score:  row.readiness_score as number | null,
    readiness_rag:    row.readiness_rag as string | null,
    intensity_cap:    row.intensity_cap as string | null,
    directive_text:   row.directive_text as string | null,
    sources_resolved: (row.sources_resolved as Record<string, string>) ?? {},
  }));
}

async function fetchDailyLoad(
  db: ReturnType<typeof supabaseAdmin>,
  athleteId: string,
  fromDate: string,
): Promise<AthleteState['dailyLoad']> {
  const { data } = await db
    .from('athlete_daily_load')
    .select('load_date, training_load_au, academic_load_au, session_count')
    .eq('athlete_id', athleteId)
    .gte('load_date', fromDate)
    .order('load_date', { ascending: false });

  return (data ?? []).map((row: any) => ({
    load_date:         row.load_date,
    training_load_au:  Number(row.training_load_au ?? 0),
    academic_load_au:  Number(row.academic_load_au ?? 0),
    session_count:     row.session_count ?? 0,
  }));
}

async function fetchTodayEvents(
  db: ReturnType<typeof supabaseAdmin>,
  athleteId: string,
  todayStr: string,
): Promise<CalendarEvent[]> {
  const { data } = await db
    .from('calendar_events')
    .select('*')
    .eq('athlete_id', athleteId)
    .gte('start_at', `${todayStr}T00:00:00`)
    .lt('start_at', `${todayStr}T23:59:59`)
    .order('start_at', { ascending: true });

  return (data ?? []) as unknown as CalendarEvent[];
}

async function fetchUpcomingEvents(
  db: ReturnType<typeof supabaseAdmin>,
  athleteId: string,
  fromDate: string,
  toDate: string,
): Promise<CalendarEvent[]> {
  const { data } = await db
    .from('calendar_events')
    .select('*')
    .eq('athlete_id', athleteId)
    .gte('start_at', `${fromDate}T00:00:00`)
    .lte('start_at', `${toDate}T23:59:59`)
    .order('start_at', { ascending: true });

  return (data ?? []) as unknown as CalendarEvent[];
}

async function fetchRecommendations(
  db: ReturnType<typeof supabaseAdmin>,
  athleteId: string,
  limit: number,
): Promise<ActiveRecommendation[]> {
  const { data } = await db
    .from('athlete_recommendations')
    .select('*')
    .eq('athlete_id', athleteId)
    .eq('status', 'ACTIVE')
    .order('priority', { ascending: true })
    .limit(limit);

  return (data ?? []) as unknown as ActiveRecommendation[];
}

async function fetchBenchmarkCache(
  db: ReturnType<typeof supabaseAdmin>,
  athleteId: string,
): Promise<BenchmarkProfile | null> {
  const { data } = await (db as any)
    .from('athlete_benchmark_cache')
    .select('*')
    .eq('athlete_id', athleteId)
    .single();

  if (!data) return null;

  return {
    overall_percentile: data.overall_percentile,
    strengths:          data.strengths ?? [],
    gaps:               data.gaps ?? [],
    results_json:       data.results_json ?? null,
    age_band:           data.age_band ?? null,
    position:           data.position ?? null,
    computed_at:        data.computed_at ?? new Date().toISOString(),
  };
}

async function fetchWeeklyDigest(
  db: ReturnType<typeof supabaseAdmin>,
  athleteId: string,
): Promise<WeeklyDigest | null> {
  const { data } = await (db as any)
    .from('athlete_weekly_digest')
    .select('*')
    .eq('athlete_id', athleteId)
    .order('iso_year', { ascending: false })
    .order('iso_week', { ascending: false })
    .limit(1)
    .single();

  if (!data) return null;

  return {
    iso_year:                 data.iso_year,
    iso_week:                 data.iso_week,
    total_training_load_au:   data.total_training_load_au != null ? Number(data.total_training_load_au) : null,
    session_count:            data.session_count,
    avg_hrv_ms:               data.avg_hrv_ms != null ? Number(data.avg_hrv_ms) : null,
    avg_sleep_hours:          data.avg_sleep_hours != null ? Number(data.avg_sleep_hours) : null,
    avg_energy:               data.avg_energy != null ? Number(data.avg_energy) : null,
    avg_soreness:             data.avg_soreness != null ? Number(data.avg_soreness) : null,
    wellness_trend:           data.wellness_trend,
    green_days:               data.green_days ?? 0,
    amber_days:               data.amber_days ?? 0,
    red_days:                 data.red_days ?? 0,
    hrv_trend_pct:            data.hrv_trend_pct != null ? Number(data.hrv_trend_pct) : null,
    load_trend_pct:           data.load_trend_pct != null ? Number(data.load_trend_pct) : null,
  };
}

async function fetchMonthlySummaries(
  db: ReturnType<typeof supabaseAdmin>,
  athleteId: string,
  count: number,
): Promise<MonthlySummary[]> {
  const { data } = await (db as any)
    .from('athlete_monthly_summary')
    .select('*')
    .eq('athlete_id', athleteId)
    .order('summary_month', { ascending: false })
    .limit(count);

  return (data ?? []).map((row: any) => ({
    summary_month:       row.summary_month,
    total_sessions:      row.total_sessions,
    avg_acwr:            row.avg_acwr != null ? Number(row.avg_acwr) : null,
    avg_hrv_ms:          row.avg_hrv_ms != null ? Number(row.avg_hrv_ms) : null,
    avg_sleep_hours:     row.avg_sleep_hours != null ? Number(row.avg_sleep_hours) : null,
    green_days:          row.green_days ?? 0,
    amber_days:          row.amber_days ?? 0,
    red_days:            row.red_days ?? 0,
    avg_readiness_score: row.avg_readiness_score,
    benchmark_snapshot:  row.benchmark_snapshot,
    cv_completeness:     row.cv_completeness,
    achievements:        row.achievements,
    phv_stage:           row.phv_stage,
    position:            row.position,
  }));
}

async function fetchLongitudinalMemory(
  db: ReturnType<typeof supabaseAdmin>,
  athleteId: string,
): Promise<string | null> {
  const { data } = await db
    .from('athlete_longitudinal_memory' as any)
    .select('memory_text')
    .eq('athlete_id', athleteId)
    .order('created_at', { ascending: false })
    .limit(5);

  if (!data || (data as any[]).length === 0) return null;

  return (data as any[]).map((m: any) => m.memory_text).join('\n\n');
}


// ============================================================================
// HELPERS
// ============================================================================

function defaultProfile(athleteId: string): AthleteProfile {
  return {
    athlete_id: athleteId,
    name:       'Athlete',
    sport:      null,
    position:   null,
    age_band:   null,
    phv_stage:  null,
    dob:        null,
    school_hours: null,
  };
}

/** Resolve multiple named promises, returning results keyed by name. */
async function resolveParallel(
  fetches: Record<string, Promise<unknown>>,
): Promise<Record<string, unknown>> {
  const keys = Object.keys(fetches);
  const promises = Object.values(fetches);
  const results = await Promise.allSettled(promises);

  const resolved: Record<string, unknown> = {};
  for (let i = 0; i < keys.length; i++) {
    const result = results[i];
    if (result.status === 'fulfilled') {
      resolved[keys[i]] = result.value;
    } else {
      console.error(`[getAthleteState] Fetch "${keys[i]}" failed:`, result.reason);
      resolved[keys[i]] = null;
    }
  }
  return resolved;
}

/** Date string N days ago from a YYYY-MM-DD string. */
function daysAgoStr(fromDate: string, days: number): string {
  const d = new Date(fromDate);
  d.setDate(d.getDate() - days);
  return d.toISOString().split('T')[0];
}

/** Date string N days forward from a YYYY-MM-DD string. */
function daysForwardStr(fromDate: string, days: number): string {
  const d = new Date(fromDate);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}
