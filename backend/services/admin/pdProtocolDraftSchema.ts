/**
 * Zod schema for an AI-generated PD protocol draft.
 *
 * The schema is dynamically grounded in PD_FIELD_METADATA — the single source
 * of truth for the condition DSL. This means Claude cannot invent fields,
 * operators, enum values, or ranges that don't exist in the live dictionary.
 *
 * Output shape matches the pd_protocols table columns exactly so the draft
 * can be POSTed to /api/v1/admin/enterprise/protocols/builder without
 * any translation layer.
 *
 * Validation rules beyond simple shape:
 *   1. Every condition.field must be a registered PDConditionField.
 *   2. Every condition.operator must be allowed for that field's type.
 *   3. Enum values must be in the field's options[].
 *   4. Numeric values must fall within the field's range (when defined).
 *   5. At least one output lever must be non-null (the protocol must DO
 *      something — contraindications, modifiers, injections, etc.).
 *   6. safety_critical=true => evidence_grade='A' (highest rigor required).
 *   7. priority in [21, 200] (1-20 reserved for built-in protocols).
 */

import { z } from "zod";
import {
  PD_FIELD_METADATA,
  PD_OPERATOR_LABELS,
  type PDConditionField,
  type PDConditionOperator,
} from "@/services/pdil/types";

// ─── Constants derived from live metadata ─────────────────────────────

const FIELD_KEYS = Object.keys(PD_FIELD_METADATA) as [
  PDConditionField,
  ...PDConditionField[]
];

const OPERATOR_KEYS = Object.keys(PD_OPERATOR_LABELS) as [
  PDConditionOperator,
  ...PDConditionOperator[]
];

// Sport / PHV / age_band vocabularies match the builder page + the
// scope_*_filter conventions used by evaluatePDProtocols().
const VALID_SPORTS = ["football", "padel", "athletics", "basketball", "tennis"] as const;
const VALID_PHV_STAGES = ["pre", "mid", "post"] as const;
const VALID_AGE_BANDS = ["U13", "U15", "U17", "U19", "Senior"] as const;

// Category + output enums mirror the existing builder POST endpoint.
const VALID_CATEGORIES = ["safety", "development", "recovery", "performance", "academic"] as const;
const VALID_INTENSITY_CAPS = ["rest", "light", "moderate", "full"] as const;
const VALID_PRIORITY_OVERRIDES = ["P0", "P1", "P2", "P3"] as const;
const VALID_EVIDENCE_GRADES = ["A", "B", "C"] as const;

// Operators that require an array value (checked by evaluator).
const ARRAY_OPERATORS = new Set<PDConditionOperator>(["in", "not_in"]);

// Operators valid per field type. Booleans only support equality.
const OPERATORS_FOR_TYPE: Record<"number" | "string" | "boolean", PDConditionOperator[]> = {
  number: ["gt", "gte", "lt", "lte", "eq", "neq", "in", "not_in"],
  string: ["eq", "neq", "in", "not_in"],
  boolean: ["eq", "neq"],
};

// ─── Primitive condition schema ───────────────────────────────────────

const ConditionValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.union([z.string(), z.number()])),
]);

const ConditionSchema = z
  .object({
    field: z.enum(FIELD_KEYS),
    operator: z.enum(OPERATOR_KEYS),
    value: ConditionValueSchema,
  })
  .superRefine((c, ctx) => {
    const meta = PD_FIELD_METADATA[c.field];
    if (!meta) {
      ctx.addIssue({
        code: "custom",
        message: `Unknown field: ${c.field}`,
        path: ["field"],
      });
      return;
    }

    // Operator must be valid for this field's type.
    const allowed = OPERATORS_FOR_TYPE[meta.type];
    if (!allowed.includes(c.operator)) {
      ctx.addIssue({
        code: "custom",
        message: `Operator "${c.operator}" is not valid for ${meta.type} field "${c.field}". Allowed: ${allowed.join(", ")}`,
        path: ["operator"],
      });
    }

    // Array operators require array values; non-array operators require primitives.
    const isArrayValue = Array.isArray(c.value);
    if (ARRAY_OPERATORS.has(c.operator) && !isArrayValue) {
      ctx.addIssue({
        code: "custom",
        message: `Operator "${c.operator}" requires an array value`,
        path: ["value"],
      });
      return;
    }
    if (!ARRAY_OPERATORS.has(c.operator) && isArrayValue) {
      ctx.addIssue({
        code: "custom",
        message: `Operator "${c.operator}" requires a scalar value`,
        path: ["value"],
      });
      return;
    }

    // Validate every element (scalar or each array element) against the
    // field's type + enum + range.
    const elements: Array<string | number | boolean> = isArrayValue
      ? (c.value as Array<string | number>)
      : [c.value as string | number | boolean];

    for (const el of elements) {
      if (meta.type === "number") {
        if (typeof el !== "number" || Number.isNaN(el)) {
          ctx.addIssue({
            code: "custom",
            message: `Field "${c.field}" expects number, got ${typeof el}`,
            path: ["value"],
          });
          continue;
        }
        if (meta.range && (el < meta.range.min || el > meta.range.max)) {
          ctx.addIssue({
            code: "custom",
            message: `Value ${el} out of range for "${c.field}" [${meta.range.min}, ${meta.range.max}]`,
            path: ["value"],
          });
        }
      } else if (meta.type === "string") {
        if (typeof el !== "string") {
          ctx.addIssue({
            code: "custom",
            message: `Field "${c.field}" expects string, got ${typeof el}`,
            path: ["value"],
          });
          continue;
        }
        if (meta.options && !meta.options.includes(el)) {
          ctx.addIssue({
            code: "custom",
            message: `Value "${el}" not in allowed options for "${c.field}": ${meta.options.join(", ")}`,
            path: ["value"],
          });
        }
      } else if (meta.type === "boolean") {
        if (typeof el !== "boolean") {
          ctx.addIssue({
            code: "custom",
            message: `Field "${c.field}" expects boolean, got ${typeof el}`,
            path: ["value"],
          });
        }
      }
    }
  });

// ─── Full protocol draft schema ───────────────────────────────────────

export const ProtocolDraftSchema = z
  .object({
    name: z.string().trim().min(3).max(120),
    description: z.string().max(600).nullable().optional().default(null),
    category: z.enum(VALID_CATEGORIES),

    conditions: z.object({
      match: z.enum(["all", "any"]),
      conditions: z.array(ConditionSchema).min(1).max(20),
    }),

    priority: z.number().int().min(21).max(200),

    // Training modifiers
    load_multiplier: z.number().min(0).max(2).nullable().optional().default(null),
    intensity_cap: z.enum(VALID_INTENSITY_CAPS).nullable().optional().default(null),
    contraindications: z.array(z.string().min(1)).max(30).nullable().optional().default(null),
    required_elements: z.array(z.string().min(1)).max(30).nullable().optional().default(null),
    session_cap_minutes: z.number().int().min(0).max(240).nullable().optional().default(null),

    // Recommendation guardrails
    blocked_rec_categories: z.array(z.string().min(1)).max(20).nullable().optional().default(null),
    mandatory_rec_categories: z.array(z.string().min(1)).max(20).nullable().optional().default(null),
    priority_override: z.enum(VALID_PRIORITY_OVERRIDES).nullable().optional().default(null),
    override_message: z.string().max(280).nullable().optional().default(null),

    // RAG overrides
    forced_rag_domains: z.array(z.string().min(1)).max(20).nullable().optional().default(null),
    blocked_rag_domains: z.array(z.string().min(1)).max(20).nullable().optional().default(null),
    rag_condition_tags: z.record(z.string(), z.string()).nullable().optional().default(null),

    // AI coaching context
    ai_system_injection: z.string().max(1200).nullable().optional().default(null),
    safety_critical: z.boolean().default(false),

    // Scope filters (pre-filters before condition evaluation)
    sport_filter: z.array(z.enum(VALID_SPORTS)).nullable().optional().default(null),
    phv_filter: z.array(z.enum(VALID_PHV_STAGES)).nullable().optional().default(null),
    age_band_filter: z.array(z.enum(VALID_AGE_BANDS)).nullable().optional().default(null),
    position_filter: z.array(z.string().min(1)).max(20).nullable().optional().default(null),

    // Evidence
    evidence_source: z.string().max(400).nullable().optional().default(null),
    evidence_grade: z.enum(VALID_EVIDENCE_GRADES).nullable().optional().default(null),
  })
  .superRefine((p, ctx) => {
    // Rule 5: Protocol must DO something — at least one output lever must be set.
    const hasLever =
      p.load_multiplier !== null ||
      p.intensity_cap !== null ||
      (p.contraindications !== null && p.contraindications.length > 0) ||
      (p.required_elements !== null && p.required_elements.length > 0) ||
      p.session_cap_minutes !== null ||
      (p.blocked_rec_categories !== null && p.blocked_rec_categories.length > 0) ||
      (p.mandatory_rec_categories !== null && p.mandatory_rec_categories.length > 0) ||
      p.priority_override !== null ||
      (p.forced_rag_domains !== null && p.forced_rag_domains.length > 0) ||
      (p.blocked_rag_domains !== null && p.blocked_rag_domains.length > 0) ||
      p.ai_system_injection !== null;

    if (!hasLever) {
      ctx.addIssue({
        code: "custom",
        message:
          "Protocol has no effect — set at least one of: load_multiplier, intensity_cap, contraindications, required_elements, session_cap_minutes, blocked_rec_categories, mandatory_rec_categories, priority_override, forced_rag_domains, blocked_rag_domains, ai_system_injection.",
        path: ["category"],
      });
    }

    // Rule 6: safety_critical requires Grade A evidence.
    if (p.safety_critical && p.evidence_grade !== "A") {
      ctx.addIssue({
        code: "custom",
        message:
          "safety_critical protocols must cite Grade A evidence. Either lower safety_critical to false or upgrade evidence_grade to 'A' with a cited source in evidence_source.",
        path: ["evidence_grade"],
      });
    }
  });

export type ProtocolDraft = z.infer<typeof ProtocolDraftSchema>;

// ─── Scope hints schema (input to generator) ──────────────────────────

export const ScopeHintsSchema = z
  .object({
    sport: z.enum(VALID_SPORTS).optional(),
    position: z.string().min(1).max(40).optional(),
    phv_stage: z.enum(VALID_PHV_STAGES).optional(),
    age_band: z.enum(VALID_AGE_BANDS).optional(),
  })
  .strict();

export type ScopeHints = z.infer<typeof ScopeHintsSchema>;

export const GenerateRequestSchema = z.object({
  prompt: z.string().trim().min(10).max(2000),
  scope_hints: ScopeHintsSchema.optional().default({}),
});

export type GenerateRequest = z.infer<typeof GenerateRequestSchema>;

// Exported enums for the UI review form.
export const PROTOCOL_CONSTANTS = {
  categories: VALID_CATEGORIES,
  intensity_caps: VALID_INTENSITY_CAPS,
  priority_overrides: VALID_PRIORITY_OVERRIDES,
  evidence_grades: VALID_EVIDENCE_GRADES,
  sports: VALID_SPORTS,
  phv_stages: VALID_PHV_STAGES,
  age_bands: VALID_AGE_BANDS,
} as const;
