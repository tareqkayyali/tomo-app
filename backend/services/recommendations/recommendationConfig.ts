/**
 * Recommendation Engine Config — Single source of truth for all tunable
 * parameters across guardrails, program refresh, and Own It recs.
 *
 * Reads from ui_config (key: "recommendation_engine") and merges onto
 * hardcoded defaults. If no DB row exists, all current hardcoded values
 * remain unchanged (zero-downtime).
 */

import { supabaseAdmin } from "@/lib/supabase/admin";

// ── Types ──

export interface GuardrailConfig {
  enabled: boolean;
  [key: string]: unknown;
}

export interface ACWRGuardrail extends GuardrailConfig {
  dangerThreshold: number;
  highThreshold: number;
  detrainingThreshold: number;
  dangerCap: number;
  highCap: number;
}

export interface ReadinessGuardrail extends GuardrailConfig {
  redCap: number;
  amberCap: number;
  redBlockedCategories: string[];
}

export interface HRVGuardrail extends GuardrailConfig {
  suppressedRatio: number;
  mildRatio: number;
  suppressedCap: number;
  mildCap: number;
}

export interface SleepGuardrail extends GuardrailConfig {
  poorThreshold: number;
  poorCap: number;
}

export interface DualLoadGuardrail extends GuardrailConfig {
  criticalThreshold: number;
  cap: number;
}

export interface AcademicLoadGuardrail extends GuardrailConfig {
  highThreshold: number;
  cap: number;
}

export interface InjuryRiskGuardrail extends GuardrailConfig {
  highCap: number;
  moderateCap: number;
}

export interface WellnessGuardrail extends GuardrailConfig {
  decliningAvgThreshold: number;
  cap: number;
}

export interface TrainingAgeGuardrail extends GuardrailConfig {
  beginnerWeeks: number;
  cap: number;
  blockedCategories: string[];
}

export interface MasteryBoostGuardrail extends GuardrailConfig {
  weakThreshold: number;
}

export interface OwnItRecConfig {
  stalenessHours: number;
  minCount: number;
  maxCount: number;
  minDiversity: number;
  checkinStalenessHours: number;
  staleConfidence: number;
  freshConfidence: number;
}

export interface ProgramRefreshConfig {
  stalenessHours: number;
  minPrograms: number;
  maxPrograms: number;
  mandatoryRange: [number, number];
  highRange: [number, number];
  mediumRange: [number, number];
}

export interface CustomAttribute {
  name: string;
  source: "snapshot" | "event" | "derived";
  fieldPath: string;
  threshold: number;
  action: "reduce_load" | "block_category" | "boost_priority";
  actionValue: string;
  enabled: boolean;
}

// ── Visual Rule Builder Types ──

export interface RuleCondition {
  field: string;
  operator: ">" | ">=" | "<" | "<=" | "=" | "!=";
  value: string | number;
}

export interface RuleAction {
  type: "reduce_load" | "block_category" | "boost_priority" | "log";
  value: string;
}

export interface Rule {
  id: string;
  name: string;
  emoji: string;
  enabled: boolean;
  builtIn: boolean;
  conditions: RuleCondition[];
  actions: RuleAction[];
}

export interface RecommendationEngineConfig {
  guardrails: {
    acwr: ACWRGuardrail;
    readiness: ReadinessGuardrail;
    hrv: HRVGuardrail;
    sleep: SleepGuardrail;
    dualLoad: DualLoadGuardrail;
    academicLoad: AcademicLoadGuardrail;
    injuryRisk: InjuryRiskGuardrail;
    wellness: WellnessGuardrail;
    trainingAge: TrainingAgeGuardrail;
    masteryBoost: MasteryBoostGuardrail;
  };
  ownItRec: OwnItRecConfig;
  programRefresh: ProgramRefreshConfig;
  customAttributes: CustomAttribute[];
  rules: Rule[];
}

// ── Pre-seeded Built-in Rules ──

export const BUILT_IN_RULES: Rule[] = [
  {
    id: "acwr_danger", name: "ACWR Danger Zone", emoji: "", enabled: true, builtIn: true,
    conditions: [{ field: "acwr", operator: ">", value: 1.5 }],
    actions: [
      { type: "reduce_load", value: "50" },
      { type: "log", value: "ACWR in danger zone — drastic load reduction to 50%" },
    ],
  },
  {
    id: "acwr_high", name: "ACWR High Zone", emoji: "", enabled: true, builtIn: true,
    conditions: [{ field: "acwr", operator: ">", value: 1.3 }],
    actions: [
      { type: "reduce_load", value: "70" },
      { type: "log", value: "ACWR elevated — moderate load reduction to 70%" },
    ],
  },
  {
    id: "readiness_red", name: "Readiness RED", emoji: "", enabled: true, builtIn: true,
    conditions: [{ field: "readinessRag", operator: "=", value: "RED" }],
    actions: [
      { type: "reduce_load", value: "50" },
      { type: "block_category", value: "sprint" },
      { type: "block_category", value: "power" },
      { type: "block_category", value: "plyometric" },
      { type: "log", value: "Readiness RED — max 50% load, high-intensity blocked" },
    ],
  },
  {
    id: "readiness_amber", name: "Readiness AMBER", emoji: "", enabled: true, builtIn: true,
    conditions: [{ field: "readinessRag", operator: "=", value: "AMBER" }],
    actions: [
      { type: "reduce_load", value: "75" },
      { type: "log", value: "Readiness AMBER — max 75% load" },
    ],
  },
  {
    id: "hrv_suppressed", name: "HRV Suppressed", emoji: "", enabled: true, builtIn: true,
    conditions: [{ field: "hrvRatio", operator: "<", value: 0.7 }],
    actions: [
      { type: "reduce_load", value: "60" },
      { type: "log", value: "HRV severely suppressed — autonomic stress, cap at 60%" },
    ],
  },
  {
    id: "hrv_mild", name: "HRV Mildly Suppressed", emoji: "", enabled: true, builtIn: true,
    conditions: [{ field: "hrvRatio", operator: "<", value: 0.85 }],
    actions: [
      { type: "reduce_load", value: "80" },
      { type: "log", value: "HRV slightly suppressed — cap at 80%" },
    ],
  },
  {
    id: "sleep_poor", name: "Poor Sleep", emoji: "", enabled: true, builtIn: true,
    conditions: [{ field: "sleepQuality", operator: "<", value: 5 }],
    actions: [
      { type: "reduce_load", value: "80" },
      { type: "log", value: "Poor sleep quality — reduce training volume by 20%" },
    ],
  },
  {
    id: "dual_load_high", name: "Dual Load High", emoji: "", enabled: true, builtIn: true,
    conditions: [{ field: "dualLoadIndex", operator: ">", value: 80 }],
    actions: [
      { type: "reduce_load", value: "70" },
      { type: "log", value: "Combined athletic + academic load high — cap at 70%" },
    ],
  },
  {
    id: "injury_risk_high", name: "Injury Risk High", emoji: "", enabled: true, builtIn: true,
    conditions: [{ field: "injuryRiskFlag", operator: "=", value: "high" }],
    actions: [
      { type: "reduce_load", value: "60" },
      { type: "log", value: "Injury risk HIGH — prioritize prevention, cap at 60%" },
    ],
  },
  {
    id: "training_age_beginner", name: "Training Age Beginner", emoji: "", enabled: true, builtIn: true,
    conditions: [{ field: "trainingAgeWeeks", operator: "<", value: 8 }],
    actions: [
      { type: "reduce_load", value: "70" },
      { type: "block_category", value: "power" },
      { type: "log", value: "Beginner — reduced volume, no advanced power exercises" },
    ],
  },
];

// ── Hardcoded Defaults (match current production values) ──

export const DEFAULTS: RecommendationEngineConfig = {
  guardrails: {
    acwr: {
      // Decommissioned April 2026: academic load (×0.4) was inflating ACWR
      // into danger/high zones without heavy training, biasing program
      // recommendations toward capped volume. Readiness RAG + CCRS carry
      // the safety logic now. Flip to true via CMS config or set env
      // ACWR_PROGRAM_GUARDRAIL_ENABLED=true to restore.
      enabled: false,
      dangerThreshold: 1.5,
      highThreshold: 1.3,
      detrainingThreshold: 0.8,
      dangerCap: 0.5,
      highCap: 0.7,
    },
    readiness: {
      enabled: true,
      redCap: 0.5,
      amberCap: 0.75,
      redBlockedCategories: ["sprint", "sled", "power", "plyometric"],
    },
    hrv: {
      enabled: true,
      suppressedRatio: 0.7,
      mildRatio: 0.85,
      suppressedCap: 0.6,
      mildCap: 0.8,
    },
    sleep: {
      enabled: true,
      poorThreshold: 5,
      poorCap: 0.8,
    },
    dualLoad: {
      enabled: true,
      criticalThreshold: 80,
      cap: 0.7,
    },
    academicLoad: {
      enabled: true,
      highThreshold: 70,
      cap: 0.8,
    },
    injuryRisk: {
      enabled: true,
      highCap: 0.6,
      moderateCap: 0.85,
    },
    wellness: {
      enabled: true,
      decliningAvgThreshold: 3,
      cap: 0.7,
    },
    trainingAge: {
      enabled: true,
      beginnerWeeks: 8,
      cap: 0.7,
      blockedCategories: ["power"],
    },
    masteryBoost: {
      enabled: true,
      weakThreshold: 40,
    },
  },
  ownItRec: {
    stalenessHours: 24,
    minCount: 4,
    maxCount: 6,
    minDiversity: 4,
    checkinStalenessHours: 24,
    staleConfidence: 0.5,
    freshConfidence: 0.9,
  },
  programRefresh: {
    stalenessHours: 24,
    minPrograms: 8,
    maxPrograms: 15,
    mandatoryRange: [3, 5],
    highRange: [3, 5],
    mediumRange: [2, 5],
  },
  customAttributes: [],
  rules: [...BUILT_IN_RULES],
};

// ── In-memory cache (TTL 5 min) ──

let cachedConfig: RecommendationEngineConfig | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

function deepMerge(target: any, source: any): any {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (
      source[key] !== null &&
      typeof source[key] === "object" &&
      !Array.isArray(source[key]) &&
      typeof target[key] === "object" &&
      !Array.isArray(target[key])
    ) {
      result[key] = deepMerge(target[key], source[key]);
    } else if (source[key] !== undefined) {
      result[key] = source[key];
    }
  }
  return result;
}

/**
 * Load recommendation engine config — merges DB overrides onto DEFAULTS.
 * Cached for 5 minutes to avoid excessive DB reads during event bursts.
 */
export async function getRecommendationConfig(): Promise<RecommendationEngineConfig> {
  const now = Date.now();
  if (cachedConfig && now - cachedAt < CACHE_TTL_MS) {
    return cachedConfig;
  }

  try {
    const db = supabaseAdmin();
    const { data } = await (db as any)
      .from("ui_config")
      .select("config_value")
      .eq("config_key", "recommendation_engine")
      .single();

    if (data?.config_value) {
      cachedConfig = deepMerge(DEFAULTS, data.config_value);
    } else {
      cachedConfig = { ...DEFAULTS };
    }
  } catch {
    // DB unavailable — use defaults
    cachedConfig = { ...DEFAULTS };
  }

  cachedAt = now;
  return cachedConfig!;
}

/**
 * Force-clear the cache (called after CMS save).
 */
export function clearRecommendationConfigCache(): void {
  cachedConfig = null;
  cachedAt = 0;
}
