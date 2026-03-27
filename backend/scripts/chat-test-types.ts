/**
 * Chat Test Types — Interfaces for the conversation test runner.
 */

export interface TestConfig {
  baseUrl: string;
  authToken: string;
  timezone: string;
  verbose: boolean;
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
}

export interface TestScenario {
  page: string;
  name: string;
  turns: ConversationTurn[];
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
}

export interface ScenarioResult {
  page: string;
  name: string;
  turns: TurnResult[];
  overallPass: boolean;
  totalTimeMs: number;
}
