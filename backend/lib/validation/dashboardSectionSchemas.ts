import { z } from 'zod';

// ---------------------------------------------------------------------------
// Shared sub-schemas
// ---------------------------------------------------------------------------

/** Single condition within the visibility DSL — matches pd_signals / pd_protocols */
export const visibilityConditionSchema = z.object({
  field: z.string().min(1, 'Field is required'),
  operator: z.enum(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'not_in']),
  value: z.unknown(),
});

/** Full visibility block — NULL means always visible */
export const visibilitySchema = z.object({
  match: z.enum(['all', 'any']),
  conditions: z.array(visibilityConditionSchema).min(1, 'At least one condition is required'),
}).nullable();

/** Allowed component types — discriminator for config shape */
export const componentTypeEnum = z.enum([
  'signal_hero',
  'status_ring',
  'kpi_row',
  'sparkline_row',
  'dual_load',
  'benchmark',
  'rec_list',
  'event_list',
  'growth_card',
  'engagement_bar',
  'protocol_banner',
  'custom_card',
]);

// ---------------------------------------------------------------------------
// Create schema (full required fields)
// ---------------------------------------------------------------------------

export const dashboardSectionCreateSchema = z.object({
  section_key: z
    .string()
    .min(1, 'Section key is required')
    .max(100)
    .regex(/^[a-z0-9_]+$/, 'Section key must be lowercase alphanumeric with underscores'),
  display_name: z.string().min(1, 'Display name is required').max(200),
  component_type: componentTypeEnum,
  sort_order: z.number().int().min(0).max(10000).default(0),
  visibility: visibilitySchema.optional().default(null),
  config: z.record(z.string(), z.unknown()).default({}),
  coaching_text: z.string().max(2000).nullable().optional().default(null),
  sport_filter: z.array(z.string()).nullable().optional().default(null),
  is_enabled: z.boolean().optional().default(true),
});

// ---------------------------------------------------------------------------
// Update schema (all fields optional, id excluded)
// ---------------------------------------------------------------------------

export const dashboardSectionUpdateSchema = dashboardSectionCreateSchema.partial();

// ---------------------------------------------------------------------------
// Reorder schema (batch sort_order update)
// ---------------------------------------------------------------------------

export const dashboardSectionReorderSchema = z.object({
  /** Array of { id, sort_order } pairs */
  order: z.array(
    z.object({
      id: z.string().uuid('Invalid section ID'),
      sort_order: z.number().int().min(0).max(10000),
    })
  ).min(1, 'At least one section is required'),
});

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

export type VisibilityCondition = z.infer<typeof visibilityConditionSchema>;
export type Visibility = z.infer<typeof visibilitySchema>;
export type ComponentType = z.infer<typeof componentTypeEnum>;
export type DashboardSectionCreateInput = z.infer<typeof dashboardSectionCreateSchema>;
export type DashboardSectionUpdateInput = z.infer<typeof dashboardSectionUpdateSchema>;
export type DashboardSectionReorderInput = z.infer<typeof dashboardSectionReorderSchema>;
