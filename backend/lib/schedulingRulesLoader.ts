/**
 * Scheduling Rules Loader
 * ───────────────────────
 * Single entry point for reading the CMS-managed scheduling rules row
 * (`public.scheduling_rules`, migration 047). Callers that used to pull
 * values from the hardcoded `DEFAULT_CONFIG` in services/schedulingEngine.ts
 * now call `getActiveSchedulingConfig()` instead.
 *
 * Design:
 *  - 60s in-memory cache (process-local). Rule changes are rare and a
 *    short cache avoids hammering the DB on every /suggest-slots call.
 *  - Graceful fallback: if the DB read fails for any reason, we log and
 *    return `FALLBACK_CONFIG`, which is a copy of the pre-migration
 *    hardcoded defaults. The scheduling engine must always have a config
 *    to run — never throw up here.
 *  - `invalidateSchedulingRulesCache()` is called by the PATCH admin
 *    route so an edit takes effect immediately.
 */

import { supabaseAdmin } from "@/lib/supabase/admin";

// ── Types ────────────────────────────────────────────────────────

export interface SchedulingRulesConfig {
  buffers: {
    default: number;
    afterHighIntensity: number;
    afterMatch: number;
    beforeMatch: number;
  };
  dayWindow: {
    startHour: number;
    endHour: number;
  };
  preferredTrainingWindow: {
    startMin: number;
    endMin: number;
  };
  limits: {
    maxSessionsPerDay: number;
    noHardOnExamDay: boolean;
    intensityCapOnExamDays: string;
  };
  priority: {
    normal: string[];
    leagueActive: string[];
    examPeriod: string[];
    leagueExam: string[];
  };
}

// ── Fallback (identical to pre-migration hardcoded defaults) ─────

export const FALLBACK_CONFIG: SchedulingRulesConfig = {
  buffers: {
    default: 30,
    afterHighIntensity: 90,
    afterMatch: 240,
    beforeMatch: 120,
  },
  dayWindow: { startHour: 6, endHour: 22 },
  preferredTrainingWindow: { startMin: 930, endMin: 1140 },
  limits: {
    maxSessionsPerDay: 3,
    noHardOnExamDay: true,
    intensityCapOnExamDays: "LIGHT",
  },
  priority: {
    normal: ["school", "exam", "match", "recovery", "club", "gym", "study", "personal"],
    leagueActive: ["school", "match", "recovery", "exam", "club", "gym", "study", "personal"],
    examPeriod: ["school", "exam", "recovery", "study", "match", "club", "gym", "personal"],
    leagueExam: ["school", "match", "exam", "recovery", "study", "club", "gym", "personal"],
  },
};

// ── Cache ────────────────────────────────────────────────────────

const CACHE_TTL_MS = 60_000; // 60 seconds
let cachedConfig: SchedulingRulesConfig | null = null;
let cachedAt = 0;

export function invalidateSchedulingRulesCache(): void {
  cachedConfig = null;
  cachedAt = 0;
}

// ── Loader ───────────────────────────────────────────────────────

/**
 * Merge a partial config from DB onto FALLBACK_CONFIG so new fields we
 * add in the future don't crash old rows that predate them.
 */
function mergeWithFallback(dbConfig: Record<string, unknown>): SchedulingRulesConfig {
  const fallback = FALLBACK_CONFIG;
  return {
    buffers: { ...fallback.buffers, ...(dbConfig.buffers as object || {}) },
    dayWindow: { ...fallback.dayWindow, ...(dbConfig.dayWindow as object || {}) },
    preferredTrainingWindow: {
      ...fallback.preferredTrainingWindow,
      ...(dbConfig.preferredTrainingWindow as object || {}),
    },
    limits: { ...fallback.limits, ...(dbConfig.limits as object || {}) },
    priority: { ...fallback.priority, ...(dbConfig.priority as object || {}) },
  };
}

export async function getActiveSchedulingConfig(): Promise<SchedulingRulesConfig> {
  const now = Date.now();
  if (cachedConfig && now - cachedAt < CACHE_TTL_MS) {
    return cachedConfig;
  }

  try {
    const db = supabaseAdmin();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (db as any)
      .from("scheduling_rules")
      .select("config")
      .eq("is_active", true)
      .maybeSingle();

    if (error || !data?.config) {
      if (error) {
        console.warn("[schedulingRulesLoader] DB read failed, using fallback:", error.message);
      }
      cachedConfig = FALLBACK_CONFIG;
      cachedAt = now;
      return FALLBACK_CONFIG;
    }

    const merged = mergeWithFallback(data.config as Record<string, unknown>);
    cachedConfig = merged;
    cachedAt = now;
    return merged;
  } catch (err) {
    console.error("[schedulingRulesLoader] unexpected error, using fallback:", err);
    cachedConfig = FALLBACK_CONFIG;
    cachedAt = now;
    return FALLBACK_CONFIG;
  }
}
