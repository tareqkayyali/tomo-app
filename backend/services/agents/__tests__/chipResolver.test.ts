/**
 * chipResolver — contract tests.
 *
 * Run:
 *   cd backend && npx tsx services/agents/__tests__/chipResolver.test.ts
 *
 * Locks the resolver's public behavior before PR2 wires it into the
 * orchestrator chokepoint. If you change the resolver, update these tests
 * first — they are the spec.
 */

import { resolveChipsForContext } from "../chipResolver";
import type { ChatPill, ChatPillsConfig } from "@/lib/chatPills/types";
import type { ContextTag } from "@/lib/chatPills/tagTaxonomy";

// ── Tiny assertion helpers (match repo convention in weekPlanBuilder.test.ts) ──

let failed = 0;
let passed = 0;
const failures: string[] = [];

function test(name: string, fn: () => void): void {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    const msg = err instanceof Error ? err.message : String(err);
    failures.push(`${name} — ${msg}`);
    console.log(`  ✗ ${name}`);
    console.log(`      ${msg}`);
  }
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
    );
  }
}

// ── Fixture builders ─────────────────────────────────────────────

function pill(over: Partial<ChatPill> = {}): ChatPill {
  return {
    id: over.id ?? "p",
    label: over.label ?? "P",
    message: over.message ?? "do p",
    enabled: over.enabled ?? true,
    allowInEmptyState: over.allowInEmptyState ?? true,
    allowInResponse: over.allowInResponse ?? true,
    tags: (over.tags ?? ["always"]) as ContextTag[],
    excludeTags: (over.excludeTags ?? []) as ContextTag[],
    priority: over.priority ?? 5,
  };
}

function configWith(
  library: ChatPill[],
  overrides: Partial<ChatPillsConfig["inResponse"]> = {}
): ChatPillsConfig {
  return {
    version: 1,
    emptyState: {
      mode: "fixed",
      fixedIds: ["a", "b", "c", "d"],
      defaultFallbackIds: ["a", "b", "c", "d"],
    },
    inResponse: {
      enabled: true,
      maxPerResponse: 3,
      shadowMode: false,
      ...overrides,
    },
    library,
  };
}

// ── Tests ────────────────────────────────────────────────────────

console.log("\nchipResolver contract tests\n");

test("matches a single pill by one overlapping tag", () => {
  const config = configWith([
    pill({ id: "a", label: "A", message: "ma", tags: ["response:readiness"] }),
    pill({ id: "b", label: "B", message: "mb", tags: ["response:schedule"] }),
  ]);
  const out = resolveChipsForContext({
    contextTags: ["response:readiness"],
    config,
  });
  assertEqual(out.resolvedPillIds, ["a"], "pill ids");
  assertEqual(out.chips, [{ label: "A", action: "ma" }], "chips");
});

test("zero matches returns an empty array (no silent fallback)", () => {
  const config = configWith([
    pill({ id: "a", tags: ["response:readiness"] }),
    pill({ id: "b", tags: ["response:schedule"] }),
  ]);
  const out = resolveChipsForContext({
    contextTags: ["response:benchmark"],
    config,
  });
  assertEqual(out.resolvedPillIds, [], "pill ids");
  assertEqual(out.chips, [], "chips");
});

test("disabled pills are never returned", () => {
  const config = configWith([
    pill({
      id: "a",
      tags: ["response:readiness"],
      enabled: false,
    }),
    pill({ id: "b", tags: ["response:readiness"] }),
  ]);
  const out = resolveChipsForContext({
    contextTags: ["response:readiness"],
    config,
  });
  assertEqual(out.resolvedPillIds, ["b"], "pill ids");
});

test("allowInResponse=false pills are never returned", () => {
  const config = configWith([
    pill({
      id: "a",
      tags: ["response:readiness"],
      allowInResponse: false,
    }),
    pill({ id: "b", tags: ["response:readiness"] }),
  ]);
  const out = resolveChipsForContext({
    contextTags: ["response:readiness"],
    config,
  });
  assertEqual(out.resolvedPillIds, ["b"], "pill ids");
});

test("excludeTags override: matching pill is skipped when excludeTags overlap context", () => {
  const config = configWith([
    pill({
      id: "a",
      tags: ["schedule_gap"],
      excludeTags: ["rest_day", "injury"],
    }),
    pill({ id: "b", tags: ["schedule_gap"] }),
  ]);
  const out = resolveChipsForContext({
    contextTags: ["schedule_gap", "rest_day"],
    config,
  });
  assertEqual(out.resolvedPillIds, ["b"], "only non-excluded pill wins");
});

test("priority DESC is the sort order; library index is the tiebreaker", () => {
  const config = configWith([
    pill({ id: "low", tags: ["response:readiness"], priority: 2 }),
    pill({ id: "high", tags: ["response:readiness"], priority: 9 }),
    pill({ id: "mid1", tags: ["response:readiness"], priority: 5 }),
    pill({ id: "mid2", tags: ["response:readiness"], priority: 5 }),
  ]);
  const out = resolveChipsForContext({
    contextTags: ["response:readiness"],
    config,
  });
  assertEqual(out.resolvedPillIds, ["high", "mid1", "mid2"], "priority order");
});

test("maxPerResponse caps the result (default config is 3)", () => {
  const config = configWith(
    Array.from({ length: 5 }, (_, i) =>
      pill({ id: `p${i}`, tags: ["response:schedule"], priority: 9 - i })
    ),
    { maxPerResponse: 3 }
  );
  const out = resolveChipsForContext({
    contextTags: ["response:schedule"],
    config,
  });
  assertEqual(out.resolvedPillIds, ["p0", "p1", "p2"], "top 3 by priority");
});

test("maxPerResponse clamps to 1..3", () => {
  const config = configWith(
    [
      pill({ id: "a", tags: ["always"], priority: 5 }),
      pill({ id: "b", tags: ["always"], priority: 4 }),
    ],
    { maxPerResponse: 999 as unknown as number }
  );
  const out = resolveChipsForContext({ contextTags: ["always"], config });
  if (out.resolvedPillIds.length > 3) {
    throw new Error(
      `expected <= 3 results, got ${out.resolvedPillIds.length}`
    );
  }
});

test("'always' pill is used only when nothing else matched", () => {
  const config = configWith([
    pill({ id: "always_a", tags: ["always"], priority: 9 }),
    pill({ id: "exact", tags: ["response:readiness"], priority: 2 }),
  ]);
  // Context overlaps the exact pill — the "always" pill must not preempt it
  // despite higher priority, because "always" is fallback-only.
  const out = resolveChipsForContext({
    contextTags: ["response:readiness"],
    config,
  });
  assertEqual(
    out.resolvedPillIds,
    ["exact", "always_a"],
    "exact first, always fills remaining slot"
  );
});

test("'always' pills are fillers after normal matches", () => {
  const config = configWith([
    pill({ id: "n1", tags: ["response:schedule"], priority: 8 }),
    pill({ id: "always_a", tags: ["always"], priority: 9 }),
    pill({ id: "always_b", tags: ["always"], priority: 6 }),
  ]);
  const out = resolveChipsForContext({
    contextTags: ["response:schedule"],
    config,
  });
  assertEqual(
    out.resolvedPillIds,
    ["n1", "always_a", "always_b"],
    "normal match first, then always fillers"
  );
});

test("pure-always context resolves only always-tagged pills", () => {
  const config = configWith([
    pill({ id: "a", tags: ["response:readiness"], priority: 9 }),
    pill({ id: "b", tags: ["always"], priority: 2 }),
  ]);
  const out = resolveChipsForContext({ contextTags: ["always"], config });
  assertEqual(out.resolvedPillIds, ["b"], "only always pill");
});

test("pills matching both by normal tag and always are counted as normal (not duplicated)", () => {
  const config = configWith([
    pill({
      id: "a",
      tags: ["response:benchmark", "always"],
      priority: 5,
    }),
    pill({ id: "b", tags: ["response:benchmark"], priority: 4 }),
  ]);
  const out = resolveChipsForContext({
    contextTags: ["response:benchmark"],
    config,
  });
  assertEqual(out.resolvedPillIds, ["a", "b"], "a wins via exact match, not always");
});

test("shadowDiff reports pills added vs hardcoded chips", () => {
  const config = configWith([
    pill({
      id: "readiness_check",
      label: "My readiness",
      message: "whats my readiness",
      tags: ["response:readiness"],
      priority: 9,
    }),
  ]);
  const out = resolveChipsForContext({
    contextTags: ["response:readiness"],
    config,
    existingChips: [{ label: "Check in", action: "check in" }],
  });
  if (!out.shadowDiff) throw new Error("shadowDiff missing");
  assertEqual(out.shadowDiff.addedPillIds, ["readiness_check"], "added");
  assertEqual(out.shadowDiff.removedLabels, ["Check in"], "removed");
  assertEqual(out.shadowDiff.unchanged, false, "unchanged");
});

test("shadowDiff.unchanged=true when resolver output matches hardcoded chips", () => {
  const config = configWith([
    pill({
      id: "x",
      label: "My streak",
      message: "my streak",
      tags: ["streak_milestone"],
      priority: 5,
    }),
  ]);
  const out = resolveChipsForContext({
    contextTags: ["streak_milestone"],
    config,
    existingChips: [{ label: "My streak", action: "my streak" }],
  });
  if (!out.shadowDiff) throw new Error("shadowDiff missing");
  assertEqual(out.shadowDiff.unchanged, true, "unchanged");
});

test("empty contextTags returns only 'always' pills (when present)", () => {
  const config = configWith([
    pill({ id: "a", tags: ["response:readiness"] }),
    pill({ id: "b", tags: ["always"] }),
  ]);
  const out = resolveChipsForContext({ contextTags: [], config });
  assertEqual(out.resolvedPillIds, ["b"], "only always pill");
});

test("empty library → empty result", () => {
  const config = configWith([]);
  const out = resolveChipsForContext({
    contextTags: ["response:readiness"],
    config,
  });
  assertEqual(out.resolvedPillIds, [], "empty");
});

test("pill with multiple tags matches on any one of them", () => {
  const config = configWith([
    pill({
      id: "a",
      tags: ["response:schedule", "has_clash", "empty_week"],
    }),
  ]);
  const out = resolveChipsForContext({
    contextTags: ["empty_week"],
    config,
  });
  assertEqual(out.resolvedPillIds, ["a"], "matched via empty_week");
});

test("excludeTags takes precedence over matching tag overlap", () => {
  const config = configWith([
    pill({
      id: "a",
      tags: ["response:readiness"],
      excludeTags: ["injury"],
    }),
  ]);
  const out = resolveChipsForContext({
    contextTags: ["response:readiness", "injury"],
    config,
  });
  assertEqual(out.resolvedPillIds, [], "excluded");
});

test("resolver is deterministic: same input → same output", () => {
  const config = configWith([
    pill({ id: "a", tags: ["always"], priority: 5 }),
    pill({ id: "b", tags: ["always"], priority: 5 }),
    pill({ id: "c", tags: ["always"], priority: 5 }),
  ]);
  const a = resolveChipsForContext({ contextTags: ["always"], config });
  const b = resolveChipsForContext({ contextTags: ["always"], config });
  assertEqual(a.resolvedPillIds, b.resolvedPillIds, "ids match");
  assertEqual(a.resolvedPillIds, ["a", "b", "c"], "library-order tiebreak");
});

// ── Report ──────────────────────────────────────────────────────

console.log(`\n  ${passed} passed, ${failed} failed\n`);
if (failed > 0) {
  console.log("  Failures:");
  failures.forEach((f) => console.log(`    - ${f}`));
  process.exit(1);
}
