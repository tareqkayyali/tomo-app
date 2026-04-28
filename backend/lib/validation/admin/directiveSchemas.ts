/**
 * Methodology Directive Schemas — Phase 0
 *
 * Zod schemas for the 23 closed directive types written by the PD via the
 * Instructions Command Center. Every directive payload stored in
 * `methodology_directives.payload` (JSONB) is validated against the schema
 * for its `directive_type` before write and after read.
 *
 * Mirror in ai-service/app/instructions/types.py — the resolver enforces
 * the same shapes at runtime. CI parity test ensures the type names and
 * payload field names stay aligned across TS and Python.
 */

import { z } from 'zod';

// ─── Shared enums and primitives ──────────────────────────────────────────

export const directiveTypeEnum = z.enum([
  // Identity & Voice
  'identity', 'tone', 'response_shape',
  // Safety & Guardrails
  'guardrail_phv', 'guardrail_age', 'guardrail_load', 'safety_gate',
  // Decision Logic
  'threshold', 'performance_model', 'mode_definition',
  'planning_policy', 'scheduling_policy',
  // Routing & Recommendations
  'routing_intent', 'routing_classifier', 'recommendation_policy',
  'rag_policy', 'memory_policy',
  // Surface & Cross-Audience
  'surface_policy', 'escalation',
  'coach_dashboard_policy', 'parent_report_policy',
  // Meta
  'meta_parser', 'meta_conflict',
  // Phase 7: Dashboard + Programs governance
  'dashboard_section', 'signal_definition', 'program_rule',
  // Phase 8: Bucketed verticals
  'sleep_policy', 'nutrition_policy', 'wellbeing_policy',
  'injury_policy', 'career_policy',
]);
export type DirectiveType = z.infer<typeof directiveTypeEnum>;

export const audienceEnum = z.enum(['athlete', 'coach', 'parent', 'all']);
export const directiveStatusEnum = z.enum(['proposed', 'approved', 'published', 'retired']);
export const documentStatusEnum = z.enum(['draft', 'under_review', 'published', 'archived']);
export const sourceFormatEnum = z.enum(['markdown', 'pdf', 'docx', 'plain']);

export const ageBandEnum = z.enum(['U13', 'U15', 'U17', 'U19', 'U21', 'senior', 'unknown']);
export const phvStageEnum = z.enum(['pre_phv', 'mid_phv', 'post_phv', 'unknown']);
export const intensityLevelEnum = z.enum(['rest', 'light', 'moderate', 'full']);
export const llmTierEnum = z.enum(['haiku', 'sonnet', 'opus']);
export const responsePatternEnum = z.enum([
  'capsule_direct', 'data_display', 'multi_step', 'write_action', 'open_coaching',
]);
export const urgencyEnum = z.enum(['low', 'normal', 'high', 'critical']);

const zoneBoundariesSchema = z.object({
  green: z.tuple([z.number(), z.number()]).optional(),
  yellow: z.tuple([z.number(), z.number()]).optional(),
  red: z.tuple([z.number(), z.number()]).optional(),
});

// ─── Per-directive payload schemas ────────────────────────────────────────
// Kept pragmatic: tight where the runtime needs it, permissive (z.record)
// where the PD will iterate. Tighten over time as patterns settle.

// 1. identity
export const identityPayloadSchema = z.object({
  persona_name: z.string().min(1).max(60),
  persona_description: z.string().min(1).max(20000),
  voice_attributes: z.array(z.string().max(40)).max(20),
  pronouns: z.string().max(20).optional(),
  emoji_policy: z.enum(['none', 'sparing', 'moderate', 'frequent']).default('sparing'),
  cultural_register: z.string().max(120).optional(),
});

// 2. tone
export const tonePayloadSchema = z.object({
  banned_phrases: z.array(z.string().max(200)).default([]),
  banned_patterns: z.array(z.string().max(400)).default([]),                   // regex source strings
  required_companion_clauses: z.record(z.string(), z.string()).default({}),    // phrase -> required followup
  age_specific_jargon_rules: z.record(z.string(), z.array(z.string())).optional(),
  clinical_language_rules: z.array(z.string()).default([]),
  acronym_scaffolding_rules: z.array(z.string()).default([]),
});

// 3. response_shape
export const responseShapePayloadSchema = z.object({
  max_length_by_intent: z.record(z.string(), z.number().int().positive()).default({}),
  structure_template: z.string().max(2000).optional(),
  opening_pattern: z.string().max(500).optional(),
  closing_pattern: z.string().max(500).optional(),
  bullet_policy: z.enum(['avoid', 'allow', 'prefer']).default('allow'),
  emoji_density: z.enum(['none', 'low', 'medium', 'high']).default('low'),
  card_vs_text_rules: z.record(z.string(), z.enum(['card', 'text', 'mixed'])).default({}),
  chip_suggestions: z.record(z.string(), z.array(z.string())).default({}),
});

// 4. guardrail_phv
export const guardrailPhvPayloadSchema = z.object({
  blocked_exercises: z.array(z.string()).default([]),
  /** Regex source strings — patterns the runtime matches against agent responses. */
  blocked_patterns: z.array(z.string()).default([]),
  phv_stage_rules: z.record(z.string(), z.object({
    blocked_exercises: z.array(z.string()).default([]),
    intensity_cap: intensityLevelEnum.optional(),
    load_multiplier: z.number().min(0).max(1).optional(),
  })).default({}),
  advisory_or_blocking: z.enum(['advisory', 'blocking']).default('advisory'),
  safe_alternatives: z.record(z.string(), z.array(z.string())).default({}),
  /** Plain-text message prepended to the response when the gate fires. */
  safety_warning_template: z.string().default(''),
  unknown_age_default: z.enum(['conservative', 'permissive']).default('conservative'),
});

// 5. guardrail_age
export const guardrailAgePayloadSchema = z.object({
  age_band_overrides: z.record(z.string(), z.object({
    blocked_exercises: z.array(z.string()).default([]),
    load_caps: z.object({
      max_minutes_per_session: z.number().int().positive().optional(),
      max_sessions_per_week: z.number().int().positive().optional(),
    }).optional(),
    intensity_cap: intensityLevelEnum.optional(),
    language_simplification_level: z.enum(['none', 'mild', 'strong']).optional(),
  })).default({}),
});

// 6. guardrail_load
export const guardrailLoadPayloadSchema = z.object({
  acwr_zones: zoneBoundariesSchema.optional(),
  dual_load_thresholds: z.object({
    high_academic_load_score: z.number().optional(),
    reduce_training_when: z.string().optional(),
  }).optional(),
  consecutive_hard_day_limit: z.number().int().positive().optional(),
  weekly_load_cap: z.number().positive().optional(),
  recovery_gap_hours: z.number().int().nonnegative().optional(),
});

// 7. safety_gate
export const safetyGatePayloadSchema = z.object({
  trigger_condition: z.string().min(1).max(1000),                 // human-readable + machine-parseable
  block_action: z.enum(['refuse', 'redirect_to_coach', 'require_override']),
  override_role: z.enum(['none', 'coach', 'institutional_pd', 'super_admin']).default('none'),
  user_facing_reason_template: z.string().min(1).max(2000),
});

// 8. threshold
export const thresholdPayloadSchema = z.object({
  metric_name: z.string().min(1).max(100),
  zone_boundaries: zoneBoundariesSchema,
  age_band_adjustments: z.record(z.string(), z.number()).optional(),
  phv_adjustments: z.record(z.string(), z.number()).optional(),
  sport_adjustments: z.record(z.string(), z.number()).optional(),
  position_adjustments: z.record(z.string(), z.number()).optional(),
});

// 9. performance_model
export const performanceModelPayloadSchema = z.object({
  layers: z.array(z.object({
    name: z.string(),
    anchor_metrics: z.array(z.string()).default([]),
  })).min(1),
  per_position_priorities: z.record(z.string(), z.record(z.string(), z.number())).default({}),
  gap_thresholds: z.object({
    strength: z.number(),
    on_track: z.number(),
    developing: z.number(),
    gap: z.number(),
  }),
  phv_adjustment_rules: z.record(z.string(), z.number()).optional(),
});

// 10. mode_definition
export const modeDefinitionPayloadSchema = z.object({
  mode_name: z.string().min(1).max(60),
  activation_conditions: z.record(z.string(), z.unknown()).default({}),
  load_multipliers: z.number().min(0).max(2).optional(),
  intensity_caps: intensityLevelEnum.optional(),
  duration_caps: z.object({
    max_minutes_per_session: z.number().int().positive().optional(),
    max_sessions_per_week: z.number().int().positive().optional(),
  }).optional(),
  recommended_categories: z.array(z.string()).default([]),
  blocked_categories: z.array(z.string()).default([]),
});

// 11. planning_policy
export const planningPolicyPayloadSchema = z.object({
  phase_definitions: z.array(z.object({
    name: z.string(),
    weeks: z.number().int().positive().optional(),
    focus: z.string().optional(),
  })),
  transition_rules: z.record(z.string(), z.unknown()).default({}),
  taper_rules: z.record(z.string(), z.unknown()).default({}),
  peak_rules: z.record(z.string(), z.unknown()).default({}),
  competition_proximity_rules: z.record(z.string(), z.unknown()).default({}),
});

// 12. scheduling_policy
export const schedulingPolicyPayloadSchema = z.object({
  max_sessions_per_week: z.number().int().positive().optional(),
  recovery_gap_hours: z.number().int().nonnegative().optional(),
  exam_window_overrides: z.record(z.string(), z.unknown()).default({}),
  school_day_constraints: z.record(z.string(), z.unknown()).default({}),
  cognitive_window_rules: z.record(z.string(), z.unknown()).default({}),
});

// 13. routing_intent
export const routingIntentPayloadSchema = z.object({
  intent_id: z.string().min(1).max(80),
  response_pattern: responsePatternEnum,
  capsule_type: z.string().max(80).optional(),
  tool_chain: z.array(z.string()).default([]),
  agent_role: z.string().max(80).optional(),
  llm_tier: llmTierEnum.optional(),
  priority: z.number().int().optional(),
  multi_step_definition: z.record(z.string(), z.unknown()).optional(),
});

// 14. routing_classifier
export const routingClassifierPayloadSchema = z.object({
  classifier_version: z.enum(['haiku_v1', 'sonnet_v1']).default('sonnet_v1'),
  intent_examples: z.record(z.string(), z.array(z.string())).default({}),
  fallback_intent: z.string().max(80).default('open_coaching'),
  agent_lock_rules: z.record(z.string(), z.unknown()).default({}),
  smalltalk_routing: z.record(z.string(), z.unknown()).default({}),
  confidence_threshold: z.number().min(0).max(1).default(0.6),
});

// 15. recommendation_policy
export const recommendationPolicyPayloadSchema = z.object({
  scope_conditions: z.record(z.string(), z.unknown()).default({}),
  blocked_categories: z.array(z.string()).default([]),
  mandatory_categories: z.array(z.string()).default([]),
  priority_override: z.enum(['P0', 'P1', 'P2', 'P3']).optional(),
  max_recs_per_turn: z.number().int().positive().optional(),
  forced_inclusions: z.record(z.string(), z.unknown()).default({}),
});

// 16. rag_policy
export const ragPolicyPayloadSchema = z.object({
  forced_domains: z.array(z.string()).default([]),
  blocked_domains: z.array(z.string()).default([]),
  chunk_count: z.number().int().positive().max(50).default(5),
  sport_filter: z.array(z.string()).default([]),
  age_filter: z.array(ageBandEnum).default([]),
  phv_filter: z.array(phvStageEnum).default([]),
  min_similarity: z.number().min(0).max(1).default(0.7),
});

// 17. memory_policy
export const memoryPolicyPayloadSchema = z.object({
  extraction_prompt_template: z.string().min(10).max(8000),
  atom_types: z.array(z.string()).default([
    'current_goals', 'unresolved_concerns', 'injury_history',
    'behavioral_patterns', 'coaching_preferences', 'last_topics', 'key_milestones',
  ]),
  truncation_tokens: z.number().int().positive().max(4000).default(500),
  dedup_strategy: z.enum(['naive', 'embedding', 'llm_judge']).default('embedding'),
  retention_days: z.number().int().positive().default(365),
  sport_aware_rules: z.record(z.string(), z.unknown()).default({}),
  extraction_trigger: z.object({
    on_turn_count: z.number().int().positive().optional(),
    on_signal: z.array(z.string()).default([]),
  }).default({ on_signal: [] }),
});

// 18. surface_policy
export const surfacePolicyPayloadSchema = z.object({
  audience: z.enum(['athlete', 'coach', 'parent']),
  what_to_show: z.array(z.string()).default([]),
  what_to_hide: z.array(z.string()).default([]),
  tone_override_id: z.string().uuid().optional(),
  format_override_id: z.string().uuid().optional(),
  language_simplification_level: z.enum(['none', 'mild', 'strong']).default('none'),
  terminology_translations: z.record(z.string(), z.string()).default({}),
});

// 19. escalation
export const escalationPayloadSchema = z.object({
  trigger_conditions: z.record(z.string(), z.unknown()),
  target_audience: z.enum(['coach', 'parent', 'both']),
  notification_template: z.string().min(1).max(2000),
  urgency: urgencyEnum.default('normal'),
  cooldown_hours: z.number().int().nonnegative().default(24),
  requires_athlete_consent: z.boolean().default(false),
});

// 20. coach_dashboard_policy
export const coachDashboardPolicyPayloadSchema = z.object({
  dashboard_widgets: z.array(z.string()).default([]),
  alert_rules: z.record(z.string(), z.unknown()).default({}),
  summary_template: z.string().max(4000).optional(),
  roster_sort_rules: z.record(z.string(), z.unknown()).default({}),
});

// 21. parent_report_policy
export const parentReportPolicyPayloadSchema = z.object({
  report_frequency: z.enum(['daily', 'weekly', 'biweekly', 'monthly', 'event_only']).default('weekly'),
  report_template: z.string().min(10).max(8000),
  blocked_topics: z.array(z.string()).default([]),
  language_simplification_level: z.enum(['none', 'mild', 'strong']).default('mild'),
  consent_requirements: z.array(z.string()).default([]),
});

// 22. meta_parser
export const metaParserPayloadSchema = z.object({
  extraction_prompt: z.string().min(50),
  extraction_schema_version: z.number().int().positive().default(1),
  extraction_model: z.string().default('claude-sonnet-4-6'),
  chunking_strategy: z.enum(['paragraph', 'section', 'fixed_tokens']).default('section'),
  confidence_threshold_for_auto_propose: z.number().min(0).max(1).default(0.5),
});

// 23. meta_conflict
export const metaConflictPayloadSchema = z.object({
  merge_rules_per_type: z.record(z.string(), z.string()).default({
    load_multiplier: 'MIN',
    intensity_cap: 'MOST_RESTRICTIVE',
    arrays: 'UNION',
  }),
  priority_tiebreakers: z.array(z.enum(['priority', 'audience_specificity', 'updated_at'])).default([
    'priority', 'audience_specificity', 'updated_at',
  ]),
  audience_inheritance_rules: z.record(z.string(), z.unknown()).default({}),
});


// ─── Phase 7: Dashboard + Programs governance ─────────────────────────────

/**
 * The 12 known component_type values rendered by the mobile dashboard.
 * PD picks from this fixed list — new types require mobile work.
 */
export const dashboardComponentTypeEnum = z.enum([
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

/** Where in the app this section lands. NULL = main dashboard (athlete tab). */
export const dashboardPanelKeyEnum = z.enum([
  'main',     // canonicalised "" / null in legacy
  'program',
  'metrics',
  'progress',
]);

// 24. dashboard_section
export const dashboardSectionPayloadSchema = z.object({
  /** Stable key — used to dedup directives that govern the same section. */
  section_key: z.string().min(1).max(80),
  display_name: z.string().min(1).max(120),
  component_type: dashboardComponentTypeEnum,
  panel_key: dashboardPanelKeyEnum.default('main'),
  sort_order: z.number().int().default(100),
  /** Optional: metric_key from progress_metrics registry (for kpi_row, sparkline_row, etc.). */
  metric_key: z.string().max(80).nullable().optional(),
  /** Plain-language template, interpolated with {field} placeholders against the snapshot. */
  coaching_text_template: z.string().max(2000).nullable().optional(),
  /** Per-component config (advanced — usually empty). */
  config: z.record(z.string(), z.unknown()).default({}),
  is_enabled: z.boolean().default(true),
});

// 25. signal_definition
const signalPillConfigSchema = z.array(z.object({
  field: z.string().max(60),
  format: z.string().max(40).optional(),
  label: z.string().max(60).optional(),
})).default([]);

const signalTriggerConfigSchema = z.array(z.object({
  metric: z.string().max(60),
  baseline_field: z.string().max(60).optional(),
  format: z.string().max(40).optional(),
})).default([]);

export const signalDefinitionPayloadSchema = z.object({
  signal_key: z.string().min(1).max(60),
  display_name: z.string().min(1).max(120),
  subtitle: z.string().max(240).nullable().optional(),
  /** Inline conditions evaluated against the athlete snapshot. Same DSL the
   *  legacy pd_signals.conditions used so a one-shot migration is trivial. */
  conditions: z.object({
    match: z.enum(['all', 'any']).default('all'),
    conditions: z.array(z.object({
      field: z.string().min(1),
      operator: z.enum(['eq', 'neq', 'in', 'not_in', 'gt', 'gte', 'lt', 'lte']),
      value: z.unknown(),
    })),
  }).default({ match: 'all', conditions: [] }),
  /** Visual config — preserves the existing pd_signals visual system. */
  color: z.string().max(32).nullable().optional(),
  hero_background: z.string().max(80).nullable().optional(),
  arc_opacity: z.number().min(0).max(1).optional(),
  pill_background: z.string().max(80).nullable().optional(),
  bar_rgba: z.string().max(80).nullable().optional(),
  coaching_color: z.string().max(32).nullable().optional(),
  /** What the athlete sees when this signal fires. Plain-language template. */
  coaching_text_template: z.string().max(2000).nullable().optional(),
  pill_config: signalPillConfigSchema,
  trigger_config: signalTriggerConfigSchema,
  /** Optional adapted-plan override surfaced in the hero. */
  adapted_plan_name: z.string().max(120).nullable().optional(),
  adapted_plan_meta: z.record(z.string(), z.unknown()).nullable().optional(),
  show_urgency_badge: z.boolean().default(false),
  urgency_label: z.string().max(40).nullable().optional(),
  is_enabled: z.boolean().default(true),
});

// 26. program_rule
const programRuleConditionSchema = z.object({
  match: z.enum(['all', 'any']).default('all'),
  conditions: z.array(z.object({
    field: z.string().min(1),
    operator: z.enum(['eq', 'neq', 'in', 'not_in', 'gt', 'gte', 'lt', 'lte']),
    value: z.unknown(),
  })),
}).default({ match: 'all', conditions: [] });

export const programRuleCategoryEnum = z.enum([
  'safety', 'development', 'recovery', 'performance',
  'injury_prevention', 'position_specific', 'load_management',
]);

export const programRulePayloadSchema = z.object({
  rule_name: z.string().min(1).max(120),
  description: z.string().max(2000).nullable().optional(),
  category: programRuleCategoryEnum.default('development'),
  conditions: programRuleConditionSchema,
  /** Programs to mandate / block / promote. Use program ids or stable slugs. */
  mandatory_programs: z.array(z.string()).default([]),
  blocked_programs: z.array(z.string()).default([]),
  high_priority_programs: z.array(z.string()).default([]),
  prioritize_categories: z.array(z.string()).default([]),
  block_categories: z.array(z.string()).default([]),
  /** Numeric overrides (apply across all programs the rule matches). */
  load_multiplier: z.number().min(0).max(2).nullable().optional(),
  session_cap_minutes: z.number().int().positive().nullable().optional(),
  frequency_cap: z.number().int().positive().nullable().optional(),
  intensity_cap: intensityLevelEnum.nullable().optional(),
  /** Injected into the AI system prompt when programs are recommended. */
  ai_guidance_text: z.string().max(2000).nullable().optional(),
  /** Safety-critical rules cannot be overridden by AI. */
  safety_critical: z.boolean().default(false),
  /** Auditability — evidence grading. */
  evidence_source: z.string().max(240).nullable().optional(),
  evidence_grade: z.enum(['A', 'B', 'C']).nullable().optional(),
  is_enabled: z.boolean().default(true),
});


// ─── Phase 8: Bucketed-vertical payload schemas ───────────────────────────
//
// These five types each cover a distinct vertical (sleep / nutrition /
// wellbeing / injury / career) that previously had no dedicated coverage.
// Schemas are pragmatic: required name + description, structured arrays for
// the most common fields, plus a permissive `extras` map so the PD can
// iterate without schema churn.

const guidanceCommonFields = {
  /** Short label the CMS shows (truncate-safe). */
  name: z.string().min(1).max(120),
  /** Plain-English summary the PD wrote / parser extracted. */
  description: z.string().min(1).max(8000),
  /** Free-form notes / examples / source quotes. */
  notes: z.string().max(4000).nullable().optional(),
  /** Hard-stop conditions (kept here so guidance docs can flag without
   * needing a separate safety_gate rule). Optional. */
  hard_stops: z.array(z.string().max(400)).default([]),
  /** When this guidance applies (e.g. 'pre_match', 'post_injury_d3-d7'). */
  applies_when: z.array(z.string().max(120)).default([]),
  /** Override-able by the AI (false = safety_critical, never overridden). */
  ai_overridable: z.boolean().default(true),
  /** Auditability — evidence grading. */
  evidence_source: z.string().max(240).nullable().optional(),
  evidence_grade: z.enum(['A', 'B', 'C']).nullable().optional(),
  /** Free-form payload extension so the PD can iterate without schema churn. */
  extras: z.record(z.string(), z.unknown()).default({}),
};

// 27. sleep_policy
export const sleepPolicyPayloadSchema = z.object({
  ...guidanceCommonFields,
  recommended_sleep_hours: z.tuple([z.number(), z.number()]).optional(),
  bedtime_window_local: z.tuple([z.string().max(8), z.string().max(8)]).optional(), // "21:30","23:00"
  pre_match_sleep_min_hours: z.number().nullable().optional(),
  blue_light_cutoff_minutes_before_bed: z.number().int().nullable().optional(),
});

// 28. nutrition_policy
export const nutritionPolicyPayloadSchema = z.object({
  ...guidanceCommonFields,
  blocked_categories: z.array(z.string().max(120)).default([]),
  recommended_categories: z.array(z.string().max(120)).default([]),
  pre_session_window_minutes: z.number().int().nullable().optional(),
  post_session_window_minutes: z.number().int().nullable().optional(),
  hydration_ml_per_hour: z.number().int().nullable().optional(),
  /** Dietary patterns this rule respects/excludes (e.g. "halal","vegetarian"). */
  dietary_patterns: z.array(z.string().max(40)).default([]),
});

// 29. wellbeing_policy (mental health & performance)
export const wellbeingPolicyPayloadSchema = z.object({
  ...guidanceCommonFields,
  /** Concrete scenarios this rule handles ("athlete reports anxiety",
   * "athlete missed 3 check-ins", "pre-match nerves"). */
  triggers: z.array(z.string().max(240)).default([]),
  /** What Tomo does in response: tone shifts, suggested drills, escalations. */
  response_actions: z.array(z.string().max(240)).default([]),
  /** Topics Tomo must redirect away from (e.g. body-image, weight). */
  blocked_topics: z.array(z.string().max(120)).default([]),
  /** Reflection prompts Tomo can use. */
  reflection_prompts: z.array(z.string().max(400)).default([]),
});

// 30. injury_policy (active-injury + return-to-play)
export const injuryPolicyPayloadSchema = z.object({
  ...guidanceCommonFields,
  injury_categories: z.array(z.string().max(120)).default([]),
  /** RTP stage definitions: "stage_1: pain-free walk", "stage_2: light jog"… */
  rtp_stages: z.array(z.string().max(400)).default([]),
  /** Categories Tomo will block while injury is active. */
  blocked_categories_while_injured: z.array(z.string().max(120)).default([]),
  /** Required clinician sign-off before progressing. */
  requires_clinician_signoff: z.boolean().default(false),
  /** Default minimum days at each stage. */
  min_days_per_stage: z.number().int().nullable().optional(),
});

// 31. career_policy
export const careerPolicyPayloadSchema = z.object({
  ...guidanceCommonFields,
  /** What Tomo can suggest about CV writing, scouting visibility, scholarship. */
  guidance_topics: z.array(z.string().max(120)).default([]),
  /** Visibility levels Tomo will recommend (e.g. "private","scout-visible"). */
  visibility_recommendations: z.array(z.string().max(60)).default([]),
  /** Conditions where Tomo defers to a human career advisor. */
  defer_to_advisor_when: z.array(z.string().max(240)).default([]),
});


// ─── Payload registry & discriminated validation ──────────────────────────

export const directivePayloadSchemas = {
  identity: identityPayloadSchema,
  tone: tonePayloadSchema,
  response_shape: responseShapePayloadSchema,
  guardrail_phv: guardrailPhvPayloadSchema,
  guardrail_age: guardrailAgePayloadSchema,
  guardrail_load: guardrailLoadPayloadSchema,
  safety_gate: safetyGatePayloadSchema,
  threshold: thresholdPayloadSchema,
  performance_model: performanceModelPayloadSchema,
  mode_definition: modeDefinitionPayloadSchema,
  planning_policy: planningPolicyPayloadSchema,
  scheduling_policy: schedulingPolicyPayloadSchema,
  routing_intent: routingIntentPayloadSchema,
  routing_classifier: routingClassifierPayloadSchema,
  recommendation_policy: recommendationPolicyPayloadSchema,
  rag_policy: ragPolicyPayloadSchema,
  memory_policy: memoryPolicyPayloadSchema,
  surface_policy: surfacePolicyPayloadSchema,
  escalation: escalationPayloadSchema,
  coach_dashboard_policy: coachDashboardPolicyPayloadSchema,
  parent_report_policy: parentReportPolicyPayloadSchema,
  meta_parser: metaParserPayloadSchema,
  meta_conflict: metaConflictPayloadSchema,
  // Phase 7
  dashboard_section: dashboardSectionPayloadSchema,
  signal_definition: signalDefinitionPayloadSchema,
  program_rule: programRulePayloadSchema,
  // Phase 8: Bucketed verticals
  sleep_policy: sleepPolicyPayloadSchema,
  nutrition_policy: nutritionPolicyPayloadSchema,
  wellbeing_policy: wellbeingPolicyPayloadSchema,
  injury_policy: injuryPolicyPayloadSchema,
  career_policy: careerPolicyPayloadSchema,
} as const satisfies Record<DirectiveType, z.ZodTypeAny>;

export function validateDirectivePayload<T extends DirectiveType>(
  type: T,
  payload: unknown,
): z.infer<(typeof directivePayloadSchemas)[T]> {
  const schema = directivePayloadSchemas[type];
  return schema.parse(payload) as z.infer<(typeof directivePayloadSchemas)[T]>;
}

// ─── Common directive envelope (matches DB row shape) ─────────────────────

const directiveCommonFields = {
  audience: audienceEnum.default('all'),
  sport_scope: z.array(z.string()).default([]),
  age_scope: z.array(ageBandEnum).default([]),
  phv_scope: z.array(phvStageEnum).default([]),
  position_scope: z.array(z.string()).default([]),
  mode_scope: z.array(z.string()).default([]),
  priority: z.number().int().default(100),
  source_excerpt: z.string().nullable().optional(),
  confidence: z.number().min(0).max(1).nullable().optional(),
};

/**
 * Schema for creating/updating a directive. The payload is validated
 * polymorphically: a thin outer schema captures `directive_type` and the
 * common fields, then `validateDirectivePayload` is invoked against the
 * matching payload schema. Splitting it this way avoids the heavy generics
 * of `z.discriminatedUnion` over 23 arms while preserving full validation.
 */
export const directiveWriteEnvelopeSchema = z.object({
  directive_type: directiveTypeEnum,
  payload: z.unknown(),
  ...directiveCommonFields,
  status: directiveStatusEnum.default('proposed'),
  change_reason: z.string().max(500).optional(),
  document_id: z.string().uuid().nullable().optional(),
});

export type DirectiveWriteEnvelope = z.infer<typeof directiveWriteEnvelopeSchema>;

export interface DirectiveWriteInput<T extends DirectiveType = DirectiveType>
  extends Omit<DirectiveWriteEnvelope, 'directive_type' | 'payload'> {
  directive_type: T;
  payload: z.infer<(typeof directivePayloadSchemas)[T]>;
}

export function parseDirectiveWrite(input: unknown): DirectiveWriteInput {
  const envelope = directiveWriteEnvelopeSchema.parse(input);
  const validatedPayload = validateDirectivePayload(envelope.directive_type, envelope.payload);
  return { ...envelope, payload: validatedPayload } as DirectiveWriteInput;
}

// ─── Document schemas ─────────────────────────────────────────────────────

/**
 * Base shape — used on its own for partial updates and as the seed for the
 * create-time `documentWriteSchema` (which adds the source_text-or-file_url
 * refine on top).
 *
 * `source_file_url` accepts an empty string in addition to a valid URL
 * because the document editor sends "" rather than dropping the field when
 * a doc has no uploaded file. URL validation only runs when the value is
 * non-empty.
 */
/**
 * Methodology bucket slugs — matches DB CHECK on methodology_documents.bucket.
 * Mirrored in lib/admin/methodologyBuckets.ts (single source of truth there).
 */
export const bucketSlugEnum = z.enum([
  'voice', 'safety', 'training_science', 'calendar', 'programs',
  'knowledge_memory', 'athlete_dashboard', 'coach_parent', 'nutrition',
  'routing', 'wellbeing', 'injury', 'career', 'sleep',
]);
export type BucketSlugEnum = z.infer<typeof bucketSlugEnum>;

const documentBaseShape = z.object({
  title: z.string().min(1).max(200),
  audience: audienceEnum.default('all'),
  sport_scope: z.array(z.string()).default([]),
  age_scope: z.array(ageBandEnum).default([]),
  /** Optional bucket — null/undefined = legacy free-form doc (parser hits all types). */
  bucket: bucketSlugEnum.nullable().optional(),
  source_format: sourceFormatEnum,
  source_text: z.string().optional(),
  source_file_url: z
    .string()
    .optional()
    .refine(
      (v) => v === undefined || v === '' || /^https?:\/\//i.test(v),
      'source_file_url must be a valid http(s) URL when set.',
    ),
  status: documentStatusEnum.default('draft'),
});

export const documentWriteSchema = documentBaseShape.refine(
  (d) => !!d.source_text || !!d.source_file_url,
  { message: 'Either source_text or source_file_url must be provided.' },
);

/**
 * Update-time schema. All fields optional; the create-time
 * source_text-or-file_url refine is *not* re-applied (the document already
 * had content when it was created — partial updates don't have to re-prove
 * that on every save).
 */
export const documentUpdateSchema = documentBaseShape.partial();

export type DocumentWriteInput = z.infer<typeof documentWriteSchema>;
export type DocumentUpdateInput = z.infer<typeof documentUpdateSchema>;

// ─── Snapshot schemas ─────────────────────────────────────────────────────

export const snapshotPublishSchema = z.object({
  label: z.string().min(1).max(200),
  notes: z.string().max(2000).optional(),
});

export type SnapshotPublishInput = z.infer<typeof snapshotPublishSchema>;
