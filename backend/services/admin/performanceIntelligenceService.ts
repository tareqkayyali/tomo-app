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
    seasonPhase: "in_season",
    matchLoadUnit: 1.0,
    positions: [
      { id: "goalkeeper", name: "Goalkeeper", aerobicPriority: 4, strengthPriority: 7, notes: "Lower running volume, higher explosive demand.", active: true, primaryQuality: "Speed / acceleration", secondaryQuality: "Strength / power", distanceNote: "Lowest outfield distance but highest explosive demand", developmentPriority: "Reaction time and explosive power", trainingEmphasis: "30% aerobic, 30% speed, 40% power" },
      { id: "defender", name: "Defender", aerobicPriority: 6, strengthPriority: 7, notes: "High aerial duel frequency. Prioritize strength.", active: true, primaryQuality: "Strength / power", secondaryQuality: "Aerobic capacity", distanceNote: "Moderate distance, high duel frequency", developmentPriority: "Strength and aerial ability", trainingEmphasis: "40% strength, 35% aerobic, 25% speed" },
      { id: "midfielder", name: "Midfielder", aerobicPriority: 9, strengthPriority: 5, notes: "Highest total distance. Prioritize aerobic base.", active: true, primaryQuality: "Aerobic capacity", secondaryQuality: "Agility / change of direction", distanceNote: "Highest total distance of any position", developmentPriority: "Aerobic base and repeated sprint capacity", trainingEmphasis: "50% aerobic, 25% speed, 25% agility" },
      { id: "forward", name: "Forward", aerobicPriority: 7, strengthPriority: 6, notes: "High-intensity sprint frequency. Acceleration focus.", active: true, primaryQuality: "Speed / acceleration", secondaryQuality: "Strength / power", distanceNote: "High sprint count, moderate total distance", developmentPriority: "Acceleration and finishing under fatigue", trainingEmphasis: "40% speed, 30% strength, 30% aerobic" },
      { id: "winger", name: "Winger", aerobicPriority: 8, strengthPriority: 5, notes: "High-speed running volume. Repeated sprint ability.", active: true, primaryQuality: "Speed / acceleration", secondaryQuality: "Aerobic capacity", distanceNote: "High-speed running volume, repeated efforts", developmentPriority: "Repeated sprint ability and recovery", trainingEmphasis: "40% speed, 35% aerobic, 25% agility" },
    ],
    energySystem: "mixed",
    energyDescription: "Intermittent high-intensity efforts (sprints, jumps, duels) within a predominantly aerobic base. Repeated sprint ability is critical.",
    sessionDuration: 90,
    highIntensityActions: "60-80 high-intensity runs, 15-20 sprints, 10-15 jumps per match",
    physicalQualitiesRanking: ["Aerobic capacity", "Speed / acceleration", "Strength / power", "Agility / change of direction", "Flexibility / mobility"],
    injuryRisks: ["Hamstring strain", "ACL", "Ankle sprain", "Groin injury", "Patellar tendinopathy"],
    loadModel: { matchLoadUnit: 1.0, loadWindowWeeks: 4, highIntensityThreshold: 70, recoveryMinHours: 48 },
    performanceMetrics: [
      { id: "yoyo", name: "Yo-Yo Intermittent Recovery Test Level 1", shortName: "Yo-Yo IR1", whatItTests: "Aerobic capacity and repeated sprint recovery", protocol: "20m shuttle, increasing speed, record level and shuttle", unit: "Level/shuttle", category: "aerobic" },
      { id: "sprint_10m", name: "10m Sprint", shortName: "10m sprint", whatItTests: "Acceleration from standing start", protocol: "Standing start, timing gates at 0m and 10m", unit: "seconds", category: "speed" },
      { id: "sprint_30m", name: "30m Sprint", shortName: "30m sprint", whatItTests: "Maximum velocity approach speed", protocol: "Standing start, timing gates at 0m and 30m", unit: "seconds", category: "speed" },
      { id: "cmj", name: "Countermovement Jump", shortName: "CMJ", whatItTests: "Lower body explosive power", protocol: "Hands on hips, countermovement, jump for max height", unit: "centimetres", category: "power" },
      { id: "ttest", name: "T-Test Agility", shortName: "T-test", whatItTests: "Multi-directional agility and change of direction speed", protocol: "Sprint forward, shuffle left/right, backpedal", unit: "seconds", category: "agility" },
      { id: "nordic", name: "Nordic Hamstring Strength", shortName: "Nordic", whatItTests: "Eccentric hamstring strength and injury resilience", protocol: "Controlled eccentric lowering from kneeling", unit: "qualitative", category: "strength" },
      { id: "squat", name: "Relative Back Squat", shortName: "Rel. squat", whatItTests: "Lower body maximal strength relative to bodyweight", protocol: "Back squat 1RM divided by bodyweight", unit: "x bodyweight", category: "strength" },
    ],
  },
  padel: {
    keyMetrics: "Reaction time (BlazePods), lateral movement speed, court coverage, wrist/forearm loading",
    loadFramework: "Match density + training volume. Rally length and court movement patterns drive load. Watch for shoulder and wrist overuse patterns.",
    positionNotes: {
      drive: "Aggressive baseline play. Monitor wrist/elbow loading from repeated drives.",
      "revés": "Higher rotational demand. Monitor core and oblique fatigue.",
      backhand: "Higher rotational demand. Monitor core and oblique fatigue.",
    },
    seasonPhase: "in_season",
    matchLoadUnit: 1.0,
    positions: [
      { id: "drive", name: "Drive", aerobicPriority: 6, strengthPriority: 6, notes: "Aggressive baseline play.", active: true, primaryQuality: "Speed / acceleration", secondaryQuality: "Strength / power", distanceNote: "", developmentPriority: "", trainingEmphasis: "" },
      { id: "reves", name: "Revés", aerobicPriority: 6, strengthPriority: 7, notes: "Higher rotational demand.", active: true, primaryQuality: "Strength / power", secondaryQuality: "Agility / change of direction", distanceNote: "", developmentPriority: "", trainingEmphasis: "" },
    ],
    energySystem: "mixed",
    energyDescription: "Intermittent rallies with explosive lateral movements and overhead shots.",
    sessionDuration: 75,
    highIntensityActions: "",
    physicalQualitiesRanking: ["Agility / change of direction", "Speed / acceleration", "Strength / power", "Aerobic capacity", "Flexibility / mobility"],
    injuryRisks: ["Shoulder overuse", "Wrist injury", "Ankle sprain"],
    loadModel: { matchLoadUnit: 1.0, loadWindowWeeks: 4, highIntensityThreshold: 70, recoveryMinHours: 48 },
    performanceMetrics: [],
  },
  athletics: {
    keyMetrics: "Event-specific benchmarks, sprint mechanics (contact time, flight time), jump testing",
    loadFramework: "High-CNS cost per quality session. Monitor inter-session recovery carefully.",
    positionNotes: {
      sprints: "Maximal neuromuscular demand. 48-72h between quality sprint sessions.",
      throws: "High power/strength demand. Monitor shoulder and back loading.",
      jumps: "High impact loading. Monitor ankle/knee stress, especially during growth phases.",
    },
    seasonPhase: "in_season",
    matchLoadUnit: 1.0,
    positions: [
      { id: "sprints", name: "Sprints", aerobicPriority: 3, strengthPriority: 8, notes: "Maximal neuromuscular demand.", active: true, primaryQuality: "Speed / acceleration", secondaryQuality: "Strength / power", distanceNote: "", developmentPriority: "", trainingEmphasis: "" },
      { id: "throws", name: "Throws", aerobicPriority: 3, strengthPriority: 9, notes: "High power/strength demand.", active: true, primaryQuality: "Strength / power", secondaryQuality: "Speed / acceleration", distanceNote: "", developmentPriority: "", trainingEmphasis: "" },
      { id: "jumps", name: "Jumps", aerobicPriority: 5, strengthPriority: 8, notes: "High impact loading.", active: true, primaryQuality: "Strength / power", secondaryQuality: "Speed / acceleration", distanceNote: "", developmentPriority: "", trainingEmphasis: "" },
    ],
    energySystem: "anaerobic_dominant",
    energyDescription: "High-CNS maximal efforts with extended recovery periods between quality reps.",
    sessionDuration: 90,
    highIntensityActions: "",
    physicalQualitiesRanking: ["Speed / acceleration", "Strength / power", "Flexibility / mobility", "Aerobic capacity", "Agility / change of direction"],
    injuryRisks: ["Hamstring strain", "Back injury", "Knee injury", "Ankle sprain"],
    loadModel: { matchLoadUnit: 1.0, loadWindowWeeks: 4, highIntensityThreshold: 70, recoveryMinHours: 72 },
    performanceMetrics: [],
  },
  basketball: {
    keyMetrics: "Vertical jump, agility, sprint, court coverage",
    loadFramework: "ACWR for practice + game load. Game count per week drives weekly load. Practice intensity varies by phase.",
    positionNotes: {},
    seasonPhase: "in_season",
    matchLoadUnit: 1.0,
    positions: [],
    energySystem: "mixed",
    energyDescription: "Intermittent high-intensity bursts within a mixed aerobic-anaerobic base.",
    sessionDuration: 60,
    highIntensityActions: "",
    physicalQualitiesRanking: ["Speed / acceleration", "Agility / change of direction", "Strength / power", "Aerobic capacity", "Flexibility / mobility"],
    injuryRisks: ["Ankle sprain", "Knee injury", "ACL"],
    loadModel: { matchLoadUnit: 1.0, loadWindowWeeks: 4, highIntensityThreshold: 70, recoveryMinHours: 48 },
    performanceMetrics: [],
  },
  tennis: {
    keyMetrics: "Lateral movement speed, serve velocity, rally endurance",
    loadFramework: "Match frequency + practice volume. Monitor shoulder/elbow loading for serve-dominant players.",
    positionNotes: {},
    seasonPhase: "in_season",
    matchLoadUnit: 1.0,
    positions: [],
    energySystem: "mixed",
    energyDescription: "Extended rallies with explosive serve and movement patterns.",
    sessionDuration: 90,
    highIntensityActions: "",
    physicalQualitiesRanking: ["Agility / change of direction", "Speed / acceleration", "Aerobic capacity", "Strength / power", "Flexibility / mobility"],
    injuryRisks: ["Shoulder overuse", "Elbow injury", "Ankle sprain", "Back injury"],
    loadModel: { matchLoadUnit: 1.0, loadWindowWeeks: 4, highIntensityThreshold: 70, recoveryMinHours: 48 },
    performanceMetrics: [],
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
      flexibilityEmphasis: true,
      coreStabilityEmphasis: true,
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
      flexibilityEmphasis: true,
      coreStabilityEmphasis: true,
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
      flexibilityEmphasis: false,
      coreStabilityEmphasis: true,
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
      flexibilityEmphasis: false,
      coreStabilityEmphasis: false,
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
  loadThresholds: {
    amberPercent: 30,
    redPercent: 50,
    hrvPercent: 30,
    dualStressCap: 75,
    sleepHours: 6,
    beginnerWeeks: 12,
  },
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
      aiBehaviour: "Full rest. Growth phase exercises only (light mobility). No training.",
    },
    {
      id: "red_default",
      condition: { readinessRag: "RED", additionalFactors: [] },
      priority: 1,
      title: "Rest Day Recommended",
      titleNoTraining: "Good Day to Rest",
      bodyShort: "Your body needs recovery today. Take it easy and focus on rest.",
      bodyShortNoTraining: "No training today — your body will thank you. Focus on sleep and hydration.",
      aiBehaviour: "Full rest. Active recovery content only. Explains physiology.",
    },
    {
      id: "amber_high_acwr",
      condition: { readinessRag: "AMBER", additionalFactors: [{ field: "acwr", operator: ">", value: 1.3 }] },
      priority: 1,
      title: "High Load + Low Readiness",
      titleNoTraining: "Rest Day Helping You Recover",
      bodyShort: "Your training load is high and readiness is below normal. Reduce intensity today.",
      bodyShortNoTraining: "Rest day is helping you recover from high training load.",
      aiBehaviour: "Light session only. Caps intensity at 50%. Adds load context.",
    },
    {
      id: "amber_default",
      condition: { readinessRag: "AMBER", additionalFactors: [] },
      priority: 2,
      title: "Light Session Suggested",
      titleNoTraining: "Moderate Day — Stay Active",
      bodyShort: "You're not at your best today. Keep training light to moderate.",
      bodyShortNoTraining: "No training today — some light movement like a walk will keep you feeling good.",
      aiBehaviour: "Light to moderate session. Monitors response. Adapts mid-session.",
    },
    {
      id: "green_mid_phv",
      condition: { readinessRag: "GREEN", additionalFactors: [{ field: "phvStage", operator: "=", value: "mid_phv" }] },
      priority: 2,
      title: "Ready but Modified",
      titleNoTraining: "Ready — Modified Rest Day",
      bodyShort: "You're feeling good but still in a growth phase. Train with modified intensity.",
      bodyShortNoTraining: "Rest day — your body is ready but load is modified during growth phase.",
      aiBehaviour: "Modified training. Growth phase exercise restrictions apply.",
    },
    {
      id: "green_default",
      condition: { readinessRag: "GREEN", additionalFactors: [] },
      priority: 3,
      title: "Ready for High Intensity",
      titleNoTraining: "Ready — Rest Day Well Spent",
      bodyShort: "You're at your best. Go for it today!",
      bodyShortNoTraining: "No training today, but you're in great shape. Enjoy the rest.",
      aiBehaviour: "Full planned session. Standard load and intensity.",
    },
  ],
  confidenceThresholds: {
    fresh: 0.9,
    wearableOnly: 0.7,
    stale: 0.5,
  },
  stalenessHours: 24,
  developmentGates: [
    { id: "g1", prerequisite: "Nordic curl — complete movement proficiency", unlocks: "Maximum sprint volume and repeated sprint programmes", rationale: "Hamstring strength must precede high-speed running volume to reduce ACL and hamstring strain risk (Read et al., 2016)", hardGate: true, active: true },
    { id: "g2", prerequisite: "Yo-Yo IR1 Level 14 minimum", unlocks: "High-intensity strength training block", rationale: "Aerobic base supports recovery between strength efforts and reduces injury risk during resistance training adaptation", hardGate: false, active: true },
    { id: "g3", prerequisite: "12 weeks structured training history", unlocks: "Standard training load targets (removes beginner protection)", rationale: "Connective tissue adaptation lags muscular adaptation by 8-12 weeks in previously untrained athletes", hardGate: true, active: true },
  ],
  gapResponses: {
    belowDeveloping: "focus_development",
    developingToCompetitive: "maintain_work",
    aboveCompetitive: "acknowledge_maintain",
  },
};

export const PROMPT_TEMPLATES_DEFAULTS: AIPromptTemplates = {
  coachingStyle: "supportive", // v2 compat
  scienceTranslation: "balanced",
  ageBandCalibration: {
    u13: { vocabularyLevel: 1, scientificTerms: false, motivationalFraming: "encouragement" },
    u15: { vocabularyLevel: 2, scientificTerms: false, motivationalFraming: "encouragement" },
    u17: { vocabularyLevel: 3, scientificTerms: true, motivationalFraming: "neutral" },
    u19: { vocabularyLevel: 4, scientificTerms: true, motivationalFraming: "performance" },
    senior: { vocabularyLevel: 5, scientificTerms: true, motivationalFraming: "performance" },
  },
  ageToneAdjustments: {
    u13_u15: { enabled: true },
    u17_u19: { enabled: true },
    senior: { enabled: true },
  },
  programmePhilosophy: "",
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

  // Live data — anonymised for Decision Audit
  let todaySquadStatus = { green: 0, amber: 0, red: 0 };
  let recentDecisions: { type: string; description: string; rule: string; triggerData: string; time: string }[] = [];
  let systemHealth = { aiActive: true, dataFresh: true, protectionLoaded: true };
  let growthPhaseInterventions = 0;
  let loadTriggers = 0;
  let readinessDecisions = 0;
  const calibrationSignals: { severity: string; headline: string; body: string }[] = [];

  try {
    // Readiness counts from athlete_snapshots
    const { data: snapshots } = await db()
      .from("athlete_snapshots")
      .select("readiness_rag, updated_at");

    if (snapshots && Array.isArray(snapshots)) {
      const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
      for (const s of snapshots) {
        const rag = (s.readiness_rag || "").toUpperCase();
        if (rag === "GREEN") todaySquadStatus.green++;
        else if (rag === "AMBER") todaySquadStatus.amber++;
        else if (rag === "RED") todaySquadStatus.red++;
      }
      const freshCount = snapshots.filter((s: { updated_at: string }) => s.updated_at > sixHoursAgo).length;
      systemHealth.dataFresh = freshCount > snapshots.length * 0.5;
      readinessDecisions = snapshots.length;
    }

    // Recent P1/P2 recommendations from last 24h — ANONYMISED (no athlete names)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: recs } = await db()
      .from("athlete_recommendations")
      .select("rec_type, title, priority, created_at")
      .gte("created_at", oneDayAgo)
      .lte("priority", 2)
      .order("created_at", { ascending: false })
      .limit(30);

    if (recs && Array.isArray(recs)) {
      // Count by type for summary cards
      for (const r of recs) {
        const rt = (r.rec_type || "").toUpperCase();
        if (rt.includes("READINESS") || rt.includes("RECOVERY")) growthPhaseInterventions++;
        else if (rt.includes("LOAD")) loadTriggers++;
      }

      // Anonymised decision feed with rule references
      recentDecisions = recs.map((r: { rec_type: string; title: string; priority: number; created_at: string }, idx: number) => {
        const type = r.priority === 1 ? "protection" : r.rec_type.includes("LOAD") ? "load_management" : "readiness";
        const ruleMap: Record<string, string> = {
          READINESS: "Readiness protocol",
          LOAD_WARNING: "Load threshold",
          RECOVERY: "Recovery protocol",
          DEVELOPMENT: "Development pathway",
        };
        return {
          type,
          description: r.title,
          rule: ruleMap[r.rec_type] || r.rec_type,
          triggerData: `Priority ${r.priority} decision`,
          time: r.created_at,
        };
      });
    }

    // Calibration signals from decision patterns
    const totalDecisions = (recs || []).length;
    if (totalDecisions > 5) {
      const redPct = todaySquadStatus.red / Math.max(1, todaySquadStatus.green + todaySquadStatus.amber + todaySquadStatus.red) * 100;
      if (redPct > 30) {
        calibrationSignals.push({ severity: "amber", headline: "High rest-day proportion", body: `${Math.round(redPct)}% of readiness assessments resulted in rest day recommendations. Consider reviewing whether load thresholds are appropriately calibrated.` });
      }
      if (loadTriggers > totalDecisions * 0.5) {
        calibrationSignals.push({ severity: "amber", headline: "Frequent load interventions", body: `Load thresholds triggered ${loadTriggers} times in the last 24h. Check whether the amber threshold (currently set) is appropriate for the current training phase.` });
      }
      if (growthPhaseInterventions === 0 && todaySquadStatus.amber + todaySquadStatus.red > 3) {
        calibrationSignals.push({ severity: "green", headline: "Readiness protocol applying correctly", body: "Rule distribution matches expected patterns. No calibration issues detected." });
      }
    }

    // Protection loaded check
    const dbPhv = await readConfig("phv_safety_config");
    systemHealth.protectionLoaded = !!dbPhv;
  } catch {
    // Non-critical — stats page still renders with config counts
  }

  return {
    sportsConfigured: Object.keys(sport).length,
    phvStages: phv.stages.length,
    contraindications: phv.contraindications.length,
    monitoringAlerts: phv.monitoringAlerts.length,
    readinessRules: readiness.rules.length,
    promptBlocks: prompts.blocks.length,
    enabledPromptBlocks: prompts.blocks.filter((b) => b.enabled).length,
    todaySquadStatus,
    recentDecisions,
    overridesThisWeek: 0,
    systemHealth,
    growthPhaseInterventions,
    loadTriggers,
    readinessDecisions,
    calibrationSignals,
  };
}
