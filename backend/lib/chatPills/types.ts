/**
 * Chat Pills — Shared types for CMS config, resolver, and API boundaries.
 * See docs/CHAT_PILLS_RFC.md §4.
 */

import type { ContextTag } from "./tagTaxonomy";

export interface ChatPill {
  id: string;
  label: string;
  message: string;
  enabled: boolean;
  allowInEmptyState: boolean;
  allowInResponse: boolean;
  tags: ContextTag[];
  excludeTags: ContextTag[];
  priority: number;
}

export interface ChatPillsEmptyStateConfig {
  mode: "fixed" | "dynamic";
  fixedIds: string[];
  defaultFallbackIds: string[];
}

export interface ChatPillsInResponseConfig {
  enabled: boolean;
  maxPerResponse: number;
  shadowMode: boolean;
}

export interface ChatPillsConfig {
  version: 1;
  emptyState: ChatPillsEmptyStateConfig;
  inResponse: ChatPillsInResponseConfig;
  library: ChatPill[];
}

export type ChatPillSource = "empty_state" | "in_response";

export interface ResolveChipsInput {
  contextTags: ContextTag[];
  config: ChatPillsConfig;
  existingChips?: Array<{ label: string; action: string }>;
}

export interface ShadowDiff {
  addedPillIds: string[];
  removedLabels: string[];
  unchanged: boolean;
}

export interface ResolveChipsResult {
  chips: Array<{ label: string; action: string }>;
  resolvedPillIds: string[];
  shadowDiff?: ShadowDiff;
}
