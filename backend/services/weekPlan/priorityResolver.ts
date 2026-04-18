/**
 * Category Priority Resolver
 *
 * Resolves the category priority order for the week-plan repair engine
 * from CMS-managed data, with zero hardcoding of the priority itself.
 *
 * Inputs:
 *   - scenario     — normal | leagueActive | examPeriod | leagueExam
 *                     (derived from prefs: league_is_active +
 *                     exam_period_active flags)
 *   - modeId       — athlete_modes.id (balanced | league | study | rest
 *                     or any CMS-added mode)
 *   - cmsRules     — scheduling_rules.config loaded once via
 *                     getActiveSchedulingConfig()
 *   - cmsModes     — athlete_modes row for the selected mode, for
 *                     params.priorityBoosts
 *
 * Output: ordered array of category ids, highest priority first.
 *
 * Why here and not in schedulingEngine.ts:
 * - The existing PRIORITY_ORDER in scheduleRuleEngine.ts is an in-memory
 *   fallback used by prompt generation. The engine itself doesn't consume
 *   it for placement. We keep that untouched and build repair priority
 *   as a new, tested surface.
 * - The repair engine uses 9 categories (matches week_plan categories +
 *   legacy ones); scheduling_rules CMS uses 8. Unknown-in-CMS categories
 *   get slotted at sensible defaults.
 */

import { supabaseAdmin } from "@/lib/supabase/admin";
import { getActiveSchedulingConfig } from "@/lib/schedulingRulesLoader";

export type Scenario = "normal" | "leagueActive" | "examPeriod" | "leagueExam";

export interface PriorityBoost {
  category: string;
  delta: number;  // negative = moves earlier (higher priority), positive = later
}

export interface ResolvedPriority {
  scenario: Scenario;
  modeId: string;
  order: string[];  // category ids, rank 0 = highest priority
  source: "cms" | "cms+mode_boost" | "fallback";
}

/**
 * Map week-plan category ids onto the canonical scheduling_rules categories.
 * A week-plan-only category inherits the rank of its closest sibling.
 */
const CATEGORY_RANK_SIBLING: Record<string, string> = {
  // Week-plan categories → scheduling_rules equivalent
  match_competition: "match",
  // Individual technical work is the athlete's own sport-specific drills →
  // rank it next to "club" (coach-set) with a small demotion so club wins
  // when both are flexible.
  individual_technical: "club",
  // Tactical/team-shape work is usually club-driven or coach-prescribed.
  tactical: "club",
  // Mental performance slots alongside personal development.
  mental_performance: "personal",
};

/** Scenario derivation — matches scheduleRuleEngine.detectScenario. */
export function detectScenario(prefs: {
  league_is_active?: boolean;
  exam_period_active?: boolean;
}): Scenario {
  if (prefs.league_is_active && prefs.exam_period_active) return "leagueExam";
  if (prefs.league_is_active) return "leagueActive";
  if (prefs.exam_period_active) return "examPeriod";
  return "normal";
}

/** Load mode.params.priorityBoosts for one mode id, tolerant of empty rows. */
async function loadPriorityBoosts(modeId: string): Promise<PriorityBoost[]> {
  if (!modeId) return [];
  try {
    const db = supabaseAdmin();
    const { data } = await (db as any)
      .from("athlete_modes")
      .select("params")
      .eq("id", modeId)
      .maybeSingle();
    const raw = data?.params?.priorityBoosts;
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((b: unknown): b is PriorityBoost =>
        typeof b === "object" &&
        b !== null &&
        typeof (b as any).category === "string" &&
        typeof (b as any).delta === "number",
      )
      .map((b) => ({ category: b.category, delta: b.delta }));
  } catch {
    return [];
  }
}

/**
 * Final fallback priority order — only used if the scheduling_rules row
 * is missing or its `priority.<scenario>` is empty. Mirrors the seed
 * default in migration 047.
 */
const FALLBACK_ORDER: Record<Scenario, string[]> = {
  normal: ["school", "exam", "match", "recovery", "club", "gym", "study", "personal"],
  leagueActive: ["school", "match", "recovery", "exam", "club", "gym", "study", "personal"],
  examPeriod: ["school", "exam", "recovery", "study", "match", "club", "gym", "personal"],
  leagueExam: ["school", "match", "exam", "recovery", "study", "club", "gym", "personal"],
};

/**
 * Expand a CMS base order (may be 8 categories) to cover all week-plan
 * categories (9 — adds individual_technical, tactical, match_competition,
 * mental_performance). Unknown categories get rank-inserted next to their
 * mapped sibling (see CATEGORY_RANK_SIBLING).
 *
 * Deterministic for the same input.
 */
function expandOrder(base: string[]): string[] {
  const out = [...base];
  // Substitute match_competition for the "match" slot — they're the same
  // concept in the week-plan world; keeps the rank intact.
  const matchIdx = out.indexOf("match");
  if (matchIdx >= 0 && !out.includes("match_competition")) {
    out.splice(matchIdx + 1, 0, "match_competition");
  }
  // Insert the remaining week-plan specifics next to their siblings.
  for (const [specific, sibling] of Object.entries(CATEGORY_RANK_SIBLING)) {
    if (specific === "match_competition") continue;
    if (out.includes(specific)) continue;
    const siblingIdx = out.indexOf(sibling);
    if (siblingIdx >= 0) {
      // Slot right after the sibling — sibling keeps rank, specific is next.
      out.splice(siblingIdx + 1, 0, specific);
    } else {
      out.push(specific);
    }
  }
  return out;
}

/**
 * Apply a set of priorityBoost deltas to an ordered list, returning a new
 * ordered list. A negative delta promotes (earlier index), positive demotes.
 * Categories not in the list are appended at the bottom.
 */
function applyBoosts(base: string[], boosts: PriorityBoost[]): string[] {
  if (boosts.length === 0) return base;
  // Rank each category by its current index, apply delta, re-sort.
  const ranked = base.map((c, i) => ({ category: c, rank: i }));
  // Add any unranked boost targets at the bottom.
  for (const b of boosts) {
    if (!ranked.some((r) => r.category === b.category)) {
      ranked.push({ category: b.category, rank: ranked.length });
    }
  }
  const boostMap = new Map<string, number>();
  for (const b of boosts) boostMap.set(b.category, b.delta);
  for (const r of ranked) {
    r.rank += boostMap.get(r.category) ?? 0;
  }
  // Stable sort by adjusted rank (tie-break on original order preserved
  // by how we built `ranked`).
  ranked.sort((a, b) => a.rank - b.rank);
  return ranked.map((r) => r.category);
}

/**
 * Public entry point. Fetches the CMS order for the scenario, expands it
 * to cover week-plan categories, applies mode boosts, returns the
 * resolved priority. Never throws — falls back to baked-in defaults if
 * CMS is unreachable.
 */
export async function resolveCategoryPriority(args: {
  scenario: Scenario;
  modeId: string;
}): Promise<ResolvedPriority> {
  let source: ResolvedPriority["source"] = "cms";
  let baseOrder: string[] = [];
  try {
    const cfg = await getActiveSchedulingConfig();
    const scenarioOrder = (cfg as unknown as {
      priority?: Partial<Record<Scenario, string[]>>;
    }).priority?.[args.scenario];
    if (Array.isArray(scenarioOrder) && scenarioOrder.length > 0) {
      baseOrder = scenarioOrder;
    }
  } catch {
    // fall through
  }
  if (baseOrder.length === 0) {
    baseOrder = FALLBACK_ORDER[args.scenario];
    source = "fallback";
  }
  const expanded = expandOrder(baseOrder);
  const boosts = await loadPriorityBoosts(args.modeId);
  const final = applyBoosts(expanded, boosts);
  if (boosts.length > 0 && source !== "fallback") source = "cms+mode_boost";
  return {
    scenario: args.scenario,
    modeId: args.modeId,
    order: final,
    source,
  };
}

/** Lookup a category's priority rank (0 = highest). Unknown = Number.MAX. */
export function rankOf(priority: ResolvedPriority, category: string): number {
  const idx = priority.order.indexOf(category);
  return idx === -1 ? Number.MAX_SAFE_INTEGER : idx;
}

/** True iff `a` ranks strictly higher than `b` (smaller index wins). */
export function outranks(
  priority: ResolvedPriority,
  a: string,
  b: string,
): boolean {
  return rankOf(priority, a) < rankOf(priority, b);
}
