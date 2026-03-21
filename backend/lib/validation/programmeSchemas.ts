import { z } from "zod";

// ---------- Sub-schemas ----------

export const programmeDrillSchema = z.object({
  drill_id: z.string().uuid(),
  week_number: z.number().int().min(1),
  day_of_week: z.number().int().min(0).max(6),
  sets: z.number().int().min(1).default(3),
  reps: z.string().min(1).default("8-12"),
  intensity: z.string().default("moderate"),
  rest_seconds: z.number().int().min(0).default(60),
  rpe_target: z.number().min(1).max(10).default(7),
  duration_min: z.number().int().optional(),
  tempo_note: z.string().optional(),
  coach_notes: z.string().optional(),
  repeat_weeks: z.number().int().min(1).default(1),
  progression: z.enum(["none", "load_5pct", "load_10pct", "reps_plus1", "sets_plus1"]).default("none"),
  is_mandatory: z.boolean().default(true),
  order_in_day: z.number().int().default(0),
});

// ---------- Create / Update ----------

export const programmeCreateSchema = z.object({
  coach_id: z.string().uuid().optional(),
  name: z.string().min(1, "Programme name is required").max(200),
  description: z.string().max(2000).default(""),
  season_cycle: z.enum(["pre_season", "in_season", "off_season", "exam_period"]).default("in_season"),
  start_date: z.string().min(1, "Start date is required"),
  weeks: z.number().int().min(1).max(52).default(4),
  status: z.enum(["draft", "published", "archived"]).default("draft"),
  target_type: z.enum(["all", "position_group", "individual"]).default("all"),
  target_positions: z.array(z.string()).default([]),
  target_player_ids: z.array(z.string()).default([]),
  drills: z.array(programmeDrillSchema).default([]),
});

export const programmeUpdateSchema = programmeCreateSchema.partial();

// ---------- Filters ----------

export const programmeFilterSchema = z.object({
  status: z.enum(["draft", "published", "archived"]).optional(),
  season_cycle: z.enum(["pre_season", "in_season", "off_season", "exam_period"]).optional(),
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

export type ProgrammeCreateInput = z.infer<typeof programmeCreateSchema>;
export type ProgrammeUpdateInput = z.infer<typeof programmeUpdateSchema>;
export type ProgrammeFilters = z.infer<typeof programmeFilterSchema>;
export type ProgrammeDrillInput = z.infer<typeof programmeDrillSchema>;
