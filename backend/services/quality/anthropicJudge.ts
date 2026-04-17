/**
 * Judge A — Claude Haiku.
 *
 * Uses the shared rubric (judgeRubric.ts) and the existing trackedClaudeCall
 * wrapper for unified cost + latency telemetry. The rubric block is sent
 * with ephemeral prompt caching so steady-state cost stays low.
 */

import Anthropic from "@anthropic-ai/sdk";
import { trackedClaudeCall } from "@/lib/trackedClaudeCall";
import type { AthleteContext, LLMJudgeResult, TurnCapture } from "./types";
import { HAIKU_MODEL } from "./constants";
import {
  JUDGE_RUBRIC,
  type JudgeTriggers,
  buildUserPrompt,
  parseJudgeJson,
  toDimensionScores,
} from "./judgeRubric";

export async function runAnthropicJudge(
  turn: TurnCapture,
  ctx: AthleteContext,
  flags: JudgeTriggers,
  client: Anthropic
): Promise<LLMJudgeResult> {
  const { message, telemetry } = await trackedClaudeCall(
    client,
    {
      model: HAIKU_MODEL,
      max_tokens: 400,
      system: [
        {
          type: "text",
          text: JUDGE_RUBRIC,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content: buildUserPrompt(turn, ctx, flags) }],
    },
    {
      userId: turn.userId,
      sessionId: turn.sessionId,
      agentType: "quality_judge_a",
    }
  );

  const text = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");

  const parsed = parseJudgeJson(text);
  const scores = toDimensionScores(parsed, flags);

  return {
    scores,
    reasoning: parsed?.reasoning ?? "",
    model: telemetry.model,
    costUsd: telemetry.costUsd,
    latencyMs: telemetry.latencyMs,
  };
}
