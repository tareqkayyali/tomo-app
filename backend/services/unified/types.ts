/**
 * ════════════════════════════════════════════════════════════════════════════
 * UNIFIED ATHLETE STATE — Type Definitions
 * ════════════════════════════════════════════════════════════════════════════
 *
 * AthleteState is THE single object that every consumer in Tomo reads.
 * No consumer queries raw tables directly. No consumer computes its own
 * readiness or ACWR. Everything comes from this one object.
 *
 * ── 3-TAB ARCHITECTURE ──
 *
 *   Timeline (left)   → reads: todayEvents, upcomingEvents, snapshot.schedule
 *   AI Chat (center)  → reads: EVERYTHING (full context for coaching)
 *   Dashboard (right)  → reads: dailyVitals, benchmarkProfile, weeklyDigest,
 *                                activeRecommendations, snapshot.*, pdContext
 *
 * Each tab uses a consumer preset that only fetches the data it needs,
 * keeping response times fast for the lightweight tabs.
 * ══════════════════════════════════════════════════════════════════════════
 */

import type { PDContext } from '../pdil/types';
import type { TriangleRole } from '../events/types';

// ============================================================================
// OPTIONS — What to include in the response
// ============================================================================

/**
 * Consumer presets — named configurations for each tab.
 * Saves the consumer from specifying all options manually.
 *
 * 'timeline'  — Calendar + events (lightweight, fast)
 * 'chat'      — Full context: vitals, memory, RAG, events, benchmarks
 * 'dashboard' — Vitals, metrics, programs, progress, recommendations
 * 'boot'      — Initial app load (covers all tabs, cached on device)
 * 'event'     — After an event is processed (triggers PDIL re-evaluation)
 */
export type ConsumerPreset = 'timeline' | 'chat' | 'dashboard' | 'boot' | 'event';

export interface GetAthleteStateOptions {
  /** Role of the requesting user (filters snapshot visibility) */
  role: TriangleRole;

  /** Consumer preset — auto-configures all options below */
  preset?: ConsumerPreset;

  /** Number of daily vitals days to include (default: 7) */
  vitalsWindowDays?: number;

  /** Include calendar events (default: true) */
  includeCalendar?: boolean;

  /** Days forward for calendar events (default: 7) */
  calendarForwardDays?: number;

  /** Include active recommendations (default: true) */
  includeRecommendations?: boolean;

  /** Max recommendations to return (default: 5) */
  recLimit?: number;

  /** Include benchmark profile (default: true) */
  includeBenchmarks?: boolean;

  /** Include weekly digest (default: true) */
  includeWeeklyDigest?: boolean;

  /** Include monthly summaries for progress arc/CV (default: false) */
  includeMonthly?: boolean;

  /** Number of monthly summaries to return (default: 6) */
  monthlyCount?: number;

  /** Include longitudinal memory for AI (default: false) */
  includeMemory?: boolean;

  /** Include RAG chunks for AI (default: false) */
  includeRag?: boolean;

  /** RAG query string for embedding search */
  ragQuery?: string;

  /** What triggered this state read (for PDIL audit) */
  trigger?: 'boot' | 'chat' | 'event' | 'screen' | 'test' | 'refresh';

  /** Source event ID if triggered by an event */
  sourceEventId?: string;
}


// ============================================================================
// PRESET DEFINITIONS
// ============================================================================

/**
 * Preset configurations — applied when `preset` is set.
 * Individual options can still override preset values.
 */
export const CONSUMER_PRESETS: Record<ConsumerPreset, Partial<GetAthleteStateOptions>> = {
  timeline: {
    vitalsWindowDays:         1,        // Only need today
    includeCalendar:          true,
    calendarForwardDays:      14,       // 2 weeks ahead
    includeRecommendations:   false,
    includeBenchmarks:        false,
    includeWeeklyDigest:      false,
    includeMonthly:           false,
    includeMemory:            false,
    includeRag:               false,
    trigger:                  'screen',
  },

  chat: {
    vitalsWindowDays:         7,        // Full week for context
    includeCalendar:          true,
    calendarForwardDays:      7,
    includeRecommendations:   true,
    recLimit:                 5,
    includeBenchmarks:        true,
    includeWeeklyDigest:      true,
    includeMonthly:           false,    // Chat rarely needs monthly
    includeMemory:            true,     // Cross-session memory
    includeRag:               true,     // Knowledge retrieval
    trigger:                  'chat',
  },

  dashboard: {
    vitalsWindowDays:         7,        // Week of vitals for charts
    includeCalendar:          true,
    calendarForwardDays:      3,        // Next few days
    includeRecommendations:   true,
    recLimit:                 6,
    includeBenchmarks:        true,
    includeWeeklyDigest:      true,
    includeMonthly:           true,     // Progress arc
    monthlyCount:             6,
    includeMemory:            false,
    includeRag:               false,
    trigger:                  'screen',
  },

  boot: {
    vitalsWindowDays:         7,
    includeCalendar:          true,
    calendarForwardDays:      7,
    includeRecommendations:   true,
    recLimit:                 5,
    includeBenchmarks:        true,
    includeWeeklyDigest:      true,
    includeMonthly:           false,    // Lazy-loaded by dashboard
    includeMemory:            false,
    includeRag:               false,
    trigger:                  'boot',
  },

  event: {
    vitalsWindowDays:         1,
    includeCalendar:          true,
    calendarForwardDays:      3,
    includeRecommendations:   false,    // Recs computed separately
    includeBenchmarks:        false,
    includeWeeklyDigest:      false,
    includeMonthly:           false,
    includeMemory:            false,
    includeRag:               false,
    trigger:                  'event',
  },
};


// ============================================================================
// ATHLETE STATE — The output
// ============================================================================

/**
 * Daily vitals row — one per day, source-resolved.
 */
export interface DailyVitals {
  vitals_date:      string;
  hrv_morning_ms:   number | null;
  resting_hr_bpm:   number | null;
  sleep_hours:      number | null;
  sleep_quality:    number | null;
  energy:           number | null;
  soreness:         number | null;
  mood:             number | null;
  academic_stress:  number | null;
  pain_flag:        boolean;
  readiness_score:  number | null;
  readiness_rag:    string | null;
  intensity_cap:    string | null;
  directive_text:   string | null;
  sources_resolved: Record<string, string>;
}

/**
 * Weekly digest — 7-day aggregates.
 */
export interface WeeklyDigest {
  iso_year:                 number;
  iso_week:                 number;
  total_training_load_au:   number | null;
  session_count:            number | null;
  avg_hrv_ms:               number | null;
  avg_sleep_hours:          number | null;
  avg_energy:               number | null;
  avg_soreness:             number | null;
  wellness_trend:           string | null;
  green_days:               number;
  amber_days:               number;
  red_days:                 number;
  hrv_trend_pct:            number | null;
  load_trend_pct:           number | null;
}

/**
 * Monthly summary — for progress arc and CV.
 */
export interface MonthlySummary {
  summary_month:           string;
  total_sessions:          number | null;
  avg_acwr:                number | null;
  avg_hrv_ms:              number | null;
  avg_sleep_hours:         number | null;
  green_days:              number;
  amber_days:              number;
  red_days:                number;
  avg_readiness_score:     number | null;
  benchmark_snapshot:      Record<string, unknown> | null;
  cv_completeness:         number | null;
  achievements:            unknown[] | null;
  phv_stage:               string | null;
  position:                string | null;
}

/**
 * Benchmark profile (cached).
 */
export interface BenchmarkProfile {
  overall_percentile:   number | null;
  strengths:            string[];
  gaps:                 string[];
  results_json:         Record<string, unknown> | null;
  age_band:             string | null;
  position:             string | null;
  computed_at:          string;
}

/**
 * Calendar event (simplified for state).
 */
export interface CalendarEvent {
  event_id:     string;
  title:        string;
  event_type:   string;
  start_at:     string;
  end_at:       string | null;
  category?:    string;
  intensity?:   string;
  [key: string]: unknown;
}

/**
 * Active recommendation.
 */
export interface ActiveRecommendation {
  recommendation_id: string;
  title:             string;
  body:              string;
  priority:          string;
  category:          string;
  status:            string;
  created_at:        string;
  [key: string]: unknown;
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * AthleteState — THE single object every consumer reads.
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Contains:
 *   - snapshot:     Pre-computed Layer 2 state (role-filtered)
 *   - profile:      Basic athlete profile (name, sport, position, age)
 *   - dailyVitals:  Source-resolved daily readings (last N days)
 *   - dailyLoad:    Training load per day (for ACWR context)
 *   - weeklyDigest: 7-day aggregates (trends, averages)
 *   - monthlySummaries: Monthly aggregates (progress arc, CV)
 *   - benchmarkProfile: Cached benchmark percentiles
 *   - todayEvents:  Calendar events for today
 *   - upcomingEvents: Calendar events for next N days
 *   - activeRecommendations: Current Own It recs
 *   - pdContext:    PDIL decisions (training modifiers, rec guardrails, AI context)
 *   - longitudinalMemory: Cross-session AI memory (AI-only)
 *   - ragChunks:    Knowledge chunks (AI-only)
 *   - timezone:     Athlete's timezone
 *   - stateAt:      ISO timestamp of computation
 */
export interface AthleteState {
  // Core identity
  snapshot:               Record<string, unknown>;
  profile:                AthleteProfile;

  // Daily data
  dailyVitals:            DailyVitals[];
  dailyLoad:              Array<{ load_date: string; training_load_au: number; academic_load_au: number; session_count: number }>;

  // Aggregates
  weeklyDigest:           WeeklyDigest | null;
  monthlySummaries:       MonthlySummary[];

  // Benchmarks
  benchmarkProfile:       BenchmarkProfile | null;

  // Calendar
  todayEvents:            CalendarEvent[];
  upcomingEvents:         CalendarEvent[];

  // Recommendations
  activeRecommendations:  ActiveRecommendation[];

  // ── PDIL: Performance Director decisions ──
  pdContext:              PDContext;

  // AI-only (not included for non-AI consumers)
  longitudinalMemory?:    string;
  ragChunks?:             Array<{ content: string; metadata: Record<string, unknown> }>;

  // Meta
  timezone:               string;
  stateAt:                string;
}

/**
 * Basic athlete profile — lightweight, always included.
 */
export interface AthleteProfile {
  athlete_id:     string;
  name:           string;
  sport:          string | null;
  position:       string | null;
  age_band:       string | null;
  phv_stage:      string | null;
  dob:            string | null;
  school_hours:   number | null;
}
