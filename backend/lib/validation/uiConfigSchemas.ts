import { z } from "zod";

// ── Section Config ──

export const sectionConfigSchema = z.object({
  sectionId: z.string().min(1),
  title: z.string().default(""),
  subtitle: z.string().optional(),
  visible: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
  cardVariant: z
    .enum(["blob", "rounded", "glass", "muted", "elevated", "outlined"])
    .optional(),
  spacing: z
    .object({
      marginTop: z.number().optional(),
      marginBottom: z.number().optional(),
      paddingHorizontal: z.number().optional(),
    })
    .optional(),
  style: z.record(z.string(), z.unknown()).optional(),
});

// ── Page Metadata ──

export const pageMetadataSchema = z.object({
  pageTitle: z.string().optional(),
  subtitle: z.string().optional(),
  tabLabels: z.record(z.string(), z.string()).optional(),
  emptyStates: z.record(z.string(), z.string()).optional(),
});

// ── Theme Schemas ──

export const themeCreateSchema = z.object({
  name: z.string().min(1, "Theme name is required").max(100),
  colors_dark: z.record(z.string(), z.unknown()).default({}),
  colors_light: z.record(z.string(), z.unknown()).default({}),
  typography: z.record(z.string(), z.unknown()).default({}),
  is_active: z.boolean().default(false),
});

export const themeUpdateSchema = themeCreateSchema.partial();

// ── Page Color Overrides ──

export const pageColorOverridesSchema = z.object({
  dark: z.record(z.string(), z.string()).optional(),
  light: z.record(z.string(), z.string()).optional(),
}).default({});

// ── Page Config Schemas ──

export const pageConfigCreateSchema = z.object({
  screen_key: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9_]+$/),
  screen_label: z.string().min(1).max(200),
  sections: z.array(sectionConfigSchema).default([]),
  metadata: pageMetadataSchema.default({}),
  color_overrides: pageColorOverridesSchema,
  is_published: z.boolean().default(false),
});

export const pageConfigUpdateSchema = pageConfigCreateSchema
  .omit({ screen_key: true })
  .partial();

// ── Feature Flag Schemas ──

export const featureFlagCreateSchema = z.object({
  flag_key: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9_]+$/),
  enabled: z.boolean().default(false),
  description: z.string().max(500).default(""),
  sports: z.array(z.string()).nullable().default(null),
});

export const featureFlagUpdateSchema = featureFlagCreateSchema
  .omit({ flag_key: true })
  .partial();

// ── UI Config Schemas ──

export const uiConfigCreateSchema = z.object({
  config_key: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9_]+$/),
  config_value: z.record(z.string(), z.unknown()),
});

export const uiConfigUpdateSchema = z.object({
  config_value: z.record(z.string(), z.unknown()),
});

// ── Types ──

export type ThemeCreateInput = z.infer<typeof themeCreateSchema>;
export type ThemeUpdateInput = z.infer<typeof themeUpdateSchema>;
export type PageConfigCreateInput = z.infer<typeof pageConfigCreateSchema>;
export type PageConfigUpdateInput = z.infer<typeof pageConfigUpdateSchema>;
export type FeatureFlagCreateInput = z.infer<typeof featureFlagCreateSchema>;
export type FeatureFlagUpdateInput = z.infer<typeof featureFlagUpdateSchema>;
export type UIConfigCreateInput = z.infer<typeof uiConfigCreateSchema>;
export type UIConfigUpdateInput = z.infer<typeof uiConfigUpdateSchema>;
