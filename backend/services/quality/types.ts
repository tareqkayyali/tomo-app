/**
 * Shared types for the Chat Quality Engine.
 *
 * Two tracks:
 *   Safety  — 100% coverage, deterministic rule + async LLM auditor
 *   Quality — stratified sampling, 3 judges (Haiku, cross-family LLM, rules)
 */

export type AgeBand = "u13" | "u15" | "u17" | "u19_plus" | "unknown";

export type PHVStage = "pre_phv" | "mid_phv" | "post_phv" | "unknown";

export type Agent =
  | "timeline"
  | "output"
  | "mastery"
  | "orchestrator"
  | "capsule"
  | "fast_path";

export type SamplingStratum =
  | "phv_flagged"
  | "safety_triggered"
  | "low_confidence_intent"
  | "fallthrough"
  | "routine_sample"
  | "unsampled";

export type Dimension =
  | "faithfulness"
  | "answer_quality"
  | "tone"
  | "age_fit"
  | "conversational"
  | "empathy"
  | "personalization"
  | "actionability";

/** Input captured at the tail of a chat turn, handed to the pipeline. */
export interface TurnCapture {
  traceId: string;
  turnId: string;
  sessionId: string | null;
  userId: string;
  userMessage: string;
  assistantResponse: string;
  activeTab: string | null;

  // Signals when available from the Python ai-service envelope.
  // Phase 1: most will be derived/defaulted in TS.
  agent: Agent;
  hasRag: boolean;
  intentConfidence: number | null;
  fellThrough: boolean;
  safetyGateTriggered: boolean;
}

/** Context fetched async to enrich the pipeline. */
export interface AthleteContext {
  userId: string;
  sport: string | null;
  ageBand: AgeBand;
  phvStage: PHVStage;
  position: string | null;
}

export interface SamplingDecision {
  sample: boolean;
  stratum: SamplingStratum;
}

/** One judge's score for every dimension. Null = not applicable this turn. */
export type DimensionScores = {
  [K in Dimension]: number | null;
};

export interface RuleJudgeResult {
  scores: DimensionScores;
  violations: string[];
}

export interface LLMJudgeResult {
  scores: DimensionScores;
  reasoning: string;
  model: string;
  costUsd: number;
  latencyMs: number;
}

export interface SafetyAuditResult {
  ruleFired: boolean;
  ruleTrigger: string | null;
  auditorVerdict: "agrees" | "rule_missed" | "false_positive" | "pending";
  auditorModel: string | null;
  auditorCostUsd: number;
  auditorLatencyMs: number;
  flagSeverity: "critical" | "high" | "medium" | null;
}

export interface EmpathyTriggerResult {
  triggered: boolean;
  matched: string[];
}

export interface ActionTriggerResult {
  triggered: boolean;
  matched: string[];
}
