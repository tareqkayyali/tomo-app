import { z } from "zod";

// ---------- Helpers ----------

const numericArrayOf11 = z
  .array(z.number())
  .length(11, "Must contain exactly 11 values (ages 13–23)");

// ---------- Create / Update ----------

export const normativeCreateSchema = z.object({
  sport_id: z.string().min(1, "Sport is required"),
  metric_name: z.string().min(1, "Metric name is required").max(200),
  unit: z.string().default(""),
  attribute_key: z.string().min(1, "Attribute key is required"),
  direction: z.enum(["higher", "lower"]),
  age_min: z.number().int().min(5).max(30).default(13),
  age_max: z.number().int().min(5).max(30).default(23),
  means: numericArrayOf11,
  sds: numericArrayOf11,
});

export const normativeUpdateSchema = normativeCreateSchema.partial();

// ---------- Bulk Update ----------

export const normativeBulkUpdateItemSchema = z.object({
  id: z.string().uuid("Invalid row ID"),
  means: numericArrayOf11,
  sds: numericArrayOf11,
});

export const normativeBulkUpdateSchema = z.object({
  updates: z
    .array(normativeBulkUpdateItemSchema)
    .min(1, "At least one update is required")
    .max(500, "Maximum 500 updates per batch"),
});

// ---------- CSV Row ----------

export const normativeCsvRowSchema = z.object({
  metric_name: z.string().min(1, "Metric name is required"),
  unit: z.string().default(""),
  attribute_key: z.string().min(1, "Attribute key is required"),
  direction: z.enum(["higher", "lower"]),
  age_13_mean: z.coerce.number(),
  age_13_sd: z.coerce.number(),
  age_14_mean: z.coerce.number(),
  age_14_sd: z.coerce.number(),
  age_15_mean: z.coerce.number(),
  age_15_sd: z.coerce.number(),
  age_16_mean: z.coerce.number(),
  age_16_sd: z.coerce.number(),
  age_17_mean: z.coerce.number(),
  age_17_sd: z.coerce.number(),
  age_18_mean: z.coerce.number(),
  age_18_sd: z.coerce.number(),
  age_19_mean: z.coerce.number(),
  age_19_sd: z.coerce.number(),
  age_20_mean: z.coerce.number(),
  age_20_sd: z.coerce.number(),
  age_21_mean: z.coerce.number(),
  age_21_sd: z.coerce.number(),
  age_22_mean: z.coerce.number(),
  age_22_sd: z.coerce.number(),
  age_23_mean: z.coerce.number(),
  age_23_sd: z.coerce.number(),
});

// ---------- Filter ----------

export const normativeFilterSchema = z.object({
  sport_id: z.string().optional(),
});

// ---------- Types ----------

export type NormativeCreateInput = z.infer<typeof normativeCreateSchema>;
export type NormativeUpdateInput = z.infer<typeof normativeUpdateSchema>;
export type NormativeBulkUpdateInput = z.infer<typeof normativeBulkUpdateSchema>;
export type NormativeCsvRow = z.infer<typeof normativeCsvRowSchema>;
export type NormativeFilters = z.infer<typeof normativeFilterSchema>;
