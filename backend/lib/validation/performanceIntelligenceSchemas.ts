import { z } from "zod";

// ── Sport Coaching Context ──

const positionNotesSchema = z.record(z.string(), z.string());

const seasonPhaseSchema = z.enum(["pre_season", "in_season", "playoffs", "off_season"]);

const positionConfigSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  aerobicPriority: z.number().min(1).max(10).default(5),
  strengthPriority: z.number().min(1).max(10).default(5),
  notes: z.string().default(""),
  active: z.boolean().default(true),
  // v4 fields
  primaryQuality: z.string().default(""),
  secondaryQuality: z.string().default(""),
  distanceNote: z.string().default(""),
  developmentPriority: z.string().default(""),
  trainingEmphasis: z.string().default(""),
});

const loadModelSchema = z.object({
  matchLoadUnit: z.number().default(1.0),
  loadWindowWeeks: z.number().default(4),
  highIntensityThreshold: z.number().default(70),
  recoveryMinHours: z.number().default(48),
});

const performanceMetricSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  shortName: z.string().default(""),
  whatItTests: z.string().default(""),
  protocol: z.string().default(""),
  unit: z.string().default(""),
  category: z.enum(["aerobic", "speed", "strength", "power", "agility", "flexibility"]).default("aerobic"),
});

const sportCoachingEntrySchema = z.object({
  keyMetrics: z.string().min(1),
  loadFramework: z.string().min(1),
  positionNotes: positionNotesSchema.default({}),
  // v2 fields
  seasonPhase: seasonPhaseSchema.default("in_season"),
  matchLoadUnit: z.number().default(1.0),
  positions: z.array(positionConfigSchema).default([]),
  // v4 fields
  energySystem: z.enum(["aerobic_dominant", "mixed", "anaerobic_dominant"]).default("mixed"),
  energyDescription: z.string().default(""),
  sessionDuration: z.number().default(90),
  highIntensityActions: z.string().default(""),
  physicalQualitiesRanking: z.array(z.string()).default([]),
  injuryRisks: z.array(z.string()).default([]),
  loadModel: loadModelSchema.default({ matchLoadUnit: 1.0, loadWindowWeeks: 4, highIntensityThreshold: 70, recoveryMinHours: 48 }),
  performanceMetrics: z.array(performanceMetricSchema).default([]),
});

export const sportCoachingContextSchema = z.record(
  z.string(),
  sportCoachingEntrySchema
);

// ── PHV Safety Config ──

const phvStageSchema = z.object({
  name: z.string().min(1),
  offsetMin: z.number(),
  offsetMax: z.number(),
  loadingMultiplier: z.number().min(0).max(1),
  trainingPriorities: z.array(z.string()),
  safetyWarnings: z.array(z.string()),
  // v4 fields
  flexibilityEmphasis: z.boolean().default(true),
  coreStabilityEmphasis: z.boolean().default(true),
});

const phvContraindicationSchema = z.object({
  pattern: z.string().min(1),
  blocked: z.string().min(1),
  alternative: z.string().min(1),
  why: z.string().min(1),
  mechanism: z.string().default(""),
  progression: z.string().default(""),
  citation: z.string().default(""),
  applicableStages: z.array(z.string()).default(["mid_phv"]),
});

const phvMonitoringAlertSchema = z.object({
  condition: z.string().min(1),
  description: z.string().default(""),
  symptoms: z.string().default(""),
  action: z.string().min(1),
  triggerStages: z.array(z.string()).default(["mid_phv"]),
});

const loadThresholdsSchema = z.object({
  amberPercent: z.number().default(30),
  redPercent: z.number().default(50),
  hrvPercent: z.number().default(30),
  dualStressCap: z.number().default(75),
  sleepHours: z.number().default(6),
  beginnerWeeks: z.number().default(12),
});

export const phvSafetyConfigSchema = z.object({
  stages: z.array(phvStageSchema),
  contraindications: z.array(phvContraindicationSchema),
  monitoringAlerts: z.array(phvMonitoringAlertSchema),
  // v4 field
  loadThresholds: loadThresholdsSchema.default({ amberPercent: 30, redPercent: 50, hrvPercent: 30, dualStressCap: 75, sleepHours: 6, beginnerWeeks: 12 }),
});

// ── Readiness Decision Matrix ──

const readinessConditionSchema = z.object({
  readinessRag: z.enum(["RED", "AMBER", "GREEN"]),
  additionalFactors: z.array(
    z.object({
      field: z.string(),
      operator: z.enum([">", ">=", "<", "<=", "=", "!="]),
      value: z.union([z.string(), z.number(), z.boolean()]),
    })
  ).default([]),
});

const readinessRuleSchema = z.object({
  id: z.string().min(1),
  condition: readinessConditionSchema,
  priority: z.number().int().min(1).max(4),
  title: z.string().min(1),
  titleNoTraining: z.string().default(""),
  bodyShort: z.string().default(""),
  bodyShortNoTraining: z.string().default(""),
  // v4 field
  aiBehaviour: z.string().default(""),
});

const developmentGateSchema = z.object({
  id: z.string().min(1),
  prerequisite: z.string().min(1),
  unlocks: z.string().min(1),
  rationale: z.string().default(""),
  hardGate: z.boolean().default(true),
  active: z.boolean().default(true),
});

const gapResponsesSchema = z.object({
  belowDeveloping: z.string().default("focus_development"),
  developingToCompetitive: z.string().default("maintain_work"),
  aboveCompetitive: z.string().default("acknowledge_maintain"),
});

export const readinessDecisionMatrixSchema = z.object({
  rules: z.array(readinessRuleSchema),
  confidenceThresholds: z.object({
    fresh: z.number().min(0).max(1).default(0.9),
    wearableOnly: z.number().min(0).max(1).default(0.7),
    stale: z.number().min(0).max(1).default(0.5),
  }),
  stalenessHours: z.number().default(24),
  // v4 fields
  developmentGates: z.array(developmentGateSchema).default([]),
  gapResponses: gapResponsesSchema.default({ belowDeveloping: "focus_development", developingToCompetitive: "maintain_work", aboveCompetitive: "acknowledge_maintain" }),
});

// ── AI Prompt Templates ──

const promptBlockSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  template: z.string().default(""),
  enabled: z.boolean().default(true),
  sortOrder: z.number().default(0),
  description: z.string().default(""),
});

const ageBandCalibrationEntrySchema = z.object({
  vocabularyLevel: z.number().min(1).max(5).default(3),
  scientificTerms: z.boolean().default(false),
  motivationalFraming: z.enum(["encouragement", "neutral", "performance"]).default("neutral"),
});

const ageToneAdjustmentsSchema = z.object({
  u13_u15: z.object({ enabled: z.boolean().default(true) }),
  u17_u19: z.object({ enabled: z.boolean().default(true) }),
  senior: z.object({ enabled: z.boolean().default(true) }),
});

export const aiPromptTemplatesSchema = z.object({
  blocks: z.array(promptBlockSchema),
  // v2 fields (kept for backward compat)
  coachingStyle: z.string().optional(),
  ageToneAdjustments: ageToneAdjustmentsSchema.default({
    u13_u15: { enabled: true },
    u17_u19: { enabled: true },
    senior: { enabled: true },
  }),
  programmePhilosophy: z.string().max(500).default(""),
  // v4 fields
  scienceTranslation: z.enum(["performance", "development", "action", "balanced"]).default("balanced"),
  ageBandCalibration: z.record(z.string(), ageBandCalibrationEntrySchema).default({}),
});

// ── Protocol Review Log ──

export const protocolReviewCreateSchema = z.object({
  section: z.string().min(1),
  rule_key: z.string().min(1),
  old_value: z.unknown().optional(),
  new_value: z.unknown().optional(),
  observation: z.string().optional(),
  justification: z.string().min(1),
  citation: z.string().optional(),
});

// ── POST wrapper (config_key + config_value) ──

export const performanceIntelligencePostSchema = z.object({
  config_key: z.string().min(1),
  config_value: z.record(z.string(), z.unknown()),
});

// ── Types ──

export type SportCoachingContext = z.infer<typeof sportCoachingContextSchema>;
export type SportCoachingEntry = z.infer<typeof sportCoachingEntrySchema>;
export type PHVSafetyConfig = z.infer<typeof phvSafetyConfigSchema>;
export type PHVStage = z.infer<typeof phvStageSchema>;
export type PHVContraindication = z.infer<typeof phvContraindicationSchema>;
export type PHVMonitoringAlert = z.infer<typeof phvMonitoringAlertSchema>;
export type LoadThresholds = z.infer<typeof loadThresholdsSchema>;
export type ReadinessDecisionMatrix = z.infer<typeof readinessDecisionMatrixSchema>;
export type ReadinessRule = z.infer<typeof readinessRuleSchema>;
export type DevelopmentGate = z.infer<typeof developmentGateSchema>;
export type GapResponses = z.infer<typeof gapResponsesSchema>;
export type AIPromptTemplates = z.infer<typeof aiPromptTemplatesSchema>;
export type PromptBlock = z.infer<typeof promptBlockSchema>;
export type PositionConfig = z.infer<typeof positionConfigSchema>;
export type SeasonPhase = z.infer<typeof seasonPhaseSchema>;
export type PerformanceMetric = z.infer<typeof performanceMetricSchema>;
export type LoadModel = z.infer<typeof loadModelSchema>;
export type AgeBandCalibrationEntry = z.infer<typeof ageBandCalibrationEntrySchema>;
export type ProtocolReviewCreate = z.infer<typeof protocolReviewCreateSchema>;
