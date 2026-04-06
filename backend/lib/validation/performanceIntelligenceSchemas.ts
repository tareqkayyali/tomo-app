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
});

const sportCoachingEntrySchema = z.object({
  keyMetrics: z.string().min(1),
  loadFramework: z.string().min(1),
  positionNotes: positionNotesSchema.default({}),
  // v2 fields (Coaching Intelligence Hub)
  seasonPhase: seasonPhaseSchema.default("in_season"),
  matchLoadUnit: z.number().default(1.0),
  positions: z.array(positionConfigSchema).default([]),
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

export const phvSafetyConfigSchema = z.object({
  stages: z.array(phvStageSchema),
  contraindications: z.array(phvContraindicationSchema),
  monitoringAlerts: z.array(phvMonitoringAlertSchema),
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
});

export const readinessDecisionMatrixSchema = z.object({
  rules: z.array(readinessRuleSchema),
  confidenceThresholds: z.object({
    fresh: z.number().min(0).max(1).default(0.9),
    wearableOnly: z.number().min(0).max(1).default(0.7),
    stale: z.number().min(0).max(1).default(0.5),
  }),
  stalenessHours: z.number().default(24),
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

const ageToneAdjustmentsSchema = z.object({
  u13_u15: z.object({ enabled: z.boolean().default(true) }),
  u17_u19: z.object({ enabled: z.boolean().default(true) }),
  senior: z.object({ enabled: z.boolean().default(true) }),
});

export const aiPromptTemplatesSchema = z.object({
  blocks: z.array(promptBlockSchema),
  // v2 fields (Coaching Intelligence Hub)
  coachingStyle: z.enum(["motivating", "supportive", "data_informed", "holistic"]).default("supportive"),
  ageToneAdjustments: ageToneAdjustmentsSchema.default({
    u13_u15: { enabled: true },
    u17_u19: { enabled: true },
    senior: { enabled: true },
  }),
  programmePhilosophy: z.string().max(500).default(""),
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
export type ReadinessDecisionMatrix = z.infer<typeof readinessDecisionMatrixSchema>;
export type ReadinessRule = z.infer<typeof readinessRuleSchema>;
export type AIPromptTemplates = z.infer<typeof aiPromptTemplatesSchema>;
export type PromptBlock = z.infer<typeof promptBlockSchema>;
export type PositionConfig = z.infer<typeof positionConfigSchema>;
export type SeasonPhase = z.infer<typeof seasonPhaseSchema>;
