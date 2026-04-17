/**
 * Deterministic sampling policy for the quality track.
 *
 * Coverage target:
 *   - 100% of high-risk turns (PHV-flagged, safety-gated, low-confidence,
 *     fallthrough)
 *   - ~20% stratified random of routine turns (elevated vs the 10% in the
 *     eventual steady-state, because Phase 1 doesn't yet receive the
 *     low_confidence_intent + fallthrough signals from the Python service)
 *
 * The decision is deterministic on (sessionId, turnId) so the same turn
 * always lands in the same bucket — reproducible, no double-counting.
 */

import type { SamplingDecision, TurnCapture, AthleteContext } from "./types";

// Simple FNV-1a for stable bucketing without a crypto dep.
function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Phase 1 random-sample rate (0–100). Adjust down to 10 in Phase 2. */
const ROUTINE_SAMPLE_PCT = 20;

export function decideSampling(
  turn: TurnCapture,
  ctx: AthleteContext
): SamplingDecision {
  // Precedence: 100% strata first, then routine random.
  if (ctx.phvStage === "mid_phv") {
    return { sample: true, stratum: "phv_flagged" };
  }
  if (turn.safetyGateTriggered) {
    return { sample: true, stratum: "safety_triggered" };
  }
  if (turn.intentConfidence !== null && turn.intentConfidence < 0.7) {
    return { sample: true, stratum: "low_confidence_intent" };
  }
  if (turn.fellThrough) {
    return { sample: true, stratum: "fallthrough" };
  }

  const key = `${turn.sessionId ?? "nosession"}:${turn.turnId}`;
  const bucket = fnv1a(key) % 100;
  if (bucket < ROUTINE_SAMPLE_PCT) {
    return { sample: true, stratum: "routine_sample" };
  }

  return { sample: false, stratum: "unsampled" };
}
