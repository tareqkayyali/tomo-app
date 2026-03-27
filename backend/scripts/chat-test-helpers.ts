/**
 * Chat Test Helpers — HTTP client, validators, chip follower.
 */

import type { TestConfig, ConversationTurn, TurnResult } from "./chat-test-types";

/** Send a single turn to the chat API and validate the response. */
export async function executeTurn(
  config: TestConfig,
  turn: ConversationTurn,
  sessionId: string,
  prevResponse: any | null,
  turnIndex: number
): Promise<TurnResult> {
  // Resolve the message
  let message = turn.message;
  if (turn.followChipLabel && prevResponse?.structured?.chips) {
    const chip = prevResponse.structured.chips.find(
      (c: any) => c.label?.toLowerCase().includes(turn.followChipLabel!.toLowerCase())
    );
    if (chip) {
      message = chip.action;
    } else {
      return {
        turnIndex,
        message: `[CHIP NOT FOUND: "${turn.followChipLabel}"]`,
        status: 0,
        expectedCardType: turn.expectedCardType ?? null,
        actualCardType: null,
        pass: false,
        responseTimeMs: 0,
        costTier: "unknown",
        error: `Chip "${turn.followChipLabel}" not found in prev response. Available: ${JSON.stringify(prevResponse?.structured?.chips?.map((c: any) => c.label) ?? [])}`,
        notes: "",
        hasConfirmation: false,
        hasRefreshTargets: false,
        chipLabels: [],
      };
    }
  }

  const body: any = {
    message,
    sessionId,
    activeTab: turn.activeTab ?? "Chat",
    timezone: config.timezone,
  };
  if (turn.capsuleAction) body.capsuleAction = turn.capsuleAction;
  if (turn.confirmedAction) body.confirmedAction = turn.confirmedAction;

  const start = performance.now();
  let status = 0;
  let data: any = {};

  try {
    const res = await fetch(`${config.baseUrl}/api/v1/chat/agent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.authToken}`,
      },
      body: JSON.stringify(body),
    });
    status = res.status;
    data = await res.json();
  } catch (err: any) {
    return {
      turnIndex,
      message,
      status: 0,
      expectedCardType: turn.expectedCardType ?? null,
      actualCardType: null,
      pass: false,
      responseTimeMs: Math.round(performance.now() - start),
      costTier: "unknown",
      error: `Network error: ${err.message}`,
      notes: "",
      hasConfirmation: false,
      hasRefreshTargets: false,
      chipLabels: [],
    };
  }

  const elapsed = Math.round(performance.now() - start);
  const actualCardType = data.structured?.cards?.[0]?.type ?? null;
  const chipLabels = (data.structured?.chips ?? []).map((c: any) => c.label);
  const hasConfirmation = !!data.pendingConfirmation;
  const hasRefreshTargets = (data.refreshTargets?.length ?? 0) > 0;

  // Validate
  const errors: string[] = [];
  if (status !== 200) errors.push(`HTTP ${status}`);
  if (!data.message && !data.structured) errors.push("Empty response");
  if (data.error) errors.push(`API error: ${data.error}`);

  if (turn.expectedCardType && actualCardType !== turn.expectedCardType) {
    errors.push(`Card type: expected "${turn.expectedCardType}", got "${actualCardType}"`);
  }
  if (turn.expectedCardTypeOneOf && !turn.expectedCardTypeOneOf.includes(actualCardType)) {
    errors.push(`Card type: expected one of [${turn.expectedCardTypeOneOf.join(", ")}], got "${actualCardType}"`);
  }
  if (turn.expectConfirmation && !hasConfirmation) {
    errors.push("Expected pendingConfirmation but none found");
  }
  if (turn.expectRefreshTargets && !hasRefreshTargets) {
    errors.push("Expected refreshTargets but none found");
  }
  if (turn.expectChips && chipLabels.length === 0) {
    errors.push("Expected chips but none found");
  }
  if (turn.expectChipLabel) {
    const found = chipLabels.some((l: string) => l.toLowerCase().includes(turn.expectChipLabel!.toLowerCase()));
    if (!found) errors.push(`Expected chip "${turn.expectChipLabel}" not found in [${chipLabels.join(", ")}]`);
  }

  // Cost tier heuristic
  let costTier: TurnResult["costTier"] = "unknown";
  if (elapsed < 800) costTier = "capsule";
  else if (elapsed < 3000) costTier = "haiku";
  else costTier = "sonnet";

  return {
    turnIndex,
    message,
    status,
    expectedCardType: turn.expectedCardType ?? (turn.expectedCardTypeOneOf ? turn.expectedCardTypeOneOf.join("|") : null),
    actualCardType,
    pass: errors.length === 0,
    responseTimeMs: elapsed,
    costTier,
    error: errors.length > 0 ? errors.join("; ") : null,
    notes: turn.capsuleAction ? "capsule-action" : turn.followChipLabel ? "chip-follow" : "",
    hasConfirmation,
    hasRefreshTargets,
    chipLabels,
    // Always capture raw response for chip follow-up logic; verbose adds extra logging
    rawResponse: data,
  };
}
