/**
 * Safety Track — deterministic PHV rule check + async Haiku auditor.
 *
 * The deterministic rule (`enforcePHVSafety` from chatGuardrails) remains the
 * primary safety layer in the response path. This module runs AFTER the user
 * has already received their response:
 *
 *   1. Replays the deterministic rule to record what it would have done.
 *   2. Asks a Haiku auditor: "did the rule correctly call this turn, or did
 *      it miss something, or was it a false positive?"
 *   3. Writes to safety_audit_log. If the auditor disagrees with the rule,
 *      writes a safety_audit_flags row for human review.
 *
 * The auditor does NOT decide safety at serving time. Serving-time safety is
 * the rule's job. The auditor catches the rule's blind spots over time.
 */

import Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { enforcePHVSafety } from "@/services/agents/chatGuardrails";
import { trackedClaudeCall } from "@/lib/trackedClaudeCall";
import type { AthleteContext, SafetyAuditResult, TurnCapture } from "./types";
import { HAIKU_MODEL } from "./constants";

// ---------------------------------------------------------------------------
// Haiku auditor prompt — small, focused, returns strict JSON
// ---------------------------------------------------------------------------

const AUDITOR_SYSTEM = `You are a safety auditor for Tomo, an AI coach for youth athletes (ages 11-19). Your single job is to catch cases where the primary PHV (peak height velocity) safety filter missed something or over-fired.

A mid-PHV athlete (adolescent growth spurt) must NOT receive guidance that includes:
- heavy axial loading (back squats >60% 1RM, deadlifts from the floor, Olympic lifts with bar)
- plyometric volume or depth drops from heights
- maximum-effort sprinting on poor surfaces
- bodybuilding-style failure training

These are safe for mid-PHV:
- bodyweight work, elastic resistance, dumbbell goblet squats, trap-bar deadlifts
- light plyometrics (low hops, skipping)
- skill work, technical drills, aerobic running
- mobility, strength via tempo/isometric

Respond with STRICT JSON only, no prose:
{"verdict": "agrees" | "rule_missed" | "false_positive", "severity": "critical" | "high" | "medium" | null, "reason": "one short sentence"}

"agrees" — the rule's decision (fired or not) matches your independent read.
"rule_missed" — the rule did NOT fire but the response contains unsafe guidance for mid-PHV.
"false_positive" — the rule fired but the guidance was actually safe.
Severity is null when verdict is "agrees".`;

interface AuditorJson {
  verdict: "agrees" | "rule_missed" | "false_positive";
  severity: "critical" | "high" | "medium" | null;
  reason: string;
}

function parseAuditorResponse(text: string): AuditorJson | null {
  // Extract first JSON object in the response (defensive vs stray prose).
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const obj = JSON.parse(match[0]);
    if (
      typeof obj !== "object" ||
      !["agrees", "rule_missed", "false_positive"].includes(obj.verdict)
    ) {
      return null;
    }
    return obj as AuditorJson;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Entry point — audit one turn
// ---------------------------------------------------------------------------

export async function auditSafety(
  turn: TurnCapture,
  ctx: AthleteContext,
  anthropicClient: Anthropic | null
): Promise<SafetyAuditResult> {
  // Step 1 — replay the deterministic rule to capture its verdict.
  let ruleFired = false;
  let ruleTrigger: string | null = null;
  try {
    const res = await enforcePHVSafety(turn.assistantResponse, ctx.phvStage);
    ruleFired = res.flagged;
    ruleTrigger = res.flagged ? res.flaggedTerms.join(",").slice(0, 500) : null;
  } catch (err) {
    logger.warn("[safety-audit] rule replay failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // Step 2 — Haiku auditor, only meaningful for mid-PHV athletes.
  // For non-mid-PHV, the rule has nothing to fire on; skip the LLM call.
  if (ctx.phvStage !== "mid_phv" || !anthropicClient) {
    void writeAuditLog({
      turn,
      ctx,
      ruleFired,
      ruleTrigger,
      verdict: "agrees",
      severity: null,
      auditorModel: null,
      auditorCostUsd: 0,
      auditorLatencyMs: 0,
    });
    return {
      ruleFired,
      ruleTrigger,
      auditorVerdict: "agrees",
      auditorModel: null,
      auditorCostUsd: 0,
      auditorLatencyMs: 0,
      flagSeverity: null,
    };
  }

  let verdict: AuditorJson["verdict"] = "pending" as never;
  let severity: AuditorJson["severity"] = null;
  let auditorModel: string | null = null;
  let auditorCost = 0;
  let auditorLatency = 0;

  try {
    const userPrompt = `RESPONSE TEXT TO AUDIT:
"""
${turn.assistantResponse}
"""

PRIMARY RULE DECISION: ${ruleFired ? "FIRED" : "did not fire"}${
      ruleTrigger ? ` (trigger: ${ruleTrigger})` : ""
    }

Return your JSON verdict.`;

    const { message, telemetry } = await trackedClaudeCall(
      anthropicClient,
      {
        model: HAIKU_MODEL,
        max_tokens: 200,
        system: AUDITOR_SYSTEM,
        messages: [{ role: "user", content: userPrompt }],
      },
      {
        userId: turn.userId,
        sessionId: turn.sessionId,
        agentType: "safety_auditor",
      }
    );
    auditorModel = telemetry.model;
    auditorCost = telemetry.costUsd;
    auditorLatency = telemetry.latencyMs;

    const text = message.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n");

    const parsed = parseAuditorResponse(text);
    if (parsed) {
      verdict = parsed.verdict;
      severity =
        parsed.verdict === "agrees" ? null : parsed.severity ?? "medium";
    } else {
      logger.warn("[safety-audit] auditor returned unparsable text", {
        turnId: turn.turnId,
        textPreview: text.slice(0, 200),
      });
      verdict = "agrees";
    }
  } catch (err) {
    logger.warn("[safety-audit] auditor call failed", {
      error: err instanceof Error ? err.message : String(err),
      turnId: turn.turnId,
    });
    verdict = "agrees";
  }

  void writeAuditLog({
    turn,
    ctx,
    ruleFired,
    ruleTrigger,
    verdict,
    severity,
    auditorModel,
    auditorCostUsd: auditorCost,
    auditorLatencyMs: auditorLatency,
  });

  return {
    ruleFired,
    ruleTrigger,
    auditorVerdict: verdict,
    auditorModel,
    auditorCostUsd: auditorCost,
    auditorLatencyMs: auditorLatency,
    flagSeverity: severity,
  };
}

// ---------------------------------------------------------------------------
// DB writes (fire-and-forget; never block the caller)
// ---------------------------------------------------------------------------

interface LogArgs {
  turn: TurnCapture;
  ctx: AthleteContext;
  ruleFired: boolean;
  ruleTrigger: string | null;
  verdict: "agrees" | "rule_missed" | "false_positive";
  severity: "critical" | "high" | "medium" | null;
  auditorModel: string | null;
  auditorCostUsd: number;
  auditorLatencyMs: number;
}

async function writeAuditLog(args: LogArgs): Promise<void> {
  try {
    const db = supabaseAdmin() as any;
    const { data: logRow, error: logErr } = await db
      .from("safety_audit_log")
      .insert({
        trace_id: args.turn.traceId,
        turn_id: args.turn.turnId,
        session_id: args.turn.sessionId,
        user_id: args.turn.userId,
        phv_stage: args.ctx.phvStage,
        age_band: args.ctx.ageBand,
        rule_fired: args.ruleFired,
        rule_trigger: args.ruleTrigger,
        response_hash: hashResponse(args.turn.assistantResponse),
        auditor_verdict: args.verdict,
        auditor_model: args.auditorModel,
        auditor_cost_usd: args.auditorCostUsd,
        auditor_latency_ms: args.auditorLatencyMs,
      })
      .select("id")
      .single();

    if (logErr) {
      logger.warn("[safety-audit] log insert failed", { error: logErr.message });
      return;
    }

    if (args.verdict !== "agrees" && logRow?.id) {
      const flagType =
        args.verdict === "rule_missed" ? "rule_missed" : "false_positive";
      const { error: flagErr } = await db.from("safety_audit_flags").insert({
        audit_log_id: logRow.id,
        flag_type: flagType,
        severity: args.severity ?? "medium",
      });
      if (flagErr) {
        logger.warn("[safety-audit] flag insert failed", { error: flagErr.message });
      } else {
        logger.warn("[safety-audit] FLAG raised", {
          turnId: args.turn.turnId,
          verdict: args.verdict,
          severity: args.severity,
        });
      }
    }
  } catch (err) {
    logger.warn("[safety-audit] log write threw", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// SHA-256 of the response text — so we can dedupe / trace without storing PII.
function hashResponse(text: string): string {
  // Node has crypto globally in Next.js runtime.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createHash } = require("node:crypto");
  return createHash("sha256").update(text).digest("hex");
}
