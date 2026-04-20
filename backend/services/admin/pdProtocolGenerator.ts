/**
 * PD Protocol Generator — Plain-Text Prompt → Structured Protocol Draft.
 *
 * Pipeline:
 *   1. Retrieve grounding chunks from rag_knowledge_chunks (soft-filtered
 *      by scope hints). Graceful fallback — missing RAG does not fail
 *      the request.
 *   2. Build a cached system prompt (ephemeral cache_control) containing
 *      the condition DSL field dictionary, output schema, safety rules,
 *      and two short few-shot examples. The cache warms on the first
 *      generation and amortizes cost across the PD's authoring burst.
 *   3. Call Claude Sonnet 4 via trackedClaudeCall (temperature 0.2). All
 *      costs land in api_usage_log with agent_type='pd_protocol_generator'.
 *   4. Parse Claude's JSON output (strip optional fence), validate with
 *      ProtocolDraftSchema. Invalid drafts are NOT retried silently —
 *      they are persisted with outcome='failed' so the PD sees the errors
 *      and can refine the prompt.
 *   5. Insert one row into pd_protocol_generations via supabaseAdmin.
 *
 * Model choice: Sonnet, not Haiku. A hallucinated condition field or
 * wrong operator corrupts every downstream PDIL consumer. For the
 * highest-authority rule in Tomo, cost is subordinate to quality.
 */

import Anthropic from "@anthropic-ai/sdk";
import { trackedClaudeCall, type CallTelemetry } from "@/lib/trackedClaudeCall";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import {
  PD_FIELD_METADATA,
  PD_OPERATOR_LABELS,
} from "@/services/pdil/types";
import {
  ProtocolDraftSchema,
  type ProtocolDraft,
  type ScopeHints,
} from "./pdProtocolDraftSchema";

const GENERATOR_MODEL = "claude-sonnet-4-20250514";
const MAX_OUTPUT_TOKENS = 4096;
const TEMPERATURE = 0.2;
const RAG_TOP_K = 5;

export interface GroundingChunk {
  chunk_id: string;
  title: string;
  domain: string | null;
  evidence_grade: string | null;
}

export interface GenerateProtocolArgs {
  prompt: string;
  scopeHints: ScopeHints;
  userId: string;
  userEmail: string | null;
  tenantId: string | null;
}

export interface GenerateProtocolResult {
  generation_id: string;
  draft: ProtocolDraft | null;
  grounding_chunks: GroundingChunk[];
  telemetry: CallTelemetry;
  validation_errors: Array<{ path: string; message: string }> | null;
}

/**
 * Entry point — accepts a PD's plain-text prompt, returns a structured draft
 * (or a validated list of errors) and persists one audit row.
 */
export async function generateProtocolDraft(
  args: GenerateProtocolArgs,
): Promise<GenerateProtocolResult> {
  const { prompt, scopeHints, userId, userEmail, tenantId } = args;

  // Step 1 — RAG retrieval.
  const chunks = await retrieveGroundingChunks(prompt, scopeHints);

  // Step 2 — Build prompt.
  const systemBlocks = buildSystemBlocks();
  const userMessage = buildUserMessage(prompt, scopeHints, chunks);

  // Step 3 — Claude call.
  const client = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY!,
  });

  const { message, telemetry } = await trackedClaudeCall(
    client,
    {
      model: GENERATOR_MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      temperature: TEMPERATURE,
      system: systemBlocks,
      messages: [{ role: "user", content: userMessage }],
    },
    {
      userId,
      agentType: "pd_protocol_generator",
    },
  );

  // Step 4 — Parse + validate.
  const rawText = extractText(message);
  const { draft, parseError, validationErrors } = parseAndValidate(rawText);

  // Step 5 — Persist audit row.
  const groundingChunks: GroundingChunk[] = chunks.map((c) => ({
    chunk_id: c.chunk_id,
    title: c.title,
    domain: c.domain,
    evidence_grade: c.evidence_grade,
  }));

  const outcome = draft && !parseError && !validationErrors ? "pending" : "failed";

  const { data, error } = await (supabaseAdmin() as any)
    .from("pd_protocol_generations")
    .insert({
      created_by: userId,
      created_by_email: userEmail,
      tenant_id: tenantId,
      prompt,
      scope_hints: scopeHints,
      draft_protocol: draft ?? {},
      rag_chunks_used: groundingChunks,
      model: telemetry.model,
      input_tokens: telemetry.inputTokens,
      output_tokens: telemetry.outputTokens,
      cache_read_tokens: telemetry.cacheReadTokens,
      cache_write_tokens: telemetry.cacheWriteTokens,
      cost_usd: telemetry.costUsd,
      latency_ms: telemetry.latencyMs,
      outcome,
      validation_errors: validationErrors ?? (parseError ? [{ path: "$", message: parseError }] : null),
    })
    .select("generation_id")
    .single();

  if (error) {
    logger.error("[PDProtocolGenerator] Failed to persist generation", {
      error: error.message,
      userId,
    });
    throw new Error(`Failed to persist generation: ${error.message}`);
  }

  return {
    generation_id: data.generation_id as string,
    draft: draft ?? null,
    grounding_chunks: groundingChunks,
    telemetry,
    validation_errors:
      validationErrors ?? (parseError ? [{ path: "$", message: parseError }] : null),
  };
}

// ─── Grounding retrieval ──────────────────────────────────────────────

interface RawChunk {
  chunk_id: string;
  title: string;
  content: string;
  domain: string | null;
  athlete_summary: string | null;
  evidence_grade: string | null;
  primary_source: string | null;
}

async function retrieveGroundingChunks(
  _prompt: string,
  scopeHints: ScopeHints,
): Promise<RawChunk[]> {
  try {
    const db = supabaseAdmin() as any;
    let q = db
      .from("rag_knowledge_chunks")
      .select(
        "chunk_id, title, content, domain, athlete_summary, evidence_grade, primary_source, phv_stages, sports",
      )
      .limit(RAG_TOP_K);

    if (scopeHints.phv_stage) {
      q = q.contains("phv_stages", [scopeHints.phv_stage.toUpperCase()]);
    }
    if (scopeHints.sport) {
      q = q.contains("sports", [scopeHints.sport]);
    }

    const { data, error } = await q;
    if (error || !data) return [];

    return (data as Array<Partial<RawChunk>>).map((row) => ({
      chunk_id: row.chunk_id ?? "",
      title: row.title ?? "",
      content: row.content ?? "",
      domain: row.domain ?? null,
      athlete_summary: row.athlete_summary ?? null,
      evidence_grade: row.evidence_grade ?? null,
      primary_source: row.primary_source ?? null,
    }));
  } catch (err) {
    logger.warn("[PDProtocolGenerator] RAG retrieval failed", {
      error: (err as Error).message,
    });
    return [];
  }
}

// ─── Prompt construction ──────────────────────────────────────────────

function buildSystemBlocks(): Anthropic.TextBlockParam[] {
  const fieldDictJson = JSON.stringify(
    Object.values(PD_FIELD_METADATA).map((f) => ({
      field: f.field,
      label: f.label,
      description: f.description,
      type: f.type,
      unit: f.unit ?? null,
      range: f.range ?? null,
      options: f.options ?? null,
    })),
    null,
    2,
  );

  const operatorDictJson = JSON.stringify(
    Object.entries(PD_OPERATOR_LABELS).map(([op, label]) => ({ operator: op, label })),
    null,
    2,
  );

  const staticBlock = [
    "You are an expert Performance Director authoring a rule for Tomo's PD Intelligence Layer (PDIL).",
    "PDIL rules (called protocols) gate every downstream AI decision for a young athlete: training load, exercise selection, recommendation content, RAG retrieval, and chat model tier.",
    "A wrong field name, wrong operator, or invented enum value will corrupt every downstream consumer. Ground every decision in the evidence you are given.",
    "",
    "Your job: convert the PD's plain-text request into ONE structured protocol JSON matching the schema below.",
    "",
    "OUTPUT CONTRACT",
    "- Return ONLY a single JSON object. No prose. No markdown fences. No explanation.",
    "- Emit exactly ONE protocol. If the request clearly needs multiple protocols, pick the most important and add a short note in 'description'.",
    "- Every condition.field MUST appear in the FIELD DICTIONARY below. Do not invent fields.",
    "- Every condition.operator MUST be valid for that field's type. Boolean fields support only eq/neq.",
    "- Numeric values must fall inside the field's range when a range is defined.",
    "- String enum values must exactly match the field's options.",
    "- Protocol must DO something: set at least one of load_multiplier, intensity_cap, contraindications, required_elements, session_cap_minutes, blocked_rec_categories, mandatory_rec_categories, priority_override, forced_rag_domains, blocked_rag_domains, ai_system_injection.",
    "- safety_critical=true requires evidence_grade='A' and a cited evidence_source string.",
    "- priority MUST be an integer in [21, 200]. Lower = higher authority. 21-50 = safety extensions, 51-100 = standard, 101-200 = experimental.",
    "- Use scope filters (sport_filter, phv_filter, age_band_filter, position_filter) to restrict which athletes the protocol evaluates against. Leave null for broadest scope.",
    "- No emojis anywhere (name, description, override_message, ai_system_injection, contraindications, required_elements).",
    "",
    "OUTPUT JSON SHAPE (all fields — omit a field or set to null when unused):",
    "{",
    '  "name": string,                                          // short, human-readable rule name',
    '  "description": string | null,                            // optional one-sentence explanation of intent',
    '  "category": "safety" | "development" | "recovery" | "performance" | "academic",',
    '  "conditions": {                                          // required — AND/OR over 1-20 checks',
    '    "match": "all" | "any",',
    '    "conditions": [ { "field": string, "operator": string, "value": string | number | boolean | array } ]',
    "  },",
    '  "priority": integer 21..200,',
    '  "load_multiplier": number 0..2 | null,                   // 1.0 = no change; 0.5 = half training load',
    '  "intensity_cap": "rest" | "light" | "moderate" | "full" | null,',
    '  "contraindications": string[] | null,                    // exercise/activity names to block',
    '  "required_elements": string[] | null,                    // exercise/activity names to mandate',
    '  "session_cap_minutes": integer 0..240 | null,',
    '  "blocked_rec_categories": string[] | null,               // recommendation category slugs',
    '  "mandatory_rec_categories": string[] | null,',
    '  "priority_override": "P0" | "P1" | "P2" | "P3" | null,',
    '  "override_message": string | null,                       // max 280 chars, shown to athlete',
    '  "forced_rag_domains": string[] | null,                   // e.g. ["injury","recovery"]',
    '  "blocked_rag_domains": string[] | null,',
    '  "rag_condition_tags": Record<string,string> | null,',
    '  "ai_system_injection": string | null,                    // max 1200 chars, injected into chat system prompt',
    '  "safety_critical": boolean,                              // true only with evidence_grade A + source',
    '  "sport_filter": string[] | null,                         // from ["football","padel","athletics","basketball","tennis"]',
    '  "phv_filter": string[] | null,                           // from ["pre","mid","post"]',
    '  "age_band_filter": string[] | null,                      // from ["U13","U15","U17","U19","Senior"]',
    '  "position_filter": string[] | null,',
    '  "evidence_source": string | null,                        // cited source, DOI, or guideline',
    '  "evidence_grade": "A" | "B" | "C" | null',
    "}",
    "",
    "FIELD DICTIONARY (the ONLY fields you may reference in conditions):",
    fieldDictJson,
    "",
    "OPERATORS:",
    operatorDictJson,
    "",
    "FEW-SHOT EXAMPLES",
    "",
    "Example 1 — RED readiness hard-cap:",
    JSON.stringify(
      {
        name: "RED readiness recovery lock",
        description:
          "When today's readiness is RED, cap training at light intensity and mandate recovery content.",
        category: "safety",
        conditions: {
          match: "all",
          conditions: [{ field: "readiness_rag", operator: "eq", value: "RED" }],
        },
        priority: 25,
        load_multiplier: 0.5,
        intensity_cap: "light",
        contraindications: null,
        required_elements: null,
        session_cap_minutes: 45,
        blocked_rec_categories: ["strength_development", "power_development"],
        mandatory_rec_categories: ["recovery"],
        priority_override: "P1",
        override_message: "Your body's flagging recovery today — we've swapped in a lighter block.",
        forced_rag_domains: ["RECOVERY", "READINESS"],
        blocked_rag_domains: null,
        rag_condition_tags: null,
        ai_system_injection:
          "The athlete is RED on readiness today. Do not suggest high-intensity training. Lead with recovery, sleep, and short mobility work.",
        safety_critical: true,
        sport_filter: null,
        phv_filter: null,
        age_band_filter: null,
        position_filter: null,
        evidence_source:
          "Plews et al. 2013, Training adaptation and HRV: methodological approaches (Int J Sports Physiol Perform).",
        evidence_grade: "A",
      },
      null,
      0,
    ),
    "",
    "Example 2 — Mid-PHV protective cap (growth-plate load management):",
    JSON.stringify(
      {
        name: "Mid-PHV load protection",
        description: "Reduce training load during peak growth velocity to protect growth plates.",
        category: "safety",
        conditions: {
          match: "all",
          conditions: [{ field: "phv_stage", operator: "eq", value: "mid" }],
        },
        priority: 22,
        load_multiplier: 0.75,
        intensity_cap: "moderate",
        contraindications: ["max barbell back squat", "depth jumps > 40cm"],
        required_elements: null,
        session_cap_minutes: 75,
        blocked_rec_categories: null,
        mandatory_rec_categories: null,
        priority_override: null,
        override_message: null,
        forced_rag_domains: ["YOUTH_DEVELOPMENT"],
        blocked_rag_domains: null,
        rag_condition_tags: null,
        ai_system_injection:
          "Athlete is in peak growth velocity. Favor technique and submaximal loading. Avoid high-impact plyometrics and maximal bilateral lifts.",
        safety_critical: true,
        sport_filter: null,
        phv_filter: ["mid"],
        age_band_filter: ["U13", "U15"],
        position_filter: null,
        evidence_source:
          "Lloyd & Oliver 2012, The Youth Physical Development Model (Strength Cond J 34:61-72).",
        evidence_grade: "A",
      },
      null,
      0,
    ),
  ].join("\n");

  return [
    {
      type: "text",
      text: staticBlock,
      cache_control: { type: "ephemeral" },
    },
  ];
}

function buildUserMessage(
  prompt: string,
  scopeHints: ScopeHints,
  chunks: RawChunk[],
): string {
  const parts: string[] = [];

  parts.push("PERFORMANCE DIRECTOR PROMPT");
  parts.push(prompt);
  parts.push("");

  if (Object.keys(scopeHints).length > 0) {
    parts.push("SCOPE HINTS (use to populate *_filter fields; not to invent conditions)");
    parts.push(JSON.stringify(scopeHints, null, 2));
    parts.push("");
  }

  if (chunks.length > 0) {
    parts.push("RELEVANT EVIDENCE (cite the strongest match in evidence_source)");
    for (const c of chunks) {
      const summary = c.athlete_summary ?? c.content.slice(0, 400);
      const grade = c.evidence_grade ? ` [Grade ${c.evidence_grade}]` : "";
      const source = c.primary_source ? `\n  Source: ${c.primary_source}` : "";
      parts.push(`- ${c.title}${grade}\n  ${summary}${source}`);
    }
    parts.push("");
  }

  parts.push(
    "Return ONLY the JSON object matching the schema. No prose. No markdown fences. No trailing commentary.",
  );

  return parts.join("\n");
}

// ─── Output parsing + validation ──────────────────────────────────────

function extractText(message: Anthropic.Message): string {
  for (const block of message.content) {
    if (block.type === "text") return block.text;
  }
  return "";
}

function stripJsonFence(raw: string): string {
  const trimmed = raw.trim();
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (fenceMatch) return fenceMatch[1].trim();
  return trimmed;
}

interface ParseResult {
  draft: ProtocolDraft | null;
  parseError: string | null;
  validationErrors: Array<{ path: string; message: string }> | null;
}

function parseAndValidate(rawText: string): ParseResult {
  const stripped = stripJsonFence(rawText);

  if (!stripped) {
    return {
      draft: null,
      parseError: "Claude returned an empty response.",
      validationErrors: null,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch (err) {
    return {
      draft: null,
      parseError: `JSON parse failed: ${(err as Error).message}`,
      validationErrors: null,
    };
  }

  const result = ProtocolDraftSchema.safeParse(parsed);
  if (!result.success) {
    return {
      draft: null,
      parseError: null,
      validationErrors: result.error.issues.map((i) => ({
        path: i.path.join("."),
        message: i.message,
      })),
    };
  }

  return { draft: result.data, parseError: null, validationErrors: null };
}

// ─── Outcome transitions (called by the save path) ────────────────────

export async function markGenerationOutcome(
  generationId: string,
  outcome: "saved" | "edited_then_saved" | "discarded",
  savedProtocolId: string | null,
): Promise<void> {
  try {
    await (supabaseAdmin() as any)
      .from("pd_protocol_generations")
      .update({
        outcome,
        saved_protocol_id: savedProtocolId,
      })
      .eq("generation_id", generationId);
  } catch (err) {
    logger.warn("[PDProtocolGenerator] Failed to mark outcome", {
      generation_id: generationId,
      outcome,
      error: (err as Error).message,
    });
  }
}
