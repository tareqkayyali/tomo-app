/**
 * Chat Quality Engine — public entry point.
 *
 * One call from the chat route tail dispatches both tracks:
 *   SAFETY   — 100% coverage. Replays the PHV rule, runs Haiku auditor.
 *   QUALITY  — stratified sampling. Runs all three judges in parallel
 *              (Haiku + GPT-4o-mini + rule heuristics), writes a single
 *              chat_quality_scores row with disagreement metadata.
 *
 * Both tracks are fire-and-forget; never delay the user response. Any
 * failure is logged at WARN and swallowed; chat path is unaffected.
 *
 * Usage:
 *   import { runQualityPipeline } from "@/services/quality";
 *   void runQualityPipeline({ ... });
 */

import Anthropic from "@anthropic-ai/sdk";
import type OpenAI from "openai";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { auditSafety } from "./safetyAuditor";
import { computeDisagreement, persistQualityRow } from "./qualityScorer";
import { runAnthropicJudge } from "./anthropicJudge";
import { runOpenAIJudge, getOpenAIClient } from "./openaiJudge";
import { runRuleJudge } from "./ruleJudges";
import { decideSampling } from "./samplingPolicy";
import { detectActionTrigger, detectEmpathyTrigger } from "./triggers";
import type {
  AgeBand,
  Agent,
  AthleteContext,
  LLMJudgeResult,
  PHVStage,
  TurnCapture,
} from "./types";

// ---------------------------------------------------------------------------
// Pipeline entry
// ---------------------------------------------------------------------------

export interface RunPipelineInput {
  traceId: string;
  turnId: string;
  sessionId: string | null;
  userId: string;
  userMessage: string;
  assistantResponse: string;
  activeTab?: string | null;
  // Envelope signals from the Python ai-service (Phase 2b). Optional so
  // older callers still work.
  agent?: Agent;
  hasRag?: boolean;
  intentConfidence?: number | null;
  fellThrough?: boolean;
  safetyGateTriggered?: boolean;
}

export async function runQualityPipeline(input: RunPipelineInput): Promise<void> {
  try {
    const turn: TurnCapture = {
      traceId: input.traceId,
      turnId: input.turnId,
      sessionId: input.sessionId,
      userId: input.userId,
      userMessage: input.userMessage,
      assistantResponse: input.assistantResponse,
      activeTab: input.activeTab ?? null,
      agent: input.agent ?? "orchestrator",
      hasRag: input.hasRag ?? false,
      intentConfidence: input.intentConfidence ?? null,
      fellThrough: input.fellThrough ?? false,
      safetyGateTriggered: input.safetyGateTriggered ?? false,
    };

    const ctx = await fetchAthleteContext(input.userId);
    const empathy = detectEmpathyTrigger(turn.userMessage);
    const action = detectActionTrigger(turn.userMessage);
    const flags = {
      empathyTriggered: empathy.triggered,
      actionTriggered: action.triggered,
    };

    const anthropicClient = getAnthropicClient();
    const openaiClient = getOpenAIClient();

    // SAFETY TRACK — always runs, fire-and-forget.
    void auditSafety(turn, ctx, anthropicClient).catch((err) => {
      logger.warn("[quality-pipeline] safety audit threw", {
        error: err instanceof Error ? err.message : String(err),
        turnId: turn.turnId,
      });
    });

    // QUALITY TRACK — sampled.
    const decision = decideSampling(turn, ctx);
    if (!decision.sample) return;

    // Judge C — pure-TS, always runs.
    const judgeC = runRuleJudge(turn, ctx, flags);

    // Judges A + B — LLM calls, run in parallel. Each may fail independently.
    const [judgeA, judgeB] = await Promise.all([
      anthropicClient ? callAnthropicJudge(turn, ctx, flags, anthropicClient) : Promise.resolve(null),
      openaiClient ? callOpenAIJudge(turn, ctx, flags, openaiClient) : Promise.resolve(null),
    ]);

    const disagreement = computeDisagreement(
      judgeA?.scores ?? null,
      judgeB?.scores ?? null,
      judgeC.scores
    );

    await persistQualityRow({
      turn,
      ctx,
      stratum: decision.stratum,
      empathyTriggered: empathy.triggered,
      actionTriggered: action.triggered,
      judgeA,
      judgeB,
      judgeC,
      disagreementMax: disagreement,
    });
  } catch (err) {
    logger.warn("[quality-pipeline] pipeline threw", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// Per-judge wrappers that isolate one judge's failure from the others.
async function callAnthropicJudge(
  turn: TurnCapture,
  ctx: AthleteContext,
  flags: { empathyTriggered: boolean; actionTriggered: boolean },
  client: Anthropic
): Promise<LLMJudgeResult | null> {
  try {
    return await runAnthropicJudge(turn, ctx, flags, client);
  } catch (err) {
    logger.warn("[quality-pipeline] Judge A (Haiku) failed", {
      error: err instanceof Error ? err.message : String(err),
      turnId: turn.turnId,
    });
    return null;
  }
}

async function callOpenAIJudge(
  turn: TurnCapture,
  ctx: AthleteContext,
  flags: { empathyTriggered: boolean; actionTriggered: boolean },
  client: OpenAI
): Promise<LLMJudgeResult | null> {
  try {
    return await runOpenAIJudge(turn, ctx, flags, client);
  } catch (err) {
    logger.warn("[quality-pipeline] Judge B (GPT-4o-mini) failed", {
      error: err instanceof Error ? err.message : String(err),
      turnId: turn.turnId,
    });
    return null;
  }
}

// ---------------------------------------------------------------------------
// Athlete context fetch
// ---------------------------------------------------------------------------

/**
 * Read the athlete's profile fields used by the quality pipeline.
 *
 * Canonical source is `athlete_snapshots` (migration 012) — one row per
 * athlete keyed by `athlete_id`, carrying dob/sport/position/phv_stage.
 *
 * Fallback: `public.users` carries `sport` (and `age`) for athletes without
 * a snapshot yet. If both are unavailable, returns unknown context —
 * pipeline still runs, just with less segmentation signal.
 */
async function fetchAthleteContext(userId: string): Promise<AthleteContext> {
  const fallback: AthleteContext = {
    userId,
    sport: null,
    ageBand: "unknown",
    phvStage: "unknown",
    position: null,
  };

  const db = supabaseAdmin() as any;

  // Primary: athlete_snapshots
  try {
    const { data, error } = await db
      .from("athlete_snapshots")
      .select("sport, position, dob, phv_stage")
      .eq("athlete_id", userId)
      .maybeSingle();

    if (!error && data) {
      return {
        userId,
        sport: data.sport ?? null,
        position: data.position ?? null,
        ageBand: ageBandFromDob(data.dob ?? null),
        phvStage: normalizePhvStage(data.phv_stage ?? null),
      };
    }
  } catch {
    // Fall through to user-table fallback
  }

  // Fallback: public.users (no DOB here, so age_band stays unknown)
  try {
    const { data } = await db
      .from("users")
      .select("sport, age")
      .eq("id", userId)
      .maybeSingle();

    if (data) {
      return {
        userId,
        sport: data.sport ?? null,
        position: null,
        ageBand: ageBandFromAge(data.age ?? null),
        phvStage: "unknown",
      };
    }
  } catch {
    /* noop */
  }

  return fallback;
}

function ageBandFromAge(age: number | null): AgeBand {
  if (age === null) return "unknown";
  if (age < 11) return "unknown";
  if (age < 14) return "u13";
  if (age < 16) return "u15";
  if (age < 18) return "u17";
  return "u19_plus";
}

function ageBandFromDob(dob: string | null): AgeBand {
  if (!dob) return "unknown";
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return "unknown";
  const age = (Date.now() - d.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
  if (age < 11) return "unknown";
  if (age < 14) return "u13";
  if (age < 16) return "u15";
  if (age < 18) return "u17";
  return "u19_plus";
}

function normalizePhvStage(s: string | null): PHVStage {
  if (!s) return "unknown";
  const lower = s.toLowerCase();
  if (lower === "pre_phv" || lower === "pre" || lower === "pre-phv") return "pre_phv";
  if (lower === "mid_phv" || lower === "mid" || lower === "circa" || lower === "mid-phv") return "mid_phv";
  if (lower === "post_phv" || lower === "post" || lower === "post-phv") return "post_phv";
  return "unknown";
}

// ---------------------------------------------------------------------------
// Anthropic client (singleton)
// ---------------------------------------------------------------------------

let _anthropicClient: Anthropic | null = null;
function getAnthropicClient(): Anthropic | null {
  if (_anthropicClient) return _anthropicClient;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  _anthropicClient = new Anthropic({ apiKey });
  return _anthropicClient;
}

// ---------------------------------------------------------------------------
// Helpers for chat-route callers to translate Python envelope telemetry into
// pipeline inputs. Kept next to the pipeline so the mapping is one-stop.
// ---------------------------------------------------------------------------

/** Python ai-service agent names → canonical TS quality-engine Agent values. */
export function mapPythonAgent(agent: string | undefined | null): Agent {
  switch ((agent ?? "").toLowerCase()) {
    case "performance":
    case "output":
      return "output";
    case "planning":
    case "timeline":
      return "timeline";
    case "identity":
    case "mastery":
      return "mastery";
    case "capsule":
      return "capsule";
    case "fast_path":
    case "fast-path":
      return "fast_path";
    default:
      return "orchestrator";
  }
}

/** Classification layers that represent a deterministic fast path. */
const FAST_PATH_LAYERS = new Set(["exact_match", "capsule", "fast_path"]);

/** A turn "fell through" when the routing didn't settle on a fast path. */
export function computeFellThrough(classificationLayer: string | null | undefined): boolean {
  if (!classificationLayer) return true;
  return !FAST_PATH_LAYERS.has(classificationLayer.toLowerCase());
}

// Re-export key types for callers.
export type { TurnCapture, AthleteContext, AgeBand, Agent, PHVStage } from "./types";
