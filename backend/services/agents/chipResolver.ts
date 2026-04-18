/**
 * chipResolver — Pure tag-matching function that picks chat pills from the
 * CMS library based on a response's context tags.
 *
 * See docs/CHAT_PILLS_RFC.md §4.4.
 *
 * Contract:
 *   - No I/O. Config is passed in.
 *   - On zero matches returns an empty array — NO silent fallback to
 *     hardcoded chips. Fail loudly.
 *   - Pills with "always" in their tags are used only when nothing else
 *     matched; a normal tag-matched pill always beats an "always" pill.
 *
 * PR1: wired behind `inResponse.shadowMode` only (log-only). PR2 flips
 * `inResponse.enabled` to mutate `TomoResponse.chips`.
 */

import type { ContextTag } from "@/lib/chatPills/tagTaxonomy";
import type {
  ChatPill,
  ChatPillsConfig,
  ResolveChipsInput,
  ResolveChipsResult,
  ShadowDiff,
} from "@/lib/chatPills/types";

type ActionChip = { label: string; action: string };

function overlaps<T>(a: readonly T[], b: readonly T[]): boolean {
  if (a.length === 0 || b.length === 0) return false;
  const set = new Set<T>(a);
  for (const item of b) if (set.has(item)) return true;
  return false;
}

function pillMatches(
  pill: ChatPill,
  contextTags: readonly ContextTag[]
): { matched: boolean; viaAlways: boolean } {
  if (!pill.enabled || !pill.allowInResponse) {
    return { matched: false, viaAlways: false };
  }
  if (overlaps(pill.excludeTags, contextTags)) {
    return { matched: false, viaAlways: false };
  }
  const nonAlwaysTags = pill.tags.filter((t) => t !== "always");
  if (overlaps(nonAlwaysTags, contextTags)) {
    return { matched: true, viaAlways: false };
  }
  if (pill.tags.includes("always")) {
    return { matched: true, viaAlways: true };
  }
  return { matched: false, viaAlways: false };
}

export function resolveChipsForContext(
  input: ResolveChipsInput
): ResolveChipsResult {
  const { contextTags, config, existingChips } = input;
  const max = Math.max(1, Math.min(3, config.inResponse.maxPerResponse));

  // Partition matches into normal (tag-overlap) and "always"-only matches.
  // Normal matches win; "always" only fills remaining slots.
  const normal: Array<{ pill: ChatPill; index: number }> = [];
  const alwaysOnly: Array<{ pill: ChatPill; index: number }> = [];
  config.library.forEach((pill, index) => {
    const res = pillMatches(pill, contextTags);
    if (!res.matched) return;
    (res.viaAlways ? alwaysOnly : normal).push({ pill, index });
  });

  const sortByPriority = (
    a: { pill: ChatPill; index: number },
    b: { pill: ChatPill; index: number }
  ): number => {
    if (b.pill.priority !== a.pill.priority) {
      return b.pill.priority - a.pill.priority;
    }
    return a.index - b.index; // library order is the tiebreaker
  };
  normal.sort(sortByPriority);
  alwaysOnly.sort(sortByPriority);

  const chosen: ChatPill[] = [];
  for (const entry of normal) {
    if (chosen.length >= max) break;
    chosen.push(entry.pill);
  }
  for (const entry of alwaysOnly) {
    if (chosen.length >= max) break;
    if (chosen.some((p) => p.id === entry.pill.id)) continue;
    chosen.push(entry.pill);
  }

  const chips: ActionChip[] = chosen.map((p) => ({
    label: p.label,
    action: p.message,
  }));
  const resolvedPillIds = chosen.map((p) => p.id);

  let shadowDiff: ShadowDiff | undefined;
  if (existingChips) {
    const existingLabels = new Set(existingChips.map((c) => c.label));
    const newLabels = new Set(chips.map((c) => c.label));
    const addedPillIds = chosen
      .filter((p) => !existingLabels.has(p.label))
      .map((p) => p.id);
    const removedLabels = [...existingLabels].filter((l) => !newLabels.has(l));
    shadowDiff = {
      addedPillIds,
      removedLabels,
      unchanged:
        addedPillIds.length === 0 &&
        removedLabels.length === 0 &&
        existingChips.length === chips.length,
    };
  }

  return { chips, resolvedPillIds, shadowDiff };
}

/**
 * Convenience: type-narrowing check for response-time consumers.
 */
export function isChatPillsConfig(v: unknown): v is ChatPillsConfig {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return o.version === 1 && typeof o.emptyState === "object" && Array.isArray(o.library);
}
