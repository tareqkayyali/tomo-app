/**
 * Performance Intelligence Service — CMS-driven config for sport coaching context,
 * PHV safety, readiness decision matrix, and AI prompt templates.
 *
 * Pattern: DB overrides merged onto hardcoded defaults with 5-min cache.
 * Follows the same architecture as recommendationConfig.ts.
 */

import { supabaseAdmin } from "@/lib/supabase/admin";
import type {
  SportCoachingContext,
  PHVSafetyConfig,
  ReadinessDecisionMatrix,
  AIPromptTemplates,
} from "@/lib/validation/performanceIntelligenceSchemas";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => supabaseAdmin() as any;

// ── Cache ──

const CACHE_TTL_MS = 5 * 60 * 1000;

interface CacheEntry<T> {
  data: T;
  fetchedAt: number;
}

const cache: {
  sportContext: CacheEntry<SportCoachingContext> | null;
  phvSafety: CacheEntry<PHVSafetyConfig> | null;
  readinessMatrix: CacheEntry<ReadinessDecisionMatrix> | null;
  promptTemplates: CacheEntry<AIPromptTemplates> | null;
} = {
  sportContext: null,
  phvSafety: null,
  readinessMatrix: null,
  promptTemplates: null,
};

function isFresh<T>(entry: CacheEntry<T> | null): entry is CacheEntry<T> {
  return !!entry && Date.now() - entry.fetchedAt < CACHE_TTL_MS;
}

// ── Deep Merge ──

function deepMerge<T extends Record<string, unknown>>(defaults: T, overrides: Partial<T>): T {
  const result = { ...defaults };
  for (const key of Object.keys(overrides) as (keyof T)[]) {
    const val = overrides[key];
    if (val !== undefined && val !== null) {
      if (
        typeof val === "object" &&
        !Array.isArray(val) &&
        typeof result[key] === "object" &&
        !Array.isArray(result[key])
      ) {
        result[key] = deepMerge(
          result[key] as Record<string, unknown>,
          val as Record<string, unknown>
        ) as T[keyof T];
      } else {
        result[key] = val as T[keyof T];
      }
    }
  }
  return result;
}

// ── DB Reader ──

async function readConfig<T>(key: string): Promise<T | null> {
  try {
    const { data, error } = await db()
      .from("ui_config")
      .select("config_value")
      .eq("config_key", key)
      .single();
    if (error || !data) return null;
    return data.config_value as T;
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════
// DEFAULTS — extracted from current hardcoded values
// ═══════════════════════════════════════════════════════════════

export const SPORT_COACHING_DEFAULTS: SportCoachingContext = {
  football: {
    keyMetrics: "Yo-Yo IR1, 10m/30m sprint, CMJ, agility T-test",
    loadFramework: "ACWR model: 7:28 rolling. Training units/week, match = 1.0 AU reference. Monitor ACWR sweet spot 0.8–1.3.",
    positionNotes: {
      goalkeeper: "Lower running volume, higher explosive demand. Prioritize reaction time, diving mechanics, distribution.",
      striker: "High-intensity sprint frequency. Prioritize acceleration, finishing under fatigue, 1v1 situations.",
      forward: "High-intensity sprint frequency. Prioritize acceleration, finishing under fatigue, 1v1 situations.",
      midfielder: "Highest total distance covered. Prioritize aerobic base, repeated sprint ability, passing under pressure.",
      defender: "High aerial duel frequency. Prioritize strength, heading technique, recovery speed.",
      "centre-back": "High aerial duel frequency. Prioritize strength, heading technique, recovery speed.",
    },
  },
  padel: {
    keyMetrics: "Reaction time (BlazePods), lateral movement speed, court coverage, wrist/forearm loading",
    loadFramework: "Match density + training volume. Rally length and court movement patterns drive load. Watch for shoulder and wrist overuse patterns.",
    positionNotes: {
      drive: "Aggressive baseline play. Monitor wrist/elbow loading from repeated drives.",
      "revés": "Higher rotational demand. Monitor core and oblique fatigue.",
      backhand: "Higher rotational demand. Monitor core and oblique fatigue.",
    },
  },
  athletics: {
    keyMetrics: "Event-specific benchmarks, sprint mechanics (contact time, flight time), jump testing",
    loadFramework: "High-CNS cost per quality session. Monitor inter-session recovery carefully.",
    positionNotes: {
      sprints: "Maximal neuromuscular demand. 48-72h between quality sprint sessions.",
      throws: "High power/strength demand. Monitor shoulder and back loading.",
      jumps: "High impact loading. Monitor ankle/knee stress, especially during growth phases.",
    },
  },
  basketball: {
    keyMetrics: "Vertical jump, agility, sprint, court coverage",
    loadFramework: "ACWR for practice + game load. Game count per week drives weekly load. Practice intensity varies by phase.",
    positionNotes: {},
  },
  tennis: {
    keyMetrics: "Lateral movement speed, serve velocity, rally endurance",
    loadFramework: "Match frequency + practice volume. Monitor shoulder/elbow loading for serve-dominant players.",
    positionNotes: {},
  },
};

export const PHV_SAFETY_DEFAULTS: PHVSafetyConfig = {
  stages: [
    {
      name: "pre_phv",
      offsetMin: -99,
      offsetMax: -1.0,
      loadingMultiplier: 0.7,
      trainingPriorities: [
        "Movement quality and coordination",
        "Fundamental movement skills (FMS)",
        "Speed — neural development window",
        "Agility and change of direction",
        "Enjoyment and varied sport exposure",
      ],
      safetyWarnings: [
        "Avoid maximal strength loading (>85% 1RM)",
        "Limit repetitive impact (long-distance running)",
        "Monitor growth plate areas during resistance exercises",
      ],
    },
    {
      name: "mid_phv",
      offsetMin: -1.0,
      offsetMax: 1.0,
      loadingMultiplier: 0.6,
      trainingPriorities: [
        "Flexibility and mobility — critical during growth spurt",
        "Core stability and postural control",
        "Reduced plyometric volume",
        "Technique maintenance (not progression)",
        "Recovery and sleep optimization",
      ],
      safetyWarnings: [
        "NO maximal loading — risk of growth plate injury is elevated",
        "NO heavy barbell squats or deadlifts",
        "Reduce plyometric volume by 40%+",
        "Modified Nordic protocol only (partial range)",
        "Monitor for Osgood-Schlatter and Sever's disease symptoms",
        "Increased injury risk — reduced coordination during rapid growth",
        "Watch for knee/heel pain — stop immediately if present",
      ],
    },
    {
      name: "post_phv",
      offsetMin: 1.0,
      offsetMax: 99,
      loadingMultiplier: 0.85,
      trainingPriorities: [
        "Gradual reintroduction of strength loading",
        "Hypertrophy window — muscle responds well to training",
        "Power development (force × velocity)",
        "Sport-specific conditioning",
        "Progressive plyometric loading",
      ],
      safetyWarnings: [
        "Progress load gradually — tendons still adapting",
        "Monitor training load closely (ACWR 0.8-1.3)",
        "Full range Nordic curls can resume with progression",
      ],
    },
    {
      name: "not_applicable",
      offsetMin: -99,
      offsetMax: 99,
      loadingMultiplier: 1.0,
      trainingPriorities: [
        "Standard periodized training",
        "Progressive overload",
      ],
      safetyWarnings: [],
    },
  ],
  contraindications: [
    {
      pattern: "\\bbarbell\\s*(back\\s*)?squats?\\b",
      blocked: "Barbell back squat",
      alternative: "Goblet squat (bodyweight or light KB, 3x10)",
      why: "Axial spinal loading during mid-PHV compresses lumbar growth plates at peak vulnerability",
      mechanism: "L1-L5 vertebral endplates are cartilaginous and not yet ossified — compressive load risks Scheuermann's disease",
      progression: "Safe to reintroduce at reduced intensity ~18 months post-PHV peak",
      citation: "Lloyd & Oliver, JSCR 2012",
      applicableStages: ["mid_phv"],
    },
    {
      pattern: "\\bdepth\\s*jumps?\\b",
      blocked: "Depth jumps",
      alternative: "Low box step-downs (20-30cm, 3x8 each leg)",
      why: "High eccentric ground reaction forces at the knee exceed growth plate tolerance during mid-PHV",
      mechanism: "Proximal tibial and distal femoral growth plates absorb 4-7x bodyweight on landing",
      progression: "Safe when growth velocity drops below 4cm/year",
      citation: "Myer et al., BJSM 2011",
      applicableStages: ["mid_phv"],
    },
    {
      pattern: "\\bdrop\\s*jumps?\\b",
      blocked: "Drop jumps",
      alternative: "Pogo hops (low amplitude, 3x10)",
      why: "Rapid eccentric-concentric coupling at high impact loads stresses growth plates beyond safe threshold",
      mechanism: "Calcaneal and tibial apophyses at risk",
      progression: "Safe when growth velocity drops below 4cm/year",
      citation: "Myer et al., BJSM 2011",
      applicableStages: ["mid_phv"],
    },
    {
      pattern: "\\bolympic\\s*lifts?\\b",
      blocked: "Olympic lifts",
      alternative: "Dumbbell hang pull (light, 3x8) or kettlebell swing",
      why: "Complex loaded movements with high spinal compression and catch impact exceed mid-PHV structural tolerance",
      mechanism: "Vertebral endplates + wrist/elbow growth plates under combined axial and shear loading",
      progression: "Introduce technique-only (PVC pipe) now; add load post-PHV",
      citation: "Faigenbaum & Myer, JSCR 2010",
      applicableStages: ["mid_phv"],
    },
    {
      pattern: "\\b(clean\\s*and\\s*jerk|snatch|power\\s*clean)\\b",
      blocked: "Clean & jerk / Snatch / Power clean",
      alternative: "Medicine ball throws or dumbbell hang pull (light)",
      why: "High-velocity loaded movements create peak spinal compression during the catch phase",
      mechanism: "Vertebral endplates + wrist growth plates under combined axial and shear loading",
      progression: "Introduce technique-only now; add load post-PHV",
      citation: "Faigenbaum & Myer, JSCR 2010",
      applicableStages: ["mid_phv"],
    },
    {
      pattern: "\\bmaximal\\s*sprint",
      blocked: "Maximal sprinting",
      alternative: "Submaximal sprints (85% effort, 3x30m)",
      why: "Peak muscle force during maximal sprints can cause apophyseal avulsion at hamstring and hip flexor insertions",
      mechanism: "Ischial tuberosity and ASIS apophyses are vulnerable during rapid lengthening under max force",
      progression: "Gradual return to 90-95% effort as growth velocity declines",
      citation: "Read et al., Sports Med 2016",
      applicableStages: ["mid_phv"],
    },
    {
      pattern: "\\bheavy\\s*deadlifts?\\b",
      blocked: "Heavy deadlifts",
      alternative: "Romanian deadlift (light dumbbell, 3x10)",
      why: "Heavy axial loading through the spine stresses lumbar growth plates during peak growth",
      mechanism: "L4-L5 endplates under compressive load",
      progression: "Light trap-bar deadlift OK at PHV offset +1 year",
      citation: "Lloyd & Oliver, JSCR 2012",
      applicableStages: ["mid_phv"],
    },
    {
      pattern: "\\bloaded\\s*plyometric",
      blocked: "Loaded plyometrics",
      alternative: "Bodyweight plyometrics (box jumps <30cm, 2x6)",
      why: "Adding external load to plyometric movements multiplies ground reaction forces beyond growth plate tolerance",
      mechanism: "Tibial and calcaneal growth plates under compressive + shear stress",
      progression: "Light weighted vest OK post-PHV",
      citation: "Myer et al., BJSM 2011",
      applicableStages: ["mid_phv"],
    },
    {
      pattern: "\\bbox\\s*jumps?\\s*(high|max|above\\s*\\d{2})",
      blocked: "High box jumps",
      alternative: "Low box jumps (20-30cm max, focus on landing mechanics)",
      why: "Height increases landing impact force exponentially — growth plates cannot absorb the load",
      mechanism: "Calcaneal apophysis (Sever's) and proximal tibia at risk",
      progression: "Increase box height 5cm at a time post-PHV, monitoring for pain",
      citation: "Myer et al., BJSM 2011",
      applicableStages: ["mid_phv"],
    },
  ],
  monitoringAlerts: [
    {
      condition: "Osgood-Schlatter disease",
      description: "Inflammation of the tibial tuberosity growth plate",
      symptoms: "Knee pain below kneecap, swelling, tenderness at tibial tuberosity",
      action: "Stop all jumping and kneeling activities. Refer to sports physio. Ice after activity.",
      triggerStages: ["mid_phv", "pre_phv"],
    },
    {
      condition: "Sever's disease",
      description: "Inflammation of the calcaneal growth plate",
      symptoms: "Heel pain during/after running or jumping, worse in cleats",
      action: "Reduce running volume. Heel cups in shoes. Avoid barefoot training on hard surfaces.",
      triggerStages: ["mid_phv", "pre_phv"],
    },
  ],
};

export const READINESS_MATRIX_DEFAULTS: ReadinessDecisionMatrix = {
  rules: [
    {
      id: "red_mid_phv",
      condition: { readinessRag: "RED", additionalFactors: [{ field: "phvStage", operator: "=", value: "mid_phv" }] },
      priority: 1,
      title: "Rest Day — Growth Phase",
      titleNoTraining: "Recovery Day — Growth Phase",
      bodyShort: "Your body is recovering and growing. Take a full rest day today.",
      bodyShortNoTraining: "Good call resting today. Your body is in a growth phase — prioritise sleep and nutrition.",
    },
    {
      id: "red_default",
      condition: { readinessRag: "RED", additionalFactors: [] },
      priority: 1,
      title: "Rest Day Recommended",
      titleNoTraining: "Good Day to Rest",
      bodyShort: "Your body needs recovery today. Take it easy and focus on rest.",
      bodyShortNoTraining: "No training today — your body will thank you. Focus on sleep and hydration.",
    },
    {
      id: "amber_high_acwr",
      condition: { readinessRag: "AMBER", additionalFactors: [{ field: "acwr", operator: ">", value: 1.3 }] },
      priority: 1,
      title: "High Load + Low Readiness",
      titleNoTraining: "Rest Day Helping You Recover",
      bodyShort: "Your training load is high and readiness is below normal. Reduce intensity today.",
      bodyShortNoTraining: "Rest day is helping you recover from high training load.",
    },
    {
      id: "amber_default",
      condition: { readinessRag: "AMBER", additionalFactors: [] },
      priority: 2,
      title: "Light Session Suggested",
      titleNoTraining: "Moderate Day — Stay Active",
      bodyShort: "You're not at your best today. Keep training light to moderate.",
      bodyShortNoTraining: "No training today — some light movement like a walk will keep you feeling good.",
    },
    {
      id: "green_mid_phv",
      condition: { readinessRag: "GREEN", additionalFactors: [{ field: "phvStage", operator: "=", value: "mid_phv" }] },
      priority: 2,
      title: "Ready but Modified",
      titleNoTraining: "Ready — Modified Rest Day",
      bodyShort: "You're feeling good but still in a growth phase. Train with modified intensity.",
      bodyShortNoTraining: "Rest day — your body is ready but load is modified during growth phase.",
    },
    {
      id: "green_default",
      condition: { readinessRag: "GREEN", additionalFactors: [] },
      priority: 3,
      title: "Ready for High Intensity",
      titleNoTraining: "Ready — Rest Day Well Spent",
      bodyShort: "You're at your best. Go for it today!",
      bodyShortNoTraining: "No training today, but you're in great shape. Enjoy the rest.",
    },
  ],
  confidenceThresholds: {
    fresh: 0.9,
    wearableOnly: 0.7,
    stale: 0.5,
  },
  stalenessHours: 24,
};

export const PROMPT_TEMPLATES_DEFAULTS: AIPromptTemplates = {
  blocks: [
    {
      id: "sport_context",
      name: "Sport & Position Context",
      template: "Sport: {{sport}}. Position: {{position}}.\nKey performance metrics: {{keyMetrics}}\nLoad framework: {{loadFramework}}\n{{positionNote}}",
      enabled: true,
      sortOrder: 1,
      description: "Injected sport-specific coaching context with position notes",
    },
    {
      id: "phv_safety",
      name: "PHV Safety Block",
      template: "PHV SAFETY — ATHLETE IS {{phvStage}} (loading multiplier {{loadingMultiplier}}×):\n{{contraindications}}\nALWAYS proactively suggest the safe alternative. Never prescribe a contraindicated exercise.",
      enabled: true,
      sortOrder: 2,
      description: "Growth stage safety warnings and exercise contraindications (only injected for mid-PHV)",
    },
    {
      id: "behavioral_profile",
      name: "Behavioral Profile",
      template: "Athlete behavioral profile: {{archetype}}. Compliance rate: {{complianceRate}}. Recovery response: {{recoveryResponse}}.",
      enabled: true,
      sortOrder: 3,
      description: "Athlete's behavioral fingerprint and coaching approach",
    },
    {
      id: "triangle_intelligence",
      name: "Triangle Intelligence",
      template: "Current state — Readiness: {{readinessRag}} ({{readinessScore}}/100). Wellness: {{wellnessTrend}} (7d avg: {{wellness7dayAvg}}). Load: ACWR {{acwr}} (ATL: {{atl7day}}, CTL: {{ctl28day}}).",
      enabled: true,
      sortOrder: 4,
      description: "Physical readiness, mental wellness, and contextual load triangle",
    },
    {
      id: "active_recommendations",
      name: "Active Recommendations",
      template: "Active recommendations you must respect:\n{{recommendations}}",
      enabled: true,
      sortOrder: 5,
      description: "Top P1-P2 recommendations from the last 24h",
    },
    {
      id: "dual_load",
      name: "Dual Load Adaptation",
      template: "Academic-athletic balance: Dual load index {{dualLoadIndex}}/100. {{examContext}}",
      enabled: true,
      sortOrder: 6,
      description: "School schedule context, exam proximity, academic stress",
    },
  ],
};

// ═══════════════════════════════════════════════════════════════
// Getters (DB + defaults + cache)
// ═══════════════════════════════════════════════════════════════

export async function getSportCoachingConfig(): Promise<SportCoachingContext> {
  if (isFresh(cache.sportContext)) return cache.sportContext.data;
  const dbVal = await readConfig<SportCoachingContext>("sport_coaching_context");
  const merged = dbVal ? deepMerge(SPORT_COACHING_DEFAULTS, dbVal) : SPORT_COACHING_DEFAULTS;
  cache.sportContext = { data: merged, fetchedAt: Date.now() };
  return merged;
}

export async function getPHVSafetyConfig(): Promise<PHVSafetyConfig> {
  if (isFresh(cache.phvSafety)) return cache.phvSafety.data;
  const dbVal = await readConfig<PHVSafetyConfig>("phv_safety_config");
  // For arrays (stages, contraindications), DB fully replaces defaults
  const merged = dbVal ?? PHV_SAFETY_DEFAULTS;
  cache.phvSafety = { data: merged, fetchedAt: Date.now() };
  return merged;
}

export async function getReadinessMatrixConfig(): Promise<ReadinessDecisionMatrix> {
  if (isFresh(cache.readinessMatrix)) return cache.readinessMatrix.data;
  const dbVal = await readConfig<ReadinessDecisionMatrix>("readiness_decision_matrix");
  const merged = dbVal ?? READINESS_MATRIX_DEFAULTS;
  cache.readinessMatrix = { data: merged, fetchedAt: Date.now() };
  return merged;
}

export async function getPromptTemplatesConfig(): Promise<AIPromptTemplates> {
  if (isFresh(cache.promptTemplates)) return cache.promptTemplates.data;
  const dbVal = await readConfig<AIPromptTemplates>("ai_prompt_templates");
  const merged = dbVal ?? PROMPT_TEMPLATES_DEFAULTS;
  cache.promptTemplates = { data: merged, fetchedAt: Date.now() };
  return merged;
}

// ── Cache Clear ──

export function clearSportCoachingCache() { cache.sportContext = null; }
export function clearPHVSafetyCache() { cache.phvSafety = null; }
export function clearReadinessMatrixCache() { cache.readinessMatrix = null; }
export function clearPromptTemplatesCache() { cache.promptTemplates = null; }
export function clearAllPerformanceIntelligenceCache() {
  cache.sportContext = null;
  cache.phvSafety = null;
  cache.readinessMatrix = null;
  cache.promptTemplates = null;
}

// ── Flow Overview Stats ──

export async function getFlowOverviewStats() {
  const [sport, phv, readiness, prompts] = await Promise.all([
    getSportCoachingConfig(),
    getPHVSafetyConfig(),
    getReadinessMatrixConfig(),
    getPromptTemplatesConfig(),
  ]);

  return {
    sportsConfigured: Object.keys(sport).length,
    phvStages: phv.stages.length,
    contraindications: phv.contraindications.length,
    monitoringAlerts: phv.monitoringAlerts.length,
    readinessRules: readiness.rules.length,
    promptBlocks: prompts.blocks.length,
    enabledPromptBlocks: prompts.blocks.filter((b) => b.enabled).length,
  };
}
