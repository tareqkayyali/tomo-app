import { z } from 'zod';

// ---------- Mode params (JSONB) ----------

export const modeParamsSchema = z.object({
  maxHardPerWeek: z.number().int().min(0),
  maxSessionsPerDay: z.number().int().min(1),
  studyDurationMultiplier: z.number().min(0),
  reduceGymDaysTo: z.number().int().min(0).nullable(),
  dropPersonalDev: z.boolean(),
  intensityCapOnExamDays: z
    .enum(['REST', 'LIGHT', 'MODERATE'])
    .nullable(),
  addRecoveryAfterMatch: z.boolean(),
  studyTrainingBalanceRatio: z.number().min(0).max(1),
  loadCapMultiplier: z.number().min(0).max(1),
  aiCoachingTone: z.enum(['supportive', 'neutral', 'intensive']),
  priorityBoosts: z.array(z.string()),
  referenceTemplates: z.record(z.string(), z.unknown()),
});

// ---------- Create ----------

export const createModeSchema = z.object({
  id: z
    .string()
    .min(1, 'ID is required')
    .max(50)
    .regex(/^[a-z0-9_-]+$/, 'ID must be lowercase alphanumeric with dashes/underscores'),
  label: z.string().min(1, 'Label is required').max(100),
  params: modeParamsSchema,
  description: z.string().max(500).optional(),
  icon: z.string().max(50).optional(),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, 'Must be a valid hex color')
    .optional(),
  sort_order: z.number().int().optional(),
  sport_filter: z.array(z.string()).optional(),
  is_enabled: z.boolean().optional(),
});

// ---------- Update ----------

export const updateModeSchema = createModeSchema.partial();

// ---------- Inferred types ----------

export type ModeParams = z.infer<typeof modeParamsSchema>;
export type ModeCreateInput = z.infer<typeof createModeSchema>;
export type ModeUpdateInput = z.infer<typeof updateModeSchema>;
