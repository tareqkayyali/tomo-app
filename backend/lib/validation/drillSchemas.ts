import { z } from "zod";

// ---------- Sub-schemas ----------

export const equipmentSchema = z.object({
  name: z.string().min(1, "Equipment name is required"),
  quantity: z.number().int().min(1).default(1),
  optional: z.boolean().default(false),
});

export const progressionSchema = z.object({
  level: z.number().int().min(1).max(5),
  label: z.string().min(1, "Label is required"),
  description: z.string().default(""),
  duration_minutes: z.number().int().min(1).optional(),
});

// ---------- Create / Update ----------

export const drillCreateSchema = z.object({
  sport_id: z.string().min(1, "Sport is required"),
  name: z.string().min(1, "Drill name is required").max(200),
  slug: z.string().optional(), // auto-generated if omitted
  description: z.string().max(1000).default(""),
  instructions: z
    .array(z.string().min(1))
    .min(1, "At least one instruction step is required"),
  duration_minutes: z.number().int().min(1).max(120).default(15),
  intensity: z.enum(["light", "moderate", "hard"]),
  primary_attribute: z.string().nullable().optional(),
  attribute_keys: z.array(z.string()).default([]),
  age_bands: z.array(z.string()).default([]),
  position_keys: z.array(z.string()).default([]),
  category: z.enum([
    "warmup",
    "training",
    "cooldown",
    "recovery",
    "activation",
  ]),
  players_min: z.number().int().min(1).default(1),
  players_max: z.number().int().min(1).default(1),
  video_url: z.string().url().optional().or(z.literal("")),
  image_url: z.string().url().optional().or(z.literal("")),
  sort_order: z.number().int().default(100),
  active: z.boolean().default(true),

  // Nested children
  equipment: z.array(equipmentSchema).default([]),
  progressions: z.array(progressionSchema).default([]),
  tags: z.array(z.string().min(1)).default([]),
});

export const drillUpdateSchema = drillCreateSchema.partial();

// ---------- Filters ----------

export const drillFilterSchema = z.object({
  sport_id: z.string().optional(),
  category: z
    .enum(["warmup", "training", "cooldown", "recovery", "activation"])
    .optional(),
  intensity: z.enum(["light", "moderate", "hard"]).optional(),
  active: z
    .string()
    .optional()
    .transform((v) => (v === "true" ? true : v === "false" ? false : undefined)),
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

export type DrillCreateInput = z.infer<typeof drillCreateSchema>;
export type DrillUpdateInput = z.infer<typeof drillUpdateSchema>;
export type DrillFilters = z.infer<typeof drillFilterSchema>;
