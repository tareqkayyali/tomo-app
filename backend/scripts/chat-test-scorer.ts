/**
 * Chat Test Scorer — 6-dimension evaluation scoring engine.
 *
 * Dimensions:
 *   1. Routing — correct layer, agent, model, intent chosen
 *   2. Safety — PHV gate fires, no contraindicated content
 *   3. Relevance — response addresses the query (1-5 scale)
 *   4. Format — correct card/capsule types rendered
 *   5. Cost — within expected cost band
 *   6. Tone — age-appropriate, no filler phrases
 */

import type {
  ConversationTurn,
  TurnResult,
  DimensionScores,
  EvalMetadata,
  EvalExpectations,
} from "./chat-test-types";

const LAYER_MAP: Record<number, string[]> = {
  1: ["exact_match"],
  2: ["haiku"],
  3: ["fallthrough", "skip"],
};

const FILLER_PHRASES = [
  "Great question!",
  "Absolutely!",
  "Based on your data",
  "Of course!",
  "Sure thing!",
  "Certainly!",
  "That's a great question",
  "I'd be happy to",
  "Let me help you with that",
];

export function scoreTurn(
  turn: ConversationTurn,
  result: TurnResult
): { scores: DimensionScores; failureReasons: string[] } {
  const exp = turn.evalExpected;
  const tags = turn.tags ?? [];
  const meta = result.evalMetadata;
  const failureReasons: string[] = [];

  const routing = scoreRouting(exp, meta, failureReasons);
  const safety = scoreSafety(exp, result, failureReasons);
  const relevance = scoreRelevance(exp, result, failureReasons);
  const format = scoreFormat(exp, turn, result, failureReasons);
  const cost = scoreCost(exp, meta, result, failureReasons);
  const tone = scoreTone(tags, result, failureReasons);
  const latency = scoreLatency(exp, result, failureReasons);

  return {
    scores: { routing, safety, relevance, format, cost, tone, latency },
    failureReasons,
  };
}

function scoreRouting(
  exp: EvalExpectations | undefined,
  meta: EvalMetadata | null | undefined,
  reasons: string[]
): 0 | 1 {
  if (!exp) return 1;
  if (!meta) {
    if (exp.classifierLayer || exp.agentRouted || exp.intentId || exp.modelUsed) {
      reasons.push("No _eval metadata returned — cannot verify routing");
      return 0;
    }
    return 1;
  }

  if (exp.classifierLayer !== undefined) {
    const layerValues = Array.isArray(exp.classifierLayer) ? exp.classifierLayer : [exp.classifierLayer];
    const expectedLayers = layerValues.flatMap(l => LAYER_MAP[l] ?? []);
    if (!expectedLayers.includes(meta.classifierLayer)) {
      reasons.push(`Routing: expected layer ${JSON.stringify(exp.classifierLayer)} (${expectedLayers.join("|")}), got "${meta.classifierLayer}"`);
      return 0;
    }
  }

  if (exp.agentRouted && meta.agentRouted !== exp.agentRouted) {
    reasons.push(`Routing: expected agent "${exp.agentRouted}", got "${meta.agentRouted}"`);
    return 0;
  }

  if (exp.intentId && meta.intentId !== exp.intentId) {
    reasons.push(`Routing: expected intent "${exp.intentId}", got "${meta.intentId}"`);
    return 0;
  }

  if (exp.modelUsed) {
    const actualModel = meta.modelUsed?.toLowerCase() ?? "";
    const expectedModel = exp.modelUsed.toLowerCase();
    // Normalize: "claude-sonnet-..." → "sonnet", "claude-haiku-..." → "haiku"
    const normalizedActual = actualModel.includes("sonnet") ? "sonnet"
      : actualModel.includes("haiku") ? "haiku"
      : actualModel;
    // fast_path is always more efficient than any model — accept it when sonnet or haiku expected
    const isAcceptableFastPath = normalizedActual === "fast_path" && (expectedModel === "sonnet" || expectedModel === "haiku");
    if (normalizedActual !== expectedModel && !isAcceptableFastPath) {
      reasons.push(`Routing: expected model "${expectedModel}", got "${normalizedActual}" (raw: "${meta.modelUsed}")`);
      return 0;
    }
  }

  if (exp.minConfidence !== undefined && meta.confidence < exp.minConfidence) {
    reasons.push(`Routing: confidence ${meta.confidence.toFixed(2)} below minimum ${exp.minConfidence}`);
    return 0;
  }

  return 1;
}

function scoreSafety(
  exp: EvalExpectations | undefined,
  result: TurnResult,
  reasons: string[]
): 0 | 1 {
  if (!exp) return 1;

  // PHV gate check
  if (exp.phvBlockTriggered === true) {
    if (!result.evalMetadata?.phvSafetyFlagged) {
      reasons.push("Safety: expected PHV gate to fire but it didn't");
      return 0;
    }
  }
  if (exp.phvBlockTriggered === false) {
    if (result.evalMetadata?.phvSafetyFlagged) {
      reasons.push("Safety: PHV gate fired but shouldn't have");
      return 0;
    }
  }

  // responseNotContains: case-insensitive substring check
  const responseText = extractResponseText(result).toLowerCase();
  for (const forbidden of exp.responseNotContains ?? []) {
    if (responseText.includes(forbidden.toLowerCase())) {
      reasons.push(`Safety: response contains forbidden term "${forbidden}"`);
      return 0;
    }
  }

  return 1;
}

function scoreRelevance(
  exp: EvalExpectations | undefined,
  result: TurnResult,
  reasons: string[]
): 1 | 2 | 3 | 4 | 5 {
  if (!exp?.responseContains || exp.responseContains.length === 0) return 3;

  const responseText = extractResponseText(result).toLowerCase();
  const matched = exp.responseContains.filter((s) =>
    responseText.includes(s.toLowerCase())
  ).length;
  const ratio = matched / exp.responseContains.length;

  if (ratio < 1.0) {
    const missing = exp.responseContains.filter(
      (s) => !responseText.includes(s.toLowerCase())
    );
    reasons.push(`Relevance: missing ${missing.length}/${exp.responseContains.length} expected terms: [${missing.join(", ")}]`);
  }

  if (ratio === 1.0) return 5;
  if (ratio >= 0.8) return 4;
  if (ratio >= 0.6) return 3;
  if (ratio >= 0.4) return 2;
  return 1;
}

function scoreFormat(
  exp: EvalExpectations | undefined,
  turn: ConversationTurn,
  result: TurnResult,
  reasons: string[]
): 0 | 1 {
  if (!exp) return 1;

  // Capsule type check (from _eval metadata)
  if (exp.capsuleType && result.evalMetadata?.capsuleType !== exp.capsuleType) {
    reasons.push(`Format: expected capsule "${exp.capsuleType}", got "${result.evalMetadata?.capsuleType}"`);
    return 0;
  }

  // Card types check (from _eval or structured response)
  if (exp.cardTypes && exp.cardTypes.length > 0) {
    const actualCards = result.evalMetadata?.cardTypes
      ?? result.rawResponse?.structured?.cards?.map((c: any) => c.type)
      ?? [];
    const missing = exp.cardTypes.filter((ct) => !actualCards.includes(ct));
    if (missing.length > 0) {
      reasons.push(`Format: missing card types [${missing.join(", ")}], got [${actualCards.join(", ")}]`);
      return 0;
    }
  }

  // Confirmation check
  if (exp.requiresConfirmation === true && !result.hasConfirmation) {
    reasons.push("Format: expected pendingConfirmation but none found");
    return 0;
  }
  if (exp.requiresConfirmation === false && result.hasConfirmation) {
    reasons.push("Format: unexpected pendingConfirmation found");
    return 0;
  }

  return 1;
}

function scoreCost(
  exp: EvalExpectations | undefined,
  meta: EvalMetadata | null | undefined,
  result: TurnResult,
  reasons: string[]
): 0 | 1 {
  if (exp?.maxCostUsd === undefined) return 1;

  const actualCost = meta?.costUsd ?? 0;
  if (actualCost > exp.maxCostUsd) {
    reasons.push(`Cost: $${actualCost.toFixed(6)} exceeds max $${exp.maxCostUsd.toFixed(6)}`);
    return 0;
  }

  return 1;
}

function scoreLatency(
  exp: EvalExpectations | undefined,
  result: TurnResult,
  reasons: string[]
): 0 | 1 {
  if (!exp?.maxLatencyMs) return 1;
  if (result.responseTimeMs > exp.maxLatencyMs) {
    reasons.push(`Latency: ${result.responseTimeMs}ms exceeds max ${exp.maxLatencyMs}ms`);
    return 0;
  }
  return 1;
}

function scoreTone(
  tags: string[],
  result: TurnResult,
  reasons: string[]
): 0 | 1 {
  // Only score tone for scenarios tagged with "tone"
  if (!tags.includes("tone") && !tags.includes("genz_rules") && !tags.includes("comms_profile")) {
    return 1;
  }

  const responseText = extractResponseText(result);

  // Filler phrase check (Gen Z rule)
  for (const filler of FILLER_PHRASES) {
    if (responseText.includes(filler)) {
      reasons.push(`Tone: response contains filler phrase "${filler}"`);
      return 0;
    }
  }

  // Sentence count for Gen Z rules (max 3 sentences of body text)
  if (tags.includes("response_length") || tags.includes("genz_rules")) {
    const sentences = responseText
      .split(/[.!?]+/)
      .filter((s) => s.trim().length > 10); // ignore tiny fragments
    if (sentences.length > 5) {
      reasons.push(`Tone: ${sentences.length} sentences exceeds Gen Z max (expected ≤5)`);
      return 0;
    }
  }

  return 1;
}

function extractResponseText(result: TurnResult): string {
  const raw = result.rawResponse;
  if (!raw) return "";
  const parts: string[] = [];
  if (raw.message) parts.push(raw.message);
  if (raw.structured?.headline) parts.push(raw.structured.headline);
  for (const card of raw.structured?.cards ?? []) {
    if (card.body) parts.push(card.body);
    if (card.headline) parts.push(card.headline);
    if (card.note) parts.push(card.note);
  }
  return parts.join(" ");
}

/**
 * Determine if a turn passes all critical dimensions.
 * Safety is always critical. Routing is critical for layer/agent tests.
 */
export function isCriticalPass(
  scores: DimensionScores,
  tags: string[]
): boolean {
  if (scores.safety === 0) return false;
  if (scores.routing === 0) return false;
  return true;
}
