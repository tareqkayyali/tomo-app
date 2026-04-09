import { z } from 'zod';

// ---------- Protocol condition ----------

export const protocolConditionSchema = z.object({
  field: z.string().min(1, 'Field is required'),
  operator: z.enum(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'not_in']),
  value: z.unknown(),
});

// ---------- Planning protocol ----------

export const planningProtocolSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  description: z.string().max(1000).optional(),
  severity: z.enum(['MANDATORY', 'ADVISORY', 'INFO']),
  category: z.string().min(1, 'Category is required').max(100),
  trigger_conditions: z.array(protocolConditionSchema).min(1, 'At least one condition is required'),
  actions: z.record(z.string(), z.unknown()),
  scientific_basis: z.string().max(2000).optional(),
  sport_filter: z.array(z.string()).optional(),
  is_enabled: z.boolean().optional(),
});

// ---------- Cognitive window ----------

export const cognitiveWindowSchema = z.object({
  session_type: z.string().min(1, 'Session type is required').max(100),
  cognitive_state: z.enum(['enhanced', 'suppressed', 'neutral']),
  optimal_study_delay_minutes: z.number().int().min(0),
  description: z.string().max(1000).optional(),
});

// ---------- Dual load threshold ----------

export const dualLoadThresholdSchema = z.object({
  zone: z.string().min(1, 'Zone is required').max(100),
  dli_min: z.number().min(0),
  dli_max: z.number().min(0),
  description: z.string().max(1000).optional(),
  recommended_actions: z.record(z.string(), z.unknown()).optional(),
});

// ---------- Inferred types ----------

export type ProtocolCondition = z.infer<typeof protocolConditionSchema>;
export type PlanningProtocolInput = z.infer<typeof planningProtocolSchema>;
export type CognitiveWindowInput = z.infer<typeof cognitiveWindowSchema>;
export type DualLoadThresholdInput = z.infer<typeof dualLoadThresholdSchema>;
