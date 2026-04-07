// ── Intelligence Hub v1 — Shared Types ──
// These mirror the Zod schemas in performanceIntelligenceSchemas.ts
// Used by Step components for local state and rendering.

export type FieldScale = "live" | "short_term" | "long_term";
export type FieldType = "number" | "scale_1_10" | "rag" | "text" | "boolean" | "calculated";

export interface SnapshotField {
  id: string;
  name: string;
  fieldType: FieldType;
  scale: FieldScale;
  sourceKey?: string;
  enabled: boolean;
}

export interface DataGroup {
  id: string;
  name: string;
  description: string;
  fields: SnapshotField[];
  enabled: boolean;
  isDefault: boolean;
}

export type RuleAction = "hard_stop" | "soft_limit" | "warn_only";

export interface RuleCondition {
  field: string;
  operator: "greater_than" | "less_than" | "equals" | "contains" | "is_active";
  value: string | number;
  unit?: string;
}

export interface GuardrailRule {
  id: string;
  when: string;
  condition: RuleCondition;
  action: RuleAction;
  actionText: string;
  sourceGroup: string;
  enabled: boolean;
}

export interface ResponseRule {
  id: string;
  when: string;
  instruction: string;
  enabled: boolean;
}

export interface ContextBlock {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  locked: boolean;
}

export type FilterAction =
  | "remove_and_replace"
  | "translate_plain_language"
  | "add_safety_note"
  | "block_and_restart";

export type FilterScope =
  | "always"
  | "growth_phase"
  | "under_16"
  | "active_injury"
  | "new_athlete";

export interface SafetyFilter {
  id: string;
  catches: string;
  action: FilterAction;
  replacement?: string;
  scope: FilterScope;
  enabled: boolean;
  isDefault: boolean;
}

export interface HubState {
  dataGroups: DataGroup[];
  guardrailRules: GuardrailRule[];
  responseRules: ResponseRule[];
  contextBlocks: ContextBlock[];
  safetyFilters: SafetyFilter[];
}
