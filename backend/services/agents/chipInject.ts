/**
 * chipInject — CMS-driven chip injection at the orchestrator chokepoint.
 *
 * Three modes, controlled by `chat_pills.inResponse` in `ui_config`:
 *
 *   (a) enabled=false, shadowMode=false (default / kill-switch off)
 *        → no-op. Builder-emitted `structured.chips` are served.
 *        This is the baseline-safe path, identical to the March 2026
 *        AI Chat baseline behavior.
 *
 *   (b) enabled=false, shadowMode=true
 *        → resolve chips from CMS and LOG the result + diff against
 *        hardcoded chips. Does NOT mutate `structured.chips`.
 *        Use this to validate the library + tag taxonomy against real
 *        traffic before flipping the kill-switch.
 *
 *   (c) enabled=true (shadowMode is ignored in this mode)
 *        → REPLACE `structured.chips` with resolver output. If the
 *        resolver returns an empty list, `structured.chips = []` —
 *        no silent fallback (see RFC §4.4).
 *
 * Config is cached in-memory for 60s; a mutation through the admin API
 * will take effect on the next tick. Safe to call unconditionally from
 * the orchestrator: every failure path is caught and logged.
 */

import { logger } from "@/lib/logger";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { resolveChipsForContext, isChatPillsConfig } from "./chipResolver";
import { deriveContextTagsFromContext, mergeContextTags } from "./contextTags";
import type { ChatPillsConfig } from "@/lib/chatPills/types";
import type { ContextTag } from "@/lib/chatPills/tagTaxonomy";
import type { TomoResponse } from "./responseFormatter";
import type { PlayerContext } from "./contextBuilder";

let cachedConfig: ChatPillsConfig | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 60_000;

/**
 * Test hook — invalidate the in-memory config cache so the next call
 * re-reads from the DB. Exposed for smoke/integration scripts; never
 * called in hot paths.
 */
export function __resetConfigCacheForTests(): void {
  cachedConfig = null;
  cachedAt = 0;
}

async function loadConfig(): Promise<ChatPillsConfig | null> {
  const now = Date.now();
  if (cachedConfig && now - cachedAt < CACHE_TTL_MS) return cachedConfig;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabaseAdmin() as any;
    const { data } = await db
      .from("ui_config")
      .select("config_value")
      .eq("config_key", "chat_pills")
      .single();
    if (!data || !isChatPillsConfig(data.config_value)) return null;
    cachedConfig = data.config_value as ChatPillsConfig;
    cachedAt = now;
    return cachedConfig;
  } catch (err) {
    logger.warn("[chipInject] load failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * Apply CMS-driven chip resolution at the orchestrator chokepoint.
 * Mutates `response.chips` in-place when `inResponse.enabled=true`.
 *
 * Contract:
 *   - Never throws. All errors are logged and swallowed.
 *   - Merges builder-emitted `response.contextTags` with tags derived
 *     from `ctx` (readiness, exam_soon, has_clash, etc.).
 *   - When active, the merged tags + full library drive the resolver.
 *   - When shadow, logs the resolver's would-be output and a diff.
 */
export async function applyChipInjection(
  response: TomoResponse | null | undefined,
  ctx: PlayerContext | null | undefined
): Promise<void> {
  if (!response) return;
  try {
    const config = await loadConfig();
    if (!config) return;

    const { enabled, shadowMode } = config.inResponse;
    if (!enabled && !shadowMode) return;

    const builderTags = (response.contextTags ?? []) as ContextTag[];
    const derivedTags = ctx ? deriveContextTagsFromContext(ctx) : [];
    const contextTags = mergeContextTags(builderTags, derivedTags) as ContextTag[];

    const result = resolveChipsForContext({
      contextTags,
      config,
      existingChips: response.chips ?? [],
    });

    if (enabled) {
      response.chips = result.chips;
      logger.info("[chipInject] active", {
        builderTags,
        derivedTags,
        resolvedPillIds: result.resolvedPillIds,
        chipCount: result.chips.length,
      });
      return;
    }

    // shadowMode only (enabled=false)
    logger.info("[chipInject] shadow", {
      builderTags,
      derivedTags,
      hardcodedLabels: (response.chips ?? []).map((c) => c.label),
      resolvedPillIds: result.resolvedPillIds,
      shadowDiff: result.shadowDiff,
    });
  } catch (err) {
    logger.warn("[chipInject] failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
