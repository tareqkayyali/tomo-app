/**
 * Age-tier pure function tests.
 *
 * Covers:
 *   - tier boundaries (12/13/15/16 inflection points)
 *   - leap-year birthday edge cases
 *   - null DOB → UNKNOWN
 *   - future DOB guard (delegated to parseDobOrThrow; here we assume
 *     callers have already parsed)
 *   - effectiveTier fallback (UNKNOWN → T2, per Apple 5.1.4)
 *   - parent-authority + parent-supersedes rules
 *
 * Run: `npx tsx backend/services/compliance/__tests__/ageTier.test.ts`
 */

import {
  ageTierFromAge,
  ageTierFromDob,
  effectiveTier,
  requiresParentalAuthority,
  parentSupersedesCoach,
} from "../ageTier";

let failed = 0, passed = 0;
const failures: string[] = [];

function test(name: string, fn: () => void): void {
  try {
    fn();
    passed++;
  } catch (err) {
    failed++;
    const msg = err instanceof Error ? err.message : String(err);
    failures.push(`${name} — ${msg}`);
  }
}

function eq<T>(actual: T, expected: T, ctx?: string): void {
  if (actual !== expected) {
    throw new Error(
      `${ctx ? ctx + ": " : ""}expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
    );
  }
}

// ── Boundary cases — ageTierFromAge ───────────────────────────────
test("age 0 → T1", () => eq(ageTierFromAge(0), "T1"));
test("age 12 → T1 (COPPA upper bound)", () => eq(ageTierFromAge(12), "T1"));
test("age 13 → T2 (COPPA/GDPR-K boundary)", () => eq(ageTierFromAge(13), "T2"));
test("age 14 → T2", () => eq(ageTierFromAge(14), "T2"));
test("age 15 → T2 (GDPR-K 16 EU-wide upper bound)", () => eq(ageTierFromAge(15), "T2"));
test("age 16 → T3 (GDPR-K boundary)", () => eq(ageTierFromAge(16), "T3"));
test("age 17 → T3", () => eq(ageTierFromAge(17), "T3"));
test("age 25 → T3", () => eq(ageTierFromAge(25), "T3"));
test("age 100 → T3", () => eq(ageTierFromAge(100), "T3"));

// ── Null / invalid ──────────────────────────────────────────────────
test("null age → UNKNOWN", () => eq(ageTierFromAge(null), "UNKNOWN"));
test("NaN age → UNKNOWN", () => eq(ageTierFromAge(NaN), "UNKNOWN"));
test("negative age → UNKNOWN", () => eq(ageTierFromAge(-1), "UNKNOWN"));

// ── DOB-based (via ageTierFromDob) ──────────────────────────────────
// Fix 'now' to 2026-04-18 for deterministic birthday arithmetic.
const NOW = new Date(Date.UTC(2026, 3, 18));

test("DOB null → UNKNOWN", () => eq(ageTierFromDob(null, NOW), "UNKNOWN"));

test("DOB 2020-01-01 (6 years) → T1", () =>
  eq(ageTierFromDob(new Date(Date.UTC(2020, 0, 1)), NOW), "T1"));

test("DOB exactly 13 years ago (2013-04-18) → T2", () =>
  eq(ageTierFromDob(new Date(Date.UTC(2013, 3, 18)), NOW), "T2"));

test("DOB 13 years ago + 1 day (not yet 13) → T1", () =>
  eq(ageTierFromDob(new Date(Date.UTC(2013, 3, 19)), NOW), "T1"));

test("DOB 13 years ago - 1 day (just turned 13) → T2", () =>
  eq(ageTierFromDob(new Date(Date.UTC(2013, 3, 17)), NOW), "T2"));

test("DOB 16 years ago (2010-04-18) → T3", () =>
  eq(ageTierFromDob(new Date(Date.UTC(2010, 3, 18)), NOW), "T3"));

test("DOB 16 years ago + 1 day (not yet 16) → T2", () =>
  eq(ageTierFromDob(new Date(Date.UTC(2010, 3, 19)), NOW), "T2"));

// Leap-year DOB: Feb 29, 2008 evaluated on non-leap 2026. Person is 18.
test("leap-year DOB Feb 29 2008 on Apr 18 2026 (age 18) → T3", () =>
  eq(ageTierFromDob(new Date(Date.UTC(2008, 1, 29)), NOW), "T3"));

// Leap-year boundary: Feb 29 2013 evaluated on Feb 28 2026 (hasn't hit
// the non-leap proxy). Person is still 12 → T1.
test("leap-year DOB Feb 29 2013 on Feb 28 2026 (still 12) → T1", () =>
  eq(
    ageTierFromDob(new Date(Date.UTC(2013, 1, 29)), new Date(Date.UTC(2026, 1, 28))),
    "T1"
  ));

test("leap-year DOB Feb 29 2013 on Mar 1 2026 (just 13) → T2", () =>
  eq(
    ageTierFromDob(new Date(Date.UTC(2013, 1, 29)), new Date(Date.UTC(2026, 2, 1))),
    "T2"
  ));

// ── effectiveTier fallback (Apple 5.1.4) ────────────────────────────
test("effectiveTier(UNKNOWN) → T2 (conservative default)", () =>
  eq(effectiveTier("UNKNOWN"), "T2"));
test("effectiveTier(T1) → T1", () => eq(effectiveTier("T1"), "T1"));
test("effectiveTier(T2) → T2", () => eq(effectiveTier("T2"), "T2"));
test("effectiveTier(T3) → T3", () => eq(effectiveTier("T3"), "T3"));

// ── Authority rules ─────────────────────────────────────────────────
test("requiresParentalAuthority(T1) = true", () =>
  eq(requiresParentalAuthority("T1"), true));
test("requiresParentalAuthority(T2) = true", () =>
  eq(requiresParentalAuthority("T2"), true));
test("requiresParentalAuthority(T3) = false", () =>
  eq(requiresParentalAuthority("T3"), false));
test("requiresParentalAuthority(UNKNOWN) = true (conservative)", () =>
  eq(requiresParentalAuthority("UNKNOWN"), true));

test("parentSupersedesCoach(T1) = true", () =>
  eq(parentSupersedesCoach("T1"), true));
test("parentSupersedesCoach(T2) = true", () =>
  eq(parentSupersedesCoach("T2"), true));
test("parentSupersedesCoach(T3) = false", () =>
  eq(parentSupersedesCoach("T3"), false));
test("parentSupersedesCoach(UNKNOWN) = true (conservative)", () =>
  eq(parentSupersedesCoach("UNKNOWN"), true));

// ── Property-style check: every integer age 0..100 has a valid tier ─
test("every age 0..100 returns a non-UNKNOWN tier", () => {
  for (let age = 0; age <= 100; age++) {
    const t = ageTierFromAge(age);
    if (t === "UNKNOWN") throw new Error(`age ${age} returned UNKNOWN`);
    if (!["T1", "T2", "T3"].includes(t)) throw new Error(`age ${age} returned ${t}`);
  }
});

// ── Report ──────────────────────────────────────────────────────────
console.log(`\nageTier: ${passed} passed, ${failed} failed`);
if (failures.length) {
  console.log("\nFailures:");
  for (const f of failures) console.log("  " + f);
  process.exit(1);
}
