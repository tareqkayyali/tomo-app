/**
 * Priority Resolver — pure function tests.
 *
 * `resolveCategoryPriority` needs the DB (reads scheduling_rules +
 * athlete_modes) so we test it end-to-end elsewhere. This file covers
 * the deterministic helpers: rank lookup, outranks comparison, and the
 * scenario detection logic.
 */

import { detectScenario, rankOf, outranks } from "../priorityResolver";
import type { ResolvedPriority } from "../priorityResolver";

let failed = 0, passed = 0;
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

function expect(actual: unknown) {
  return {
    toBe(exp: unknown) {
      if (actual !== exp) throw new Error(`expected ${JSON.stringify(exp)}, got ${JSON.stringify(actual)}`);
    },
  };
}

console.log("\nPriority Resolver (pure helpers)");
console.log("─".repeat(60));

test("detectScenario: normal when no flags", () => {
  expect(detectScenario({})).toBe("normal");
});
test("detectScenario: leagueActive when only league", () => {
  expect(detectScenario({ league_is_active: true })).toBe("leagueActive");
});
test("detectScenario: examPeriod when only exam", () => {
  expect(detectScenario({ exam_period_active: true })).toBe("examPeriod");
});
test("detectScenario: leagueExam when both", () => {
  expect(detectScenario({ league_is_active: true, exam_period_active: true }))
    .toBe("leagueExam");
});

const sample: ResolvedPriority = {
  scenario: "normal",
  modeId: "balanced",
  order: ["match", "club", "gym", "study", "recovery"],
  source: "cms",
};

test("rankOf: known category returns its index", () => {
  expect(rankOf(sample, "match")).toBe(0);
  expect(rankOf(sample, "club")).toBe(1);
  expect(rankOf(sample, "recovery")).toBe(4);
});
test("rankOf: unknown category returns MAX", () => {
  expect(rankOf(sample, "bogus")).toBe(Number.MAX_SAFE_INTEGER);
});

test("outranks: higher category beats lower", () => {
  expect(outranks(sample, "match", "recovery")).toBe(true);
  expect(outranks(sample, "club", "study")).toBe(true);
});
test("outranks: lower category never beats higher", () => {
  expect(outranks(sample, "recovery", "match")).toBe(false);
  expect(outranks(sample, "study", "club")).toBe(false);
});
test("outranks: same category ties (non-strict loss)", () => {
  expect(outranks(sample, "club", "club")).toBe(false);
});

console.log("─".repeat(60));
console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) {
  for (const f of failures) console.log(`  • ${f}`);
  process.exit(1);
}
process.exit(0);
