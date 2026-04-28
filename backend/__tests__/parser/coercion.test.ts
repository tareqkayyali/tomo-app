/**
 * Methodology parser coercion — locks in the regressions seen on the
 * "How tomo talks" methodology where Claude produced close-but-not-exact
 * payload shapes. Each test mirrors a real validation error from a
 * production parse and asserts that:
 *   1. Coercion fixes the shape.
 *   2. The Zod schema then accepts it.
 */

import { coercePayload } from "@/services/admin/methodologyParser";
import { directivePayloadSchemas } from "@/lib/validation/admin/directiveSchemas";

describe("methodology parser coercion", () => {
  // ── identity.emoji_policy ─────────────────────────────────────────────

  it("identity.emoji_policy: 'low' is normalised to 'sparing'", () => {
    const raw = {
      persona_name: "Tomo",
      persona_description: "A steady, knowledgeable coach.",
      voice_attributes: ["warm", "direct"],
      emoji_policy: "low", // Claude often picks the response_shape word
    };
    const coerced = coercePayload("identity", raw);
    expect(coerced.emoji_policy).toBe("sparing");
    expect(directivePayloadSchemas.identity.safeParse(coerced).success).toBe(true);
  });

  it("identity.emoji_policy: capitalised 'None' is lowercased", () => {
    const coerced = coercePayload("identity", {
      persona_name: "x",
      persona_description: "y",
      voice_attributes: [],
      emoji_policy: "None",
    });
    expect(coerced.emoji_policy).toBe("none");
  });

  // ── tone fields ───────────────────────────────────────────────────────

  it("tone.acronym_scaffolding_rules: Record<string,string> -> string[] of keys", () => {
    const raw = {
      banned_phrases: [],
      banned_patterns: [],
      required_companion_clauses: {},
      clinical_language_rules: [],
      acronym_scaffolding_rules: {
        ACWR: "your workload trend",
        PHV: "your growth phase",
        RPE: "how hard it felt",
      },
    };
    const coerced = coercePayload("tone", raw);
    expect(coerced.acronym_scaffolding_rules).toEqual(["ACWR", "PHV", "RPE"]);
    expect(directivePayloadSchemas.tone.safeParse(coerced).success).toBe(true);
  });

  it("tone.clinical_language_rules: Record -> string[] of keys", () => {
    const raw = {
      banned_phrases: [],
      banned_patterns: [],
      required_companion_clauses: {},
      acronym_scaffolding_rules: [],
      clinical_language_rules: {
        "according to your data": "avoid",
        "your metrics indicate": "avoid",
      },
    };
    const coerced = coercePayload("tone", raw);
    expect(coerced.clinical_language_rules).toEqual([
      "according to your data",
      "your metrics indicate",
    ]);
    expect(directivePayloadSchemas.tone.safeParse(coerced).success).toBe(true);
  });

  it("tone.required_companion_clauses: empty array -> empty object", () => {
    const raw = {
      banned_phrases: [],
      banned_patterns: [],
      acronym_scaffolding_rules: [],
      clinical_language_rules: [],
      required_companion_clauses: [],
    };
    const coerced = coercePayload("tone", raw);
    expect(coerced.required_companion_clauses).toEqual({});
    expect(directivePayloadSchemas.tone.safeParse(coerced).success).toBe(true);
  });

  // ── response_shape fields ─────────────────────────────────────────────

  it("response_shape.max_length_by_intent: string values -> numbers (extracted)", () => {
    const raw = {
      max_length_by_intent: {
        default: "2-4 sentences",
        check_in: "1 sentence",
        unparseable_field: "no number here",
      },
      bullet_policy: "allow",
      emoji_density: "low",
    };
    const coerced = coercePayload("response_shape", raw);
    expect(coerced.max_length_by_intent).toEqual({
      default: 2,
      check_in: 1,
      // unparseable_field dropped
    });
    expect(directivePayloadSchemas.response_shape.safeParse(coerced).success).toBe(true);
  });

  it("response_shape.bullet_policy: 'limited' -> 'allow' via synonym", () => {
    const coerced = coercePayload("response_shape", {
      bullet_policy: "limited",
      emoji_density: "low",
    });
    expect(coerced.bullet_policy).toBe("allow");
  });

  it("response_shape.emoji_density: 'Low' -> 'low' (lowercase)", () => {
    const coerced = coercePayload("response_shape", {
      bullet_policy: "allow",
      emoji_density: "Low",
    });
    expect(coerced.emoji_density).toBe("low");
  });

  it("response_shape.emoji_density: 'sparingly' -> 'low' via synonym", () => {
    const coerced = coercePayload("response_shape", {
      bullet_policy: "allow",
      emoji_density: "sparingly",
    });
    expect(coerced.emoji_density).toBe("low");
  });

  // ── End-to-end: the user's actual methodology ─────────────────────────

  it("full tone payload from the 'How tomo talks' methodology validates after coercion", () => {
    // Approximation of what Claude was producing for the user's prose.
    const raw = {
      banned_phrases: [
        "great effort",
        "fantastic work",
        "amazing job",
        "keep it up",
      ],
      banned_patterns: [],
      required_companion_clauses: [],
      clinical_language_rules: { data: "avoid", metrics: "avoid" },
      acronym_scaffolding_rules: {
        ACWR: "your workload trend",
        PHV: "your growth phase",
      },
    };
    const coerced = coercePayload("tone", raw);
    const result = directivePayloadSchemas.tone.safeParse(coerced);
    expect(result.success).toBe(true);
  });

  // ── Negative: unparseable enums are left alone for Zod to reject ─────

  it("unrecognised enum value with no synonym is left as-is (so Zod fails loudly)", () => {
    const coerced = coercePayload("response_shape", {
      bullet_policy: "totally_unknown_value",
      emoji_density: "low",
    });
    expect(coerced.bullet_policy).toBe("totally_unknown_value");
    expect(directivePayloadSchemas.response_shape.safeParse(coerced).success).toBe(false);
  });

  // ── routing_intent fields (regression for "How tomo talks" parse) ─────

  it("routing_intent.response_pattern: 'acknowledge' -> 'open_coaching' via synonym", () => {
    const coerced = coercePayload("routing_intent", {
      intent_id: "distress_response",
      response_pattern: "acknowledge",
    });
    expect(coerced.response_pattern).toBe("open_coaching");
    expect(directivePayloadSchemas.routing_intent.safeParse(coerced).success).toBe(true);
  });

  it("routing_intent.llm_tier: empty string is dropped", () => {
    const coerced = coercePayload("routing_intent", {
      intent_id: "x",
      response_pattern: "open_coaching",
      llm_tier: "",
    });
    expect("llm_tier" in coerced).toBe(false);
    expect(directivePayloadSchemas.routing_intent.safeParse(coerced).success).toBe(true);
  });

  it("routing_intent.llm_tier: 'sonnet-4' -> 'sonnet' via synonym", () => {
    const coerced = coercePayload("routing_intent", {
      intent_id: "x",
      response_pattern: "open_coaching",
      llm_tier: "sonnet-4",
    });
    expect(coerced.llm_tier).toBe("sonnet");
    expect(directivePayloadSchemas.routing_intent.safeParse(coerced).success).toBe(true);
  });

  it("routing_intent.multi_step_definition: prose string -> { description: ... }", () => {
    const coerced = coercePayload("routing_intent", {
      intent_id: "x",
      response_pattern: "multi_step",
      multi_step_definition: "Step 1: ack. Step 2: ask follow-up.",
    });
    expect(coerced.multi_step_definition).toEqual({
      description: "Step 1: ack. Step 2: ask follow-up.",
    });
    expect(directivePayloadSchemas.routing_intent.safeParse(coerced).success).toBe(true);
  });

  it("routing_intent.multi_step_definition: empty array -> undefined", () => {
    const coerced = coercePayload("routing_intent", {
      intent_id: "x",
      response_pattern: "open_coaching",
      multi_step_definition: [],
    });
    expect(coerced.multi_step_definition).toBeUndefined();
  });

  // ── recommendation_policy fields (regression) ─────────────────────────

  it("recommendation_policy.priority_override: 'high' -> 'P1' via synonym", () => {
    const coerced = coercePayload("recommendation_policy", {
      blocked_categories: [],
      mandatory_categories: [],
      priority_override: "high",
    });
    expect(coerced.priority_override).toBe("P1");
    expect(directivePayloadSchemas.recommendation_policy.safeParse(coerced).success).toBe(true);
  });

  it("recommendation_policy.priority_override: 'must' -> 'P0'", () => {
    const coerced = coercePayload("recommendation_policy", {
      blocked_categories: [],
      mandatory_categories: [],
      priority_override: "must",
    });
    expect(coerced.priority_override).toBe("P0");
    expect(directivePayloadSchemas.recommendation_policy.safeParse(coerced).success).toBe(true);
  });

  it("recommendation_policy.priority_override: unknown value is dropped", () => {
    const coerced = coercePayload("recommendation_policy", {
      blocked_categories: [],
      mandatory_categories: [],
      priority_override: "totally_made_up",
    });
    expect("priority_override" in coerced).toBe(false);
    expect(directivePayloadSchemas.recommendation_policy.safeParse(coerced).success).toBe(true);
  });

  it("recommendation_policy.forced_inclusions: empty array -> {}", () => {
    const coerced = coercePayload("recommendation_policy", {
      blocked_categories: [],
      mandatory_categories: [],
      forced_inclusions: [],
    });
    expect(coerced.forced_inclusions).toEqual({});
    expect(directivePayloadSchemas.recommendation_policy.safeParse(coerced).success).toBe(true);
  });

  it("recommendation_policy.forced_inclusions: array of phrases -> indexed record", () => {
    const coerced = coercePayload("recommendation_policy", {
      blocked_categories: [],
      mandatory_categories: [],
      forced_inclusions: [
        "always pair with a reason",
        "never stand-alone instruction",
      ],
    });
    expect(coerced.forced_inclusions).toEqual({
      "0": "always pair with a reason",
      "1": "never stand-alone instruction",
    });
    expect(directivePayloadSchemas.recommendation_policy.safeParse(coerced).success).toBe(true);
  });

  it("recommendation_policy regression: full payload from 'every recommendation must be paired with a reason' parse", () => {
    // Approximation of what Claude was producing for the user's prose.
    const raw = {
      scope_conditions: [],
      blocked_categories: [],
      mandatory_categories: [],
      priority_override: "high",
      forced_inclusions: ["pair with one-sentence reason"],
    };
    const coerced = coercePayload("recommendation_policy", raw);
    const result = directivePayloadSchemas.recommendation_policy.safeParse(coerced);
    expect(result.success).toBe(true);
  });
});
