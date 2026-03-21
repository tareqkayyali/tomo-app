import { z } from "zod";

// ---------- Sub-schemas ----------

export const selectOptionSchema = z.object({
  label: z.string().min(1, "Option label is required"),
  value: z.string().min(1, "Option value is required"),
});

export const inputFieldSchema = z
  .object({
    key: z.string().min(1, "Input key is required"),
    label: z.string().min(1, "Input label is required"),
    type: z.enum(["number", "text", "select"]),
    unit: z.string().default(""),
    required: z.boolean().default(true),
    placeholder: z.string().default(""),
    // Number-specific
    min: z.number().optional(),
    max: z.number().optional(),
    step: z.number().optional(),
    // Select-specific
    options: z.array(selectOptionSchema).optional(),
  })
  .refine(
    (data) => {
      if (data.type === "select") {
        return data.options && data.options.length > 0;
      }
      return true;
    },
    { message: "Select type requires at least one option", path: ["options"] }
  );

export const derivedMetricSchema = z.object({
  key: z.string().min(1, "Metric key is required"),
  label: z.string().min(1, "Metric label is required"),
  unit: z.string().default(""),
  normMetricName: z.string().default(""),
});

// ---------- Create / Update ----------

export const assessmentCreateSchema = z.object({
  sport_id: z.string().min(1, "Sport is required"),
  test_id: z.string().min(1, "Test ID is required"),
  name: z.string().min(1, "Assessment name is required").max(200),
  icon: z.string().default(""),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, "Must be a valid hex color")
    .default("#888888"),
  description: z.string().max(2000).default(""),
  research_note: z.string().max(2000).default(""),
  attribute_keys: z.array(z.string()).default([]),
  inputs: z.array(inputFieldSchema).min(1, "At least one input field is required"),
  derived_metrics: z.array(derivedMetricSchema).default([]),
  primary_metric_name: z.string().default(""),
  primary_input_key: z.string().default(""),
  sort_order: z.number().int().default(0),
});

export const assessmentUpdateSchema = assessmentCreateSchema.partial();

// ---------- Filters ----------

export const assessmentFilterSchema = z.object({
  sport_id: z.string().optional(),
  search: z.string().optional(),
  page: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : 1)),
  limit: z
    .string()
    .optional()
    .transform((v) => (v ? Math.min(parseInt(v, 10), 100) : 50)),
});

// ---------- Types ----------

export type AssessmentCreateInput = z.infer<typeof assessmentCreateSchema>;
export type AssessmentUpdateInput = z.infer<typeof assessmentUpdateSchema>;
export type AssessmentFilters = z.infer<typeof assessmentFilterSchema>;
