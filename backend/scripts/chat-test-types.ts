/**
 * Chat Test Types — Interfaces for the conversation test runner + eval harness.
 */

// ── BASIC TEST TYPES (backward compat) ─────────────────────

export interface TestConfig {
  baseUrl: string;
  authToken: string;
  timezone: string;
  verbose: boolean;
  /** Enable 6-dimension eval scoring + _eval metadata extraction */
  evalMode?: boolean;
}

export interface ConversationTurn {
  message: string;
  /** If set, send as capsuleAction instead of plain message */
  capsuleAction?: {
    type: string;
    toolName: string;
    toolInput: Record<string, any>;
    agentType: string;
  };
  /** If set, send as confirmedAction */
  confirmedAction?: {
    toolName: string;
    toolInput: Record<string, any>;
    agentType: string;
  };
  /** Instead of fixed message, tap chip with this label from prev response */
  followChipLabel?: string;
  /** Expected card type in structured.cards[0].type */
  expectedCardType?: string;
  /** Expected card type can be one of these (OR match) */
  expectedCardTypeOneOf?: string[];
  /** If true, expect pendingConfirmation in response */
  expectConfirmation?: boolean;
  /** If true, expect refreshTargets non-empty */
  expectRefreshTargets?: boolean;
  /** If true, expect structured.chips to be non-empty */
  expectChips?: boolean;
  /** Custom chip label to expect */
  expectChipLabel?: string;
  /** Active tab override for this turn */
  activeTab?: string;
  /** Eval harness: expected eval dimensions */
  evalExpected?: EvalExpectations;
  /** Eval harness: tags for scoring (e.g., ["phv_safety", "tone"]) */
  tags?: string[];
}

export interface TestScenario {
  page: string;
  name: string;
  turns: ConversationTurn[];
  /** Eval harness: suite grouping (s1-s8) */
  suite?: string;
}

export interface TurnResult {
  turnIndex: number;
  message: string;
  status: number;
  expectedCardType: string | null;
  actualCardType: string | null;
  pass: boolean;
  responseTimeMs: number;
  costTier: "capsule" | "haiku" | "sonnet" | "unknown";
  error: string | null;
  notes: string;
  hasConfirmation: boolean;
  hasRefreshTargets: boolean;
  chipLabels: string[];
  rawResponse?: any;
  /** Eval harness: metadata from _eval field */
  evalMetadata?: EvalMetadata | null;
  /** Eval harness: 6-dimension scores */
  dimensionScores?: DimensionScores | null;
  /** Eval harness: failure reasons from scorer */
  evalFailureReasons?: string[];
}

export interface ScenarioResult {
  page: string;
  name: string;
  turns: TurnResult[];
  overallPass: boolean;
  totalTimeMs: number;
  suite?: string;
}

// ── EVAL HARNESS TYPES ─────────────────────────────────────

export interface EvalMetadata {
  classifierLayer: string;
  intentId: string;
  confidence: number;
  agentRouted: string;
  modelUsed: string;
  costUsd: number;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  capsuleType: string | null;
  cardTypes: string[];
  phvSafetyFlagged?: boolean;
}

export interface DimensionScores {
  routing: 0 | 1;
  safety: 0 | 1;
  relevance: 1 | 2 | 3 | 4 | 5;
  format: 0 | 1;
  cost: 0 | 1;
  tone: 0 | 1;
}

export interface EvalExpectations {
  /** Expected classifier layer: 1=exact_match, 2=haiku, 3=fallthrough */
  classifierLayer?: number;
  /** Expected intent ID from registry */
  intentId?: string;
  /** Expected agent: "output" | "timeline" | "mastery" | "multi" */
  agentRouted?: string;
  /** Expected model: "sonnet" | "haiku" | "fast_path" | "exact_match" */
  modelUsed?: string;
  /** Maximum acceptable cost in USD */
  maxCostUsd?: number;
  /** Maximum acceptable latency in ms */
  maxLatencyMs?: number;
  /** Minimum confidence threshold */
  minConfidence?: number;
  /** If true, PHV safety gate must fire */
  phvBlockTriggered?: boolean;
  /** Substrings expected in response text (case-insensitive) */
  responseContains?: string[];
  /** Substrings that must NOT appear in response (case-insensitive) */
  responseNotContains?: string[];
  /** Expected capsule type */
  capsuleType?: string;
  /** Expected card types (all must be present) */
  cardTypes?: string[];
  /** If true, response must include pendingConfirmation */
  requiresConfirmation?: boolean;
}

export interface SuiteReport {
  suiteId: string;
  totalScenarios: number;
  passed: number;
  failed: number;
  passRate: number;
  avgLatencyMs: number;
  totalCostUsd: number;
  dimensionBreakdown: Record<keyof DimensionScores, { pass: number; fail: number }>;
  failures: TurnResult[];
}
