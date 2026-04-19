import { z } from "zod";

// ---------- Sub-schemas ----------

export const prescriptionSchema = z.object({
  sets: z.number().int().min(1).default(3),
  reps: z.string().min(1).default("8-12"),
  intensity: z.string().min(1).default("moderate"),
  rpe: z.string().default("6-7"),
  rest: z.string().default("60-90s"),
  frequency: z.string().default("2x/week"),
  coachingCues: z.array(z.string()).default([]),
});

export const phvStageSchema = z.object({
  contraindicated: z.boolean().optional(),
  warnings: z.array(z.string()).default([]),
  modifiedPrescription: prescriptionSchema.partial().optional(),
});

export const phvGuidanceSchema = z.object({
  pre_phv: phvStageSchema.optional(),
  mid_phv: phvStageSchema.optional(),
  post_phv: phvStageSchema.optional(),
});

// ---------- Create / Update ----------

export const programCreateSchema = z.object({
  name: z.string().min(1, "Program name is required").max(200),
  category: z.string().min(1, "Category is required"),
  type: z.enum(["physical", "technical"]),
  description: z.string().max(2000).default(""),
  equipment: z.array(z.string()).default([]),
  duration_minutes: z.number().int().min(1).max(180).default(30),
  position_emphasis: z.array(z.string()).default(["ALL"]),
  difficulty: z.string().default("intermediate"),
  tags: z.array(z.string()).default([]),
  prescriptions: z.record(z.string(), z.unknown()).default({}),
  phv_guidance: z.record(z.string(), z.unknown()).default({}),
  /**
   * AI safety gate. When false, the AI chat agent must NOT recommend or
   * return this program regardless of other filters. Load-bearing per the
   * "AI Chat Baseline Protection" memory rule — toggled from the CMS so
   * ops can hotfix bad programs out of the recommendation pool without a
   * deploy. Defaults true on create; the UI exposes the toggle.
   */
  chat_eligible: z.boolean().default(true),
  id: z.string().optional(),
});

export const programUpdateSchema = programCreateSchema.partial();

// ---------- Filters ----------

export const programFilterSchema = z.object({
  category: z.string().optional(),
  type: z.enum(["physical", "technical"]).optional(),
  search: z.string().optional(),
  page: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : 1)),
  limit: z
    .string()
    .optional()
    .transform((v) => (v ? Math.min(parseInt(v, 10), 100) : 20)),
});

// ---------- Types ----------

export type ProgramCreateInput = z.infer<typeof programCreateSchema>;
export type ProgramUpdateInput = z.infer<typeof programUpdateSchema>;
export type ProgramFilters = z.infer<typeof programFilterSchema>;
