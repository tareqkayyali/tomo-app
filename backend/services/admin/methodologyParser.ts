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

// ─── Prompt builders ──────────────────────────────────────────────────────

function buildSystemPrompt(): string {
  const typeList = TYPE_GUIDE.map(
    (t) => `- "${t.type}": ${t.description} Payload keys: ${t.payload_keys.join(", ")}.`,
  ).join("\n");

  return `You are the Methodology Parser for Tomo — an AI coaching platform for young athletes.

Your job: read a Performance Director's prose methodology and extract every machine-applicable rule into one of 23 directive types.

# Directive types
${typeList}

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

  return [
    "# Methodology document",
    `Title: ${doc.title}`,
    scope.length ? scope.join(" ") : "",
    "",
    "## Source text",
    doc.source_text ?? "(empty)",
  ]
    .filter(Boolean)
    .join("\n");
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

    const payloadResult = directivePayloadSchemas[dt].safeParse(raw.payload ?? {});
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

  // Dedup against existing for this document.
  const existing = await listDirectives({ document_id: doc.id });
  const proposed: ProposedDirective[] = [];
  const duplicates: ProposedDirective[] = [];
  for (const v of validated) {
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
