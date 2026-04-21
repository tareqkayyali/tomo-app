/**
 * Zod schemas for progress_metrics admin CRUD.
 * Mirrors the table constraints so bad data is rejected at the API boundary.
 */
import { z } from 'zod';

const categoryEnum = z.enum([
  'readiness',
  'wellness',
  'academic',
  'performance',
  'engagement',
]);

const sourceKindEnum = z.enum([
  'snapshot_field',
  'daily_vitals_avg',
  'daily_vitals_latest',
  'checkin_avg',
  'checkin_latest',
  'daily_load_sum',
  'event_aggregate',
  'benchmark',
]);

const directionEnum = z.enum(['higher_better', 'lower_better', 'neutral']);

// A single trigger rule. Intentionally permissive — the notification engine
// (Phase 4) owns stricter evaluation; the admin form mostly just round-trips
// JSON for now.
const triggerSchema = z.object({
  kind: z.enum(['threshold', 'trend']),
  operator: z.enum([
    'lt', 'lte', 'gt', 'gte',
    'delta_lt_pct', 'delta_gt_pct',
  ]),
  value: z.number(),
  window_days: z.number().int().positive().optional(),
  priority: z.enum(['P1', 'P2', 'P3']),
  category: z.string().min(1).max(60),
  title_template: z.string().min(1).max(200),
  body_template: z.string().min(1).max(400),
  cooldown_hours: z.number().int().min(0).max(720).default(24),
});

const triggersSchema = z.object({
  triggers: z.array(triggerSchema).max(10),
}).optional().nullable();

export const progressMetricCreateSchema = z.object({
  metric_key: z.string().min(1).max(60).regex(/^[a-z0-9_]+$/),
  display_name: z.string().min(1).max(80),
  display_unit: z.string().min(0).max(20),
  category: categoryEnum,
  source_kind: sourceKindEnum,
  source_field: z.string().min(1).max(80),
  direction: directionEnum,
  value_min: z.number().nullable().optional(),
  value_max: z.number().nullable().optional(),
  sort_order: z.number().int().min(0).default(100),
  sport_filter: z.array(z.string()).nullable().optional(),
  is_enabled: z.boolean().default(true),
  notification_triggers: triggersSchema,
});

export const progressMetricUpdateSchema = progressMetricCreateSchema
  .partial()
  .extend({
    _action: z.enum(['toggle']).optional(),
  });

export type ProgressMetricCreate = z.infer<typeof progressMetricCreateSchema>;
export type ProgressMetricUpdate = z.infer<typeof progressMetricUpdateSchema>;
