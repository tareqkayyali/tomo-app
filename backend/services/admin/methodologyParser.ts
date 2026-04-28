/**
 * Methodology Parser — Phase 2
 *
 * Pipeline:
 *   1. Take a methodology_documents row (or raw text + scope hints).
 *   2. Build a system prompt that lists the 23 directive types with
 *      one-line descriptions + a JSON schema for the parser tool call.
 *   3. Call Claude Sonnet via trackedClaudeCall with a single tool
 *      ("propose_directives") whose input is an array of directive
 *      proposals (type, payload, audience, scope, source_excerpt,
 *      confidence).
 *   4. Validate each proposal against directivePayloadSchemas[type].
 *      Drop invalid proposals — record validation errors in the
 *      result so the PD sees what fell through.
 *   5. Dedup against existing directives for the same document
 *      (matching directive_type + source_excerpt or normalised
 *      payload hash). Return only proposals that don't already exist.
 *
 * The parser does NOT write directives — that's the API route's job
 * (so we can wrap the writes in audit + transaction semantics there).
 */

import Anthropic from "@anthropic-ai/sdk";
import { trackedClaudeCall } from "@/lib/trackedClaudeCall";
import { logger } from "@/lib/logger";
import {
  directivePayloadSchemas,
  directiveTypeEnum,
  type DirectiveType,
} from "@/lib/validation/admin/directiveSchemas";
import {
  listDirectives,
  type MethodologyDirective,
} from "@/services/admin/directiveService";
import type { MethodologyDocument } from "@/services/admin/methodologyService";
import { BUCKET_BY_SLUG, type BucketSlug } from "@/lib/admin/methodologyBuckets";

const PARSER_MODEL = "claude-sonnet-4-20250514";
const MAX_OUTPUT_TOKENS = 8192;
const TEMPERATURE = 0.2;

// ─── Types ────────────────────────────────────────────────────────────────

export interface ProposedDirective {
  directive_type: DirectiveType;
  audience: "athlete" | "coach" | "parent" | "all";
  sport_scope: string[];
  age_scope: string[];
  phv_scope: string[];
  /** Phase 7: per-position scope (e.g. ["striker", "defender"]) */
  position_scope: string[];
  /** Phase 7: per-training-mode scope (e.g. ["build", "taper"]) */
  mode_scope: string[];
  priority: number;
  payload: Record<string, unknown>;
  source_excerpt: string | null;
  confidence: number | null;
}

export interface ParseError {
  directive_type?: string;
  source_excerpt?: string;
  message: string;
  zod_path?: string[];
}

export interface ParseResult {
  proposed: ProposedDirective[];
  duplicates: ProposedDirective[];      // skipped because already exists
  errors: ParseError[];                 // validation failures
  raw_count: number;                    // total proposals from the model
  cost_usd: number;
  latency_ms: number;
}

// ─── Type list shown to Claude ────────────────────────────────────────────

const TYPE_GUIDE: Array<{ type: DirectiveType; description: string; payload_keys: string[] }> = [
  { type: "identity", description: "Coaching personality, voice, register.",
    payload_keys: ["persona_name", "persona_description", "voice_attributes", "pronouns", "emoji_policy", "cultural_register"] },
  { type: "tone", description: "Banned phrases/patterns, jargon rules, required scaffolding.",
    payload_keys: ["banned_phrases", "banned_patterns", "required_companion_clauses", "age_specific_jargon_rules", "clinical_language_rules", "acronym_scaffolding_rules"] },
  { type: "response_shape", description: "Reply length, structure, opening/closing patterns, suggested chips.",
    payload_keys: ["max_length_by_intent", "structure_template", "opening_pattern", "closing_pattern", "bullet_policy", "emoji_density", "card_vs_text_rules", "chip_suggestions"] },
  { type: "guardrail_phv", description: "Safety rules during a growth spurt (PHV).",
    payload_keys: ["blocked_exercises", "phv_stage_rules", "advisory_or_blocking", "safe_alternatives", "unknown_age_default"] },
  { type: "guardrail_age", description: "Age-band-specific blocks and load caps.",
    payload_keys: ["age_band_overrides"] },
  { type: "guardrail_load", description: "Workload safety: ACWR zones, dual-load thresholds, recovery gaps.",
    payload_keys: ["acwr_zones", "dual_load_thresholds", "consecutive_hard_day_limit", "weekly_load_cap", "recovery_gap_hours"] },
  { type: "safety_gate", description: "Hard-stop conditions that refuse or redirect (rare).",
    payload_keys: ["trigger_condition", "block_action", "override_role", "user_facing_reason_template"] },
  { type: "threshold", description: "Numeric green/yellow/red zones for any signal.",
    payload_keys: ["metric_name", "zone_boundaries", "age_band_adjustments", "phv_adjustments", "sport_adjustments", "position_adjustments"] },
  { type: "performance_model", description: "The 4-layer model and per-position priorities.",
    payload_keys: ["layers", "per_position_priorities", "gap_thresholds", "phv_adjustment_rules"] },
  { type: "mode_definition", description: "Training modes (Build, Taper, Recovery, etc.).",
    payload_keys: ["mode_name", "activation_conditions", "load_multipliers", "intensity_caps", "duration_caps", "recommended_categories", "blocked_categories"] },
  { type: "planning_policy", description: "Season phases, taper, peak, competition proximity.",
    payload_keys: ["phase_definitions", "transition_rules", "taper_rules", "peak_rules", "competition_proximity_rules"] },
  { type: "scheduling_policy", description: "Calendar placement, school-day constraints, exam windows.",
    payload_keys: ["max_sessions_per_week", "recovery_gap_hours", "exam_window_overrides", "school_day_constraints", "cognitive_window_rules"] },
  { type: "routing_intent", description: "When user asks X, how should Tomo respond?",
    payload_keys: ["intent_id", "response_pattern", "capsule_type", "tool_chain", "agent_role", "llm_tier", "priority", "multi_step_definition"] },
  { type: "routing_classifier", description: "Examples and rules for understanding user intent.",
    payload_keys: ["classifier_version", "intent_examples", "fallback_intent", "agent_lock_rules", "smalltalk_routing", "confidence_threshold"] },
  { type: "recommendation_policy", description: "What may / must / must-not be recommended.",
    payload_keys: ["scope_conditions", "blocked_categories", "mandatory_categories", "priority_override", "max_recs_per_turn", "forced_inclusions"] },
  { type: "rag_policy", description: "Knowledge sources to use or avoid.",
    payload_keys: ["forced_domains", "blocked_domains", "chunk_count", "sport_filter", "age_filter", "phv_filter", "min_similarity"] },
  { type: "memory_policy", description: "What atoms to extract, how long to retain.",
    payload_keys: ["extraction_prompt_template", "atom_types", "truncation_tokens", "dedup_strategy", "retention_days", "sport_aware_rules", "extraction_trigger"] },
  { type: "surface_policy", description: "What each audience (athlete/coach/parent) sees, hides, simplifies.",
    payload_keys: ["audience", "what_to_show", "what_to_hide", "tone_override_id", "format_override_id", "language_simplification_level", "terminology_translations"] },
  { type: "escalation", description: "Trigger conditions and notification templates for alerting coach/parent.",
    payload_keys: ["trigger_conditions", "target_audience", "notification_template", "urgency", "cooldown_hours", "requires_athlete_consent"] },
  { type: "coach_dashboard_policy", description: "Coach view widgets, alerts, summary template.",
    payload_keys: ["dashboard_widgets", "alert_rules", "summary_template", "roster_sort_rules"] },
  { type: "parent_report_policy", description: "Parent report frequency, template, blocked topics.",
    payload_keys: ["report_frequency", "report_template", "blocked_topics", "language_simplification_level", "consent_requirements"] },
  { type: "meta_parser", description: "Parser settings (rare — usually internal).",
    payload_keys: ["extraction_prompt", "extraction_schema_version", "extraction_model", "chunking_strategy", "confidence_threshold_for_auto_propose"] },
  { type: "meta_conflict", description: "Rules for merging conflicting directives (rare — usually internal).",
    payload_keys: ["merge_rules_per_type", "priority_tiebreakers", "audience_inheritance_rules"] },
  // Phase 7: Dashboard + Programs governance
  { type: "dashboard_section",
    description: "A card on the athlete's dashboard. Use when the methodology says \"X audience should see Y\". component_type must be one of: signal_hero, status_ring, kpi_row, sparkline_row, dual_load, benchmark, rec_list, event_list, growth_card, engagement_bar, protocol_banner, custom_card. Reference an existing metric_key when the card shows a single metric (e.g. sleep_hours, hrv_morning_ms, ccrs_score). Set scope arrays (sport_scope, age_scope, position_scope, mode_scope) for per-profile rules.",
    payload_keys: ["section_key", "display_name", "component_type", "panel_key", "sort_order", "metric_key", "coaching_text_template", "config", "is_enabled"] },
  { type: "signal_definition",
    description: "A hero alert at the top of the dashboard. Use when the methodology describes when to surface an alert (e.g. \"show 'overloaded' when ACWR > 1.5\"). conditions follow the {match, conditions:[{field, operator, value}]} DSL.",
    payload_keys: ["signal_key", "display_name", "subtitle", "conditions", "color", "hero_background", "coaching_text_template", "pill_config", "trigger_config", "show_urgency_badge", "urgency_label", "is_enabled"] },
  { type: "program_rule",
    description: "A rule governing which training programs Tomo recommends. Use when the methodology says \"give X programs to Y\" or \"never recommend Z to W\". Set mandatory_programs / blocked_programs (program ids or slugs), or prioritize_categories / block_categories (broader category names). load_multiplier scales prescribed load (0.0-2.0). safety_critical=true means AI cannot override.",
    payload_keys: ["rule_name", "description", "category", "conditions", "mandatory_programs", "blocked_programs", "high_priority_programs", "prioritize_categories", "block_categories", "load_multiplier", "session_cap_minutes", "frequency_cap", "intensity_cap", "ai_guidance_text", "safety_critical", "evidence_source", "evidence_grade", "is_enabled"] },
];

// ─── Strict per-type payload shapes (shown to Claude) ────────────────────
// Without these, Claude knows the field NAMES but not the TYPES, and
// improvises shapes that fail Zod validation. The shapes below are
// rendered into the system prompt as TypeScript-like signatures plus
// a concrete JSON example for each common type.

const PAYLOAD_SHAPES: Partial<Record<DirectiveType, { shape: string; example: string }>> = {
  identity: {
    shape:
      `persona_name:           string
persona_description:    string  (long-form description, may be multi-paragraph)
voice_attributes:       string[]   e.g. ["warm","direct","evidence-based"]
pronouns:               string  (optional)
emoji_policy:           "none" | "sparing" | "moderate" | "frequent"   ← strict enum
cultural_register:      string  (optional)`,
    example: `{
  "persona_name": "Tomo",
  "persona_description": "A steady, knowledgeable coach who...",
  "voice_attributes": ["warm","direct","evidence-based"],
  "emoji_policy": "sparing"
}`,
  },
  tone: {
    shape:
      `banned_phrases:               string[]   exact phrases the assistant must never say
banned_patterns:              string[]   regex source strings; leave empty if unsure
required_companion_clauses:   Record<string, string>   { phrase: required_followup }
                              KEY = phrase that triggers; VALUE = follow-up text the assistant must add
age_specific_jargon_rules:    Record<string, string[]>   { age_band: forbidden_terms }
clinical_language_rules:      string[]   list of clinical phrases to avoid (a flat array)
acronym_scaffolding_rules:    string[]   list of acronyms (string names ONLY, NOT translations)
                              e.g. ["ACWR","PHV","RPE","HRV"]   ← if the doc shows "ACWR → 'workload trend'",
                              put only "ACWR" in this list. The translation does NOT belong here.`,
    example: `{
  "banned_phrases": ["great effort","fantastic work","amazing job"],
  "banned_patterns": [],
  "required_companion_clauses": {},
  "clinical_language_rules": [],
  "acronym_scaffolding_rules": ["ACWR","PHV","RPE","HRV"]
}`,
  },
  response_shape: {
    shape:
      `max_length_by_intent:   Record<string, number>   { intent_key: integer_count }
                        VALUES MUST BE INTEGERS. If the source says "2-4 sentences", omit the field
                        or use a single integer like 4.
structure_template:     string  (optional)
opening_pattern:        string  (optional)
closing_pattern:        string  (optional)
bullet_policy:          "avoid" | "allow" | "prefer"   ← strict enum
emoji_density:          "none" | "low" | "medium" | "high"   ← strict enum (lowercase)
card_vs_text_rules:     Record<string, "card" | "text" | "mixed">
chip_suggestions:       Record<string, string[]>`,
    example: `{
  "max_length_by_intent": {},
  "bullet_policy": "allow",
  "emoji_density": "low"
}`,
  },
  guardrail_phv: {
    shape:
      `blocked_exercises:        string[]
blocked_patterns:         string[]   regex source strings (advanced)
phv_stage_rules:          Record<"pre_phv"|"mid_phv"|"post_phv", { blocked_exercises: string[], intensity_cap: "rest"|"light"|"moderate"|"full"? }>
advisory_or_blocking:     "advisory" | "blocking"
safe_alternatives:        Record<string, string[]>   { exercise: alternatives }
safety_warning_template:  string
unknown_age_default:      "conservative" | "permissive"`,
    example: `{
  "blocked_exercises": ["barbell back squat","depth jump"],
  "advisory_or_blocking": "advisory",
  "unknown_age_default": "conservative"
}`,
  },
  guardrail_load: {
    shape:
      `acwr_zones:                  { green:[number,number], yellow:[number,number], red:[number,number] }  (optional)
dual_load_thresholds:        object  (optional)
consecutive_hard_day_limit:  number  (integer)
weekly_load_cap:             number
recovery_gap_hours:          number  (integer)`,
    example: `{
  "consecutive_hard_day_limit": 3,
  "recovery_gap_hours": 24
}`,
  },
  threshold: {
    shape:
      `metric_name:        string
zone_boundaries:    { green?:[number,number], yellow?:[number,number], red?:[number,number] }
age_band_adjustments:  Record<string, number>  (optional)
phv_adjustments:       Record<string, number>  (optional)
sport_adjustments:     Record<string, number>  (optional)`,
    example: `{
  "metric_name": "readiness_score",
  "zone_boundaries": { "green":[80,100], "yellow":[60,80], "red":[0,60] }
}`,
  },
  program_rule: {
    shape:
      `rule_name:                string
description:              string  (optional)
category:                 "safety" | "development" | "recovery" | "performance" | "injury_prevention" | "position_specific" | "load_management"
conditions:               { match: "all"|"any", conditions: [{field, operator, value}] }
mandatory_programs:       string[]   program ids/slugs
blocked_programs:         string[]
high_priority_programs:   string[]
prioritize_categories:    string[]
block_categories:         string[]
load_multiplier:          number  (0..2)
session_cap_minutes:      number  (integer)
frequency_cap:            number  (integer)
intensity_cap:            "rest" | "light" | "moderate" | "full"
ai_guidance_text:         string
safety_critical:          boolean`,
    example: `{
  "rule_name": "U15 strikers Build phase",
  "category": "position_specific",
  "conditions": { "match": "all", "conditions": [] },
  "mandatory_programs": ["acl_prevention","hamstring_protocol"],
  "blocked_programs": ["heavy_deadlift"],
  "intensity_cap": "moderate",
  "safety_critical": false
}`,
  },
  dashboard_section: {
    shape:
      `section_key:              string  (lowercase_underscore label, your invented name)
display_name:             string  (what the athlete reads as the card title)
component_type:           "signal_hero" | "status_ring" | "kpi_row" | "sparkline_row" | "dual_load" | "benchmark" | "rec_list" | "event_list" | "growth_card" | "engagement_bar" | "protocol_banner" | "custom_card"
panel_key:                "main" | "program" | "metrics" | "progress"   default "main"
sort_order:               number  (integer; lower = higher on screen)
metric_key:               string | null   (only for kpi_row, sparkline_row, status_ring, benchmark)
coaching_text_template:   string | null   (supports {field} placeholders)
config:                   object   (usually empty {})
is_enabled:               boolean`,
    example: `{
  "section_key": "u13_striker_sleep_trend",
  "display_name": "Sleep — last 7 days",
  "component_type": "sparkline_row",
  "panel_key": "main",
  "sort_order": 5,
  "metric_key": "sleep_hours",
  "coaching_text_template": "You've slept {sleep_hours}h on average this week.",
  "config": {},
  "is_enabled": true
}`,
  },
  memory_policy: {
    shape:
      `extraction_prompt_template:  string
atom_types:                  string[]
truncation_tokens:           number  (integer)
dedup_strategy:              "naive" | "embedding" | "llm_judge"
retention_days:              number  (integer)
sport_aware_rules:           object  (usually {})
extraction_trigger:          { on_turn_count?: number, on_signal: string[] }`,
    example: `{
  "extraction_prompt_template": "Extract goals, concerns, injuries...",
  "atom_types": ["current_goals","unresolved_concerns"],
  "truncation_tokens": 500,
  "dedup_strategy": "embedding",
  "retention_days": 365,
  "extraction_trigger": { "on_signal": [] }
}`,
  },
};

// ─── Prompt builders ──────────────────────────────────────────────────────

function buildSystemPrompt(): string {
  const typeList = TYPE_GUIDE.map(
    (t) => `- "${t.type}": ${t.description} Payload keys: ${t.payload_keys.join(", ")}.`,
  ).join("\n");

  // Render the strict-shape section for the types where we provide one.
  const shapeBlock = (Object.entries(PAYLOAD_SHAPES) as Array<
    [DirectiveType, { shape: string; example: string }]
  >)
    .map(
      ([type, { shape, example }]) =>
        `## "${type}"\n\nFields:\n${shape}\n\nExample payload:\n${example}`,
    )
    .join("\n\n");

  return `You are the Methodology Parser for Tomo — an AI coaching platform for young athletes.

Your job: read a Performance Director's prose methodology and extract every machine-applicable rule into one of 26 directive types.

# Directive types
${typeList}

# Strict payload shapes for the most common types

The "payload" object MUST match the field types below exactly. If you produce
a string where a number is expected, an array where a record is expected, or
an enum value not in the listed set, the rule is dropped.

${shapeBlock}

# Rules
- Output ONE proposal per atomic rule. Do not bundle unrelated rules into one directive.
- The "payload" object MUST use only the keys listed for the chosen directive_type. Do not invent keys.
- Set "source_excerpt" to the exact sentence(s) from the document that the rule comes from. This is required.
- Set "confidence" between 0 and 1 reflecting how sure you are. Below 0.5 means the PD should review carefully.
- Set "audience" to "all" unless the source text targets a specific audience (athlete/coach/parent).
- "sport_scope" / "age_scope" / "phv_scope" / "position_scope" / "mode_scope" are arrays — leave empty unless the source explicitly scopes the rule.
  - age_scope values must be from: U13, U15, U17, U19, U21, senior.
  - phv_scope values must be from: pre_phv, mid_phv, post_phv.
  - position_scope: free-form lowercase tokens used in the athlete profile (e.g. striker, defender, midfielder, goalkeeper).
  - mode_scope: training mode tokens (e.g. build, taper, recovery, pre_match).
- For payload field types: arrays use array literals, numeric fields use numbers, booleans use true/false. Never embed JSON inside strings.
- If the document expresses a rule that doesn't fit any of the 26 types cleanly, skip it — do not force a fit.
- Do not duplicate rules. If the same rule appears twice in the source, emit it once.

# Critical type pitfalls (read carefully)

1. \`emoji_policy\` (identity) and \`emoji_density\` (response_shape) use DIFFERENT enums.
   - emoji_policy: "none" | "sparing" | "moderate" | "frequent"
   - emoji_density: "none" | "low" | "medium" | "high"
   If the doc says "Emoji density: low" → response_shape.emoji_density = "low" AND
   identity.emoji_policy = "sparing" (the closest equivalent).

2. \`acronym_scaffolding_rules\` is a flat \`string[]\` of acronym NAMES, NOT a record of translations.
   If the source has "ACWR → 'your workload trend'; PHV → 'your growth phase'":
     CORRECT:   "acronym_scaffolding_rules": ["ACWR","PHV","RPE","HRV"]
     WRONG:     {"ACWR": "your workload trend", "PHV": "your growth phase"}
   The translations themselves don't belong in any payload field — they're
   coaching-style preferences captured in identity.persona_description or
   tone.banned_patterns.

3. \`clinical_language_rules\` is \`string[]\` (a list of phrases), not a record.
   If the doc lists "Avoid: data, metrics, optimal":
     CORRECT:   ["data","metrics","optimal"]
     WRONG:     {"data": "avoid", "metrics": "avoid"}

4. \`required_companion_clauses\` is \`Record<string,string>\` — KEYS are trigger
   phrases, VALUES are the follow-up text required when the trigger appears.
   If the doc just lists banned phrases with no follow-ups, leave this as \`{}\`
   and put the phrases in \`banned_phrases\` instead.

5. \`max_length_by_intent\` values MUST be integers. If the source says
   "2-4 short sentences", do NOT put "2-4 sentences" as a string. Either:
     - Omit the field entirely, OR
     - Set a single integer like {"default": 4} (interpreted as max sentence count).

6. Enum values are exact lowercase strings from the listed set. "Low" ≠ "low".

7. If a field's value is unclear from the document, OMIT the field. Don't guess.

# Choosing the right directive_type (classification matters)

Pick the type by what the rule CONTROLS, not by the words in the source.

- A rule about **how Tomo phrases things** ("must always include the reason", "every recommendation paired with a one-line explanation", "never use stand-alone instructions") is a TONE rule, not \`recommendation_policy\`. \`recommendation_policy\` is for *what categories* may/must/must-not be recommended (e.g. "never recommend Olympic lifts to U13s"); the *how it's said* belongs in tone or response_shape.

- A rule about **what Tomo does when the athlete signals distress** ("Tomo drops all training advice and acknowledges the athlete") is a TONE rule (or escalation/safety_gate if it triggers a coach alert), not a \`routing_intent\`. \`routing_intent\` is for "when the athlete asks X (a specific intent like build_session or readiness_check), respond using pattern Y". It maps a CLASSIFIED INTENT to a response pattern, not a context-aware behavioural shift.

- If a rule reads as "in situation X, change tone/format" → use \`tone\` or \`response_shape\` with appropriate scope.
- If a rule reads as "when athlete asks for X, route to Y" with a clearly-named intent → use \`routing_intent\`.
- If a rule reads as "what programs Tomo can/cannot recommend" → \`recommendation_policy\` (chat side) or \`program_rule\` (programs tab).

When in doubt, prefer the broader / more conservative type. A rule that fits multiple types should be emitted only once, under the type that captures its primary effect.

Call the propose_directives tool exactly once with the full array of proposals. Do not return prose.`;
}

const DIRECTIVE_TOOL_INPUT_SCHEMA = {
  type: "object" as const,
  properties: {
    directives: {
      type: "array",
      description: "Array of directive proposals extracted from the methodology document.",
      items: {
        type: "object",
        properties: {
          directive_type: {
            type: "string",
            enum: directiveTypeEnum.options,
            description: "Which of the 23 directive types this rule belongs to.",
          },
          audience: {
            type: "string",
            enum: ["athlete", "coach", "parent", "all"],
          },
          sport_scope: { type: "array", items: { type: "string" } },
          age_scope: { type: "array", items: { type: "string" } },
          phv_scope: { type: "array", items: { type: "string" } },
          position_scope: { type: "array", items: { type: "string" } },
          mode_scope: { type: "array", items: { type: "string" } },
          priority: { type: "integer", description: "Lower = higher priority. Default 100." },
          payload: {
            type: "object",
            description: "Type-specific payload. Keys must match the listed payload_keys for the directive_type.",
            additionalProperties: true,
          },
          source_excerpt: {
            type: "string",
            description: "Exact sentence(s) from the source document that produced this rule.",
          },
          confidence: { type: "number", minimum: 0, maximum: 1 },
        },
        required: ["directive_type", "payload", "source_excerpt", "confidence"],
      },
    },
  },
  required: ["directives"],
};

function buildUserMessage(doc: MethodologyDocument): string {
  const scope: string[] = [];
  if (doc.audience !== "all") scope.push(`Default audience: ${doc.audience}.`);
  if (doc.sport_scope.length) scope.push(`Sport scope: ${doc.sport_scope.join(", ")}.`);
  if (doc.age_scope.length) scope.push(`Age scope: ${doc.age_scope.join(", ")}.`);

  // Bucket-aware: when set, restrict Claude to the bucket's allowed types.
  // The post-parse filter (filterToBucket) is the hard guarantee; this prompt
  // hint just makes Claude's job easier so it doesn't produce dropped rules.
  const bucketHint =
    doc.bucket && BUCKET_BY_SLUG[doc.bucket as BucketSlug]
      ? [
          "",
          "## Bucket constraint",
          `This document is in the "${BUCKET_BY_SLUG[doc.bucket as BucketSlug].label}" bucket.`,
          `Emit ONLY directive_types from this set: ${BUCKET_BY_SLUG[doc.bucket as BucketSlug].owns.join(", ")}.`,
          "Any other directive_type will be dropped.",
        ].join("\n")
      : "";

  return [
    "# Methodology document",
    `Title: ${doc.title}`,
    scope.length ? scope.join(" ") : "",
    bucketHint,
    "",
    "## Source text",
    doc.source_text ?? "(empty)",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Drop proposals whose directive_type is not in the bucket's allowed set.
 * Defense in depth on top of the prompt hint — if Claude still emits a
 * cross-bucket type, it gets filtered here. No-op when bucket is unset.
 */
function filterToBucket(
  proposed: ProposedDirective[],
  bucket: string | null | undefined,
  errors: ParseError[],
): ProposedDirective[] {
  if (!bucket || !BUCKET_BY_SLUG[bucket as BucketSlug]) return proposed;
  const allowed = new Set(BUCKET_BY_SLUG[bucket as BucketSlug].owns);
  const kept: ProposedDirective[] = [];
  for (const p of proposed) {
    if (allowed.has(p.directive_type)) {
      kept.push(p);
    } else {
      errors.push({
        directive_type: p.directive_type,
        message: `Dropped a "${p.directive_type}" proposal — not allowed in the "${BUCKET_BY_SLUG[bucket as BucketSlug].label}" bucket. Move it to the right bucket's document.`,
      });
    }
  }
  return kept;
}

// ─── Coercion (Postel's law) ──────────────────────────────────────────────
//
// Claude occasionally produces a close-but-not-exact payload shape — e.g.
// returning a Record where we expect a string[], or a string where we
// expect a number. Rather than dropping every such directive, we apply a
// small set of deterministic coercions that fix the common misfires
// without changing the rule's intent. Anything we can't safely coerce
// is left for Zod to reject and surface to the operator.
//
// Coercion is per-directive-type and only touches fields known to be
// confused. Unknown / unaffected fields pass through untouched.

const EMOJI_POLICY_SYNONYMS: Record<string, string> = {
  // Common synonyms Claude returns for emoji_policy. Map to the canonical enum.
  low: "sparing",
  light: "sparing",
  rare: "sparing",
  rarely: "sparing",
  some: "moderate",
  often: "frequent",
  high: "frequent",
};

const BULLET_POLICY_SYNONYMS: Record<string, string> = {
  no: "avoid",
  none: "avoid",
  conditional: "allow",
  limited: "allow",
  yes: "prefer",
  always: "prefer",
};

const EMOJI_DENSITY_SYNONYMS: Record<string, string> = {
  sparing: "low",
  sparingly: "low",
  rare: "low",
  some: "medium",
  often: "high",
  frequent: "high",
};

const INTENSITY_CAP_SYNONYMS: Record<string, string> = {
  rest_only: "rest",
  light_only: "light",
  moderate_only: "moderate",
  full_intensity: "full",
};

const RESPONSE_PATTERN_SYNONYMS: Record<string, string> = {
  // Common things Claude tries when the prose is open-ended.
  acknowledge: "open_coaching",
  acknowledgement: "open_coaching",
  acknowledgment: "open_coaching",
  conversational: "open_coaching",
  chat: "open_coaching",
  pause_training: "open_coaching",
  drop_training: "open_coaching",
  capsule: "capsule_direct",
  show_data: "data_display",
  display_data: "data_display",
  step_by_step: "multi_step",
  flow: "multi_step",
  action: "write_action",
  write: "write_action",
  open: "open_coaching",
};

const LLM_TIER_SYNONYMS: Record<string, string> = {
  // Claude versions in the wild — collapse them to the canonical tier.
  "claude-haiku": "haiku",
  "claude-sonnet": "sonnet",
  "claude-opus": "opus",
  "haiku-3": "haiku",
  "haiku-4": "haiku",
  "sonnet-3": "sonnet",
  "sonnet-4": "sonnet",
  "opus-3": "opus",
  "opus-4": "opus",
  fast: "haiku",
  default: "sonnet",
  smart: "sonnet",
  best: "opus",
  high: "opus",
};

const PRIORITY_OVERRIDE_SYNONYMS: Record<string, string> = {
  // Verbal priorities Claude returns instead of Pn codes.
  must: "P0",
  critical: "P0",
  highest: "P0",
  high: "P1",
  medium: "P2",
  normal: "P2",
  low: "P3",
  lowest: "P3",
  "0": "P0",
  "1": "P1",
  "2": "P2",
  "3": "P3",
};

function lowerEnum(v: unknown, allowed: readonly string[], synonyms?: Record<string, string>): unknown {
  if (typeof v !== "string") return v;
  const lc = v.trim().toLowerCase();
  if (allowed.includes(lc)) return lc;
  if (synonyms && synonyms[lc] !== undefined) return synonyms[lc];
  // Couldn't normalise — return as-is and let Zod reject so the operator sees it.
  return v;
}

function objectKeysToArray(v: unknown): unknown {
  // If Claude returned `{ ACWR: "foo", PHV: "bar" }` for a field we expect
  // to be string[] (just the names), take the keys.
  if (Array.isArray(v)) return v;
  if (v && typeof v === "object") return Object.keys(v as Record<string, unknown>);
  return v;
}

function arrayToEmptyRecord(v: unknown): unknown {
  // If Claude returned an array for a field we expect to be Record<string,...>,
  // and the array is empty, coerce to {}. Non-empty arrays are left alone
  // (Zod will reject and the operator can fix the source).
  if (Array.isArray(v) && v.length === 0) return {};
  return v;
}

function dropNonNumericValues(v: unknown): unknown {
  // For Record<string, number> fields where Claude returned strings:
  // try to extract the first integer from each string. If unparseable,
  // drop the entry entirely.
  if (!v || typeof v !== "object" || Array.isArray(v)) return v;
  const out: Record<string, number> = {};
  for (const [k, raw] of Object.entries(v as Record<string, unknown>)) {
    if (typeof raw === "number" && Number.isFinite(raw)) {
      out[k] = raw;
      continue;
    }
    if (typeof raw === "string") {
      const m = raw.match(/-?\d+(?:\.\d+)?/);
      if (m) {
        const n = Number(m[0]);
        if (Number.isFinite(n)) {
          out[k] = n;
          continue;
        }
      }
    }
    // unparseable — drop
  }
  return out;
}

export function coercePayload(
  type: DirectiveType,
  raw: unknown,
): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const p = { ...(raw as Record<string, unknown>) };

  switch (type) {
    case "identity":
      if ("emoji_policy" in p) {
        p.emoji_policy = lowerEnum(
          p.emoji_policy,
          ["none", "sparing", "moderate", "frequent"] as const,
          EMOJI_POLICY_SYNONYMS,
        );
      }
      break;

    case "tone":
      // acronym_scaffolding_rules: Record -> keys (string[])
      if ("acronym_scaffolding_rules" in p) {
        p.acronym_scaffolding_rules = objectKeysToArray(p.acronym_scaffolding_rules);
      }
      // clinical_language_rules: Record -> keys (string[])
      if ("clinical_language_rules" in p) {
        p.clinical_language_rules = objectKeysToArray(p.clinical_language_rules);
      }
      // required_companion_clauses: empty array -> {}
      if ("required_companion_clauses" in p) {
        p.required_companion_clauses = arrayToEmptyRecord(p.required_companion_clauses);
      }
      // age_specific_jargon_rules: empty array -> {}
      if ("age_specific_jargon_rules" in p) {
        p.age_specific_jargon_rules = arrayToEmptyRecord(p.age_specific_jargon_rules);
      }
      break;

    case "response_shape":
      if ("bullet_policy" in p) {
        p.bullet_policy = lowerEnum(
          p.bullet_policy,
          ["avoid", "allow", "prefer"] as const,
          BULLET_POLICY_SYNONYMS,
        );
      }
      if ("emoji_density" in p) {
        p.emoji_density = lowerEnum(
          p.emoji_density,
          ["none", "low", "medium", "high"] as const,
          EMOJI_DENSITY_SYNONYMS,
        );
      }
      if ("max_length_by_intent" in p) {
        p.max_length_by_intent = dropNonNumericValues(p.max_length_by_intent);
      }
      if ("card_vs_text_rules" in p) {
        // Empty-array safety net.
        p.card_vs_text_rules = arrayToEmptyRecord(p.card_vs_text_rules);
      }
      if ("chip_suggestions" in p) {
        p.chip_suggestions = arrayToEmptyRecord(p.chip_suggestions);
      }
      break;

    case "guardrail_phv":
      if ("advisory_or_blocking" in p) {
        p.advisory_or_blocking = lowerEnum(
          p.advisory_or_blocking,
          ["advisory", "blocking"] as const,
        );
      }
      if ("unknown_age_default" in p) {
        p.unknown_age_default = lowerEnum(
          p.unknown_age_default,
          ["conservative", "permissive"] as const,
        );
      }
      break;

    case "mode_definition":
      if ("intensity_caps" in p) {
        p.intensity_caps = lowerEnum(
          p.intensity_caps,
          ["rest", "light", "moderate", "full"] as const,
          INTENSITY_CAP_SYNONYMS,
        );
      }
      break;

    case "program_rule":
      if ("intensity_cap" in p) {
        p.intensity_cap = lowerEnum(
          p.intensity_cap,
          ["rest", "light", "moderate", "full"] as const,
          INTENSITY_CAP_SYNONYMS,
        );
      }
      if ("category" in p) {
        p.category = lowerEnum(
          p.category,
          [
            "safety", "development", "recovery", "performance",
            "injury_prevention", "position_specific", "load_management",
          ] as const,
        );
      }
      break;

    case "memory_policy":
      if ("dedup_strategy" in p) {
        p.dedup_strategy = lowerEnum(
          p.dedup_strategy,
          ["naive", "embedding", "llm_judge"] as const,
        );
      }
      break;

    case "routing_intent":
      if ("response_pattern" in p) {
        p.response_pattern = lowerEnum(
          p.response_pattern,
          [
            "capsule_direct",
            "data_display",
            "multi_step",
            "write_action",
            "open_coaching",
          ] as const,
          RESPONSE_PATTERN_SYNONYMS,
        );
      }
      if ("llm_tier" in p) {
        // Claude often emits null / model-version strings for fields it
        // doesn't have a clear value for. Coerce to the canonical tier
        // when possible; drop entirely when not (the field is optional).
        const v = p.llm_tier;
        if (v === null || v === undefined || v === "") {
          delete p.llm_tier;
        } else {
          const normalised = lowerEnum(
            v,
            ["haiku", "sonnet", "opus"] as const,
            LLM_TIER_SYNONYMS,
          );
          if (
            normalised === "haiku" ||
            normalised === "sonnet" ||
            normalised === "opus"
          ) {
            p.llm_tier = normalised;
          } else {
            delete p.llm_tier;
          }
        }
      }
      if ("multi_step_definition" in p) {
        // Schema expects a record/object. Claude sometimes returns a string
        // describing the multi-step flow in prose, or an empty array.
        const v = p.multi_step_definition;
        if (typeof v === "string") {
          p.multi_step_definition = v.trim() ? { description: v } : undefined;
        } else if (Array.isArray(v) && v.length === 0) {
          p.multi_step_definition = undefined;
        }
      }
      break;

    case "recommendation_policy":
      if ("priority_override" in p) {
        const v = p.priority_override;
        if (v === null || v === undefined || v === "") {
          delete p.priority_override;
        } else {
          // lowerEnum lowercases input before comparing; the Pn allowed
          // set is uppercase so "P0" passes through unchanged via the
          // fall-through (`return v`). Synonyms map words → uppercase Pn.
          const normalised = lowerEnum(
            v,
            ["P0", "P1", "P2", "P3"] as const,
            PRIORITY_OVERRIDE_SYNONYMS,
          );
          if (
            normalised === "P0" ||
            normalised === "P1" ||
            normalised === "P2" ||
            normalised === "P3"
          ) {
            p.priority_override = normalised;
          } else {
            delete p.priority_override;
          }
        }
      }
      if ("forced_inclusions" in p) {
        // Schema expects Record<string, unknown>. Claude often returns
        // an array of phrases ("must include the reason for the recommendation",
        // ...). Convert empty arrays to {}; treat non-empty arrays as
        // a list keyed by index so the data is preserved + Zod accepts it.
        const v = p.forced_inclusions;
        if (Array.isArray(v)) {
          if (v.length === 0) {
            p.forced_inclusions = {};
          } else {
            const asRecord: Record<string, unknown> = {};
            v.forEach((item, idx) => {
              asRecord[String(idx)] = item;
            });
            p.forced_inclusions = asRecord;
          }
        }
      }
      if ("scope_conditions" in p && Array.isArray(p.scope_conditions)) {
        // Same shape coercion for scope_conditions when Claude returns []
        p.scope_conditions =
          (p.scope_conditions as unknown[]).length === 0 ? {} : p.scope_conditions;
      }
      break;

    case "dashboard_section":
      if ("panel_key" in p) {
        p.panel_key = lowerEnum(
          p.panel_key,
          ["main", "program", "metrics", "progress"] as const,
        );
      }
      break;
  }

  return p;
}

// ─── Dedup ────────────────────────────────────────────────────────────────

function normaliseExcerpt(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase().replace(/\s+/g, " ").slice(0, 200);
}

function isDuplicate(proposal: ProposedDirective, existing: MethodologyDirective[]): boolean {
  const propKey = normaliseExcerpt(proposal.source_excerpt);
  if (!propKey) return false;
  return existing.some(
    (e) => e.directive_type === proposal.directive_type && normaliseExcerpt(e.source_excerpt) === propKey,
  );
}

// ─── Public entry point ───────────────────────────────────────────────────

export async function parseMethodologyDocument(
  doc: MethodologyDocument,
  userId: string,
): Promise<ParseResult> {
  if (!doc.source_text || doc.source_text.trim().length < 30) {
    return {
      proposed: [],
      duplicates: [],
      errors: [{ message: "Document has no source text yet. Add some methodology before parsing." }],
      raw_count: 0,
      cost_usd: 0,
      latency_ms: 0,
    };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      proposed: [],
      duplicates: [],
      errors: [{ message: "ANTHROPIC_API_KEY is not set. The parser cannot run." }],
      raw_count: 0,
      cost_usd: 0,
      latency_ms: 0,
    };
  }

  const client = new Anthropic({ apiKey });
  const errors: ParseError[] = [];

  let message;
  let telemetry;
  try {
    const result = await trackedClaudeCall(
      client,
      {
        model: PARSER_MODEL,
        max_tokens: MAX_OUTPUT_TOKENS,
        temperature: TEMPERATURE,
        system: buildSystemPrompt(),
        tools: [
          {
            name: "propose_directives",
            description: "Submit the array of directive proposals extracted from the methodology document.",
            input_schema: DIRECTIVE_TOOL_INPUT_SCHEMA,
          },
        ],
        tool_choice: { type: "tool", name: "propose_directives" } as any,
        messages: [{ role: "user", content: buildUserMessage(doc) }],
      },
      {
        userId,
        agentType: "methodology_parser",
      },
    );
    message = result.message;
    telemetry = result.telemetry;
  } catch (err) {
    logger.error?.("[methodologyParser] Claude call failed", { err });
    return {
      proposed: [],
      duplicates: [],
      errors: [{ message: `Parser call failed: ${err instanceof Error ? err.message : String(err)}` }],
      raw_count: 0,
      cost_usd: 0,
      latency_ms: 0,
    };
  }

  // Extract tool_use block
  const toolBlock = (message.content ?? []).find(
    (b: any) => b.type === "tool_use" && b.name === "propose_directives",
  ) as { type: "tool_use"; input: { directives?: unknown[] } } | undefined;

  const rawDirectives: any[] = (toolBlock?.input?.directives as any[]) ?? [];

  // Validate each
  const validated: ProposedDirective[] = [];
  for (const raw of rawDirectives) {
    const dt = raw?.directive_type as DirectiveType | undefined;
    if (!dt || !directivePayloadSchemas[dt]) {
      errors.push({
        directive_type: String(raw?.directive_type),
        source_excerpt: typeof raw?.source_excerpt === "string" ? raw.source_excerpt : undefined,
        message: `Unknown directive_type "${raw?.directive_type}".`,
      });
      continue;
    }

    const coerced = coercePayload(dt, raw.payload ?? {});
    const payloadResult = directivePayloadSchemas[dt].safeParse(coerced);
    if (!payloadResult.success) {
      const flat = payloadResult.error.flatten();
      errors.push({
        directive_type: dt,
        source_excerpt: typeof raw?.source_excerpt === "string" ? raw.source_excerpt : undefined,
        message:
          "Payload validation failed: " +
          [
            ...Object.entries(flat.fieldErrors).flatMap(([f, msgs]) =>
              (msgs ?? []).map((m: string) => `${f}: ${m}`),
            ),
            ...flat.formErrors,
          ].join("; "),
        zod_path: Object.keys(flat.fieldErrors),
      });
      continue;
    }

    validated.push({
      directive_type: dt,
      audience: (raw.audience as ProposedDirective["audience"]) ?? "all",
      sport_scope: Array.isArray(raw.sport_scope) ? raw.sport_scope : [],
      age_scope: Array.isArray(raw.age_scope) ? raw.age_scope : [],
      phv_scope: Array.isArray(raw.phv_scope) ? raw.phv_scope : [],
      position_scope: Array.isArray(raw.position_scope) ? raw.position_scope : [],
      mode_scope: Array.isArray(raw.mode_scope) ? raw.mode_scope : [],
      priority: typeof raw.priority === "number" ? raw.priority : 100,
      payload: payloadResult.data as Record<string, unknown>,
      source_excerpt: typeof raw.source_excerpt === "string" ? raw.source_excerpt : null,
      confidence: typeof raw.confidence === "number" ? raw.confidence : null,
    });
  }

  // Bucket filter — drop any proposal whose type isn't allowed in this
  // document's bucket. No-op when the doc has no bucket (legacy free-form).
  const bucketFiltered = filterToBucket(validated, doc.bucket, errors);

  // Dedup against existing for this document.
  const existing = await listDirectives({ document_id: doc.id });
  const proposed: ProposedDirective[] = [];
  const duplicates: ProposedDirective[] = [];
  for (const v of bucketFiltered) {
    if (isDuplicate(v, existing)) duplicates.push(v);
    else proposed.push(v);
  }

  return {
    proposed,
    duplicates,
    errors,
    raw_count: rawDirectives.length,
    cost_usd: telemetry?.costUsd ?? 0,
    latency_ms: telemetry?.latencyMs ?? 0,
  };
}
