/**
 * Decision-Stakes Model Router — scores query complexity to choose Haiku vs Sonnet.
 *
 * Replaces the boolean `isComplexIntent` check with a weighted scoring system.
 * Only applies to the ~30% of queries that reach the AI (70% are fast-path at $0).
 *
 * Score thresholds:
 *   < 20 points → Haiku (informational, low-stakes)
 *   >= 20 points → Sonnet (directive, safety-critical, multi-step planning)
 *
 * Cost impact: ~10-15% of fallthrough queries shift from Haiku to Sonnet.
 */

import type { PlayerContext } from "./contextBuilder";
import type { ConversationState } from "./sessionService";

export interface StakesResult {
  score: number;
  model: "sonnet" | "haiku";
  reasons: string[];
}

const SONNET_THRESHOLD = 20;

/**
 * Score the decision stakes of a query to determine model routing.
 */
export function scoreDecisionStakes(
  message: string,
  context: PlayerContext,
  agentCount: number,
  conversationState?: ConversationState | null
): StakesResult {
  const lower = message.toLowerCase();
  let score = 0;
  const reasons: string[] = [];

  // ── HIGH STAKES (safety/health) ──────────────────────
  if (/phv|growth.*stage|maturity|growth.*plate/i.test(lower)) {
    score += 30;
    reasons.push("PHV/growth involvement");
  }
  if (/injur|pain|hurt|strain|sprain|broken|torn|swell/i.test(lower)) {
    score += 25;
    reasons.push("injury/pain mention");
  }

  // ── MEDIUM-HIGH STAKES (load/readiness warning) ──────
  const acwr = context.snapshotEnrichment?.acwr;
  if (acwr != null && acwr > 1.3) {
    score += 20;
    reasons.push(`ACWR ${acwr.toFixed(2)} > 1.3`);
  }
  if (context.readinessScore === "Red") {
    score += 15;
    reasons.push("readiness RED");
  }

  // ── MEDIUM STAKES (planning/multi-step) ──────────────
  if (/plan.*week|build.*session|full.*workout|training plan|practice plan|optimize/i.test(lower)) {
    score += 20;
    reasons.push("multi-step planning");
  }
  if (agentCount > 1) {
    score += 15;
    reasons.push("multi-agent routing");
  }
  if (/compare.*peer|how.*stack|vs other|rank.*against|benchmark/i.test(lower)) {
    score += 15;
    reasons.push("benchmark comparison");
  }

  // ── MEDIUM STAKES (calendar writes with conflict potential) ──
  if (/\b(move|reschedule|cancel|delete|update|edit)\b.*\b(event|training|session|match)\b/i.test(lower)) {
    score += 15;
    reasons.push("calendar write action");
  }

  // ── LOW BOOST (context complexity) ───────────────────
  if (conversationState?.referencedDates && Object.keys(conversationState.referencedDates).length > 1) {
    score += 10;
    reasons.push("multi-date conversation context");
  }

  // ── NEGATIVE (simple lookups that Haiku handles fine) ─
  if (/^(what'?s|show|my)\s+(readiness|streak|load|week|tests?|schedule)/i.test(lower)) {
    score -= 20;
    reasons.push("simple data lookup");
  }
  if (/^(check in|log a test|sync whoop|go to)/i.test(lower)) {
    score -= 30;
    reasons.push("capsule action");
  }

  const model = score >= SONNET_THRESHOLD ? "sonnet" : "haiku";

  return { score, model, reasons };
}
