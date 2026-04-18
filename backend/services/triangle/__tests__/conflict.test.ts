/**
 * conflict.ts — pure function tests.
 *
 * Covers the three detection rules + polarity classifier edge cases.
 * Keyword heuristic is conservative: we assert what MUST fire (explicit
 * push/rest opposition) and what MUST NOT (safe-redirect phrases,
 * single-role annotations, partial-word substrings).
 *
 * Run: `npx tsx backend/services/triangle/__tests__/conflict.test.ts`
 */

import {
  classifyPolarity,
  detectConflict,
  type AnnotationForConflict,
} from "../conflict";

let passed = 0, failed = 0;
const failures: string[] = [];

function test(name: string, fn: () => void): void {
  try { fn(); passed++; } catch (e) {
    failed++;
    failures.push(`${name} — ${e instanceof Error ? e.message : String(e)}`);
  }
}
function eq<T>(a: T, b: T, ctx?: string): void {
  if (a !== b) throw new Error(`${ctx ? ctx + ": " : ""}expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

function ann(overrides: Partial<AnnotationForConflict> = {}): AnnotationForConflict {
  return {
    id: "a1",
    author_id: "u1",
    author_role: "coach",
    domain: "training",
    body: "push hard this week",
    annotation_type: "context",
    created_at: "2026-04-18T09:00:00Z",
    ...overrides,
  };
}

// ── classifyPolarity ─────────────────────────────────────────────────

test("polarity push: 'push hard'", () => eq(classifyPolarity("push hard this week"), "push"));
test("polarity push: 'intensify'", () => eq(classifyPolarity("time to intensify the block"), "push"));
test("polarity push: 'let's hit it'", () => eq(classifyPolarity("Let's hit it on Thursday"), "push"));
test("polarity push: 'go hard'", () => eq(classifyPolarity("go hard on the sprints"), "push"));
test("polarity push: 'grind'", () => eq(classifyPolarity("need to grind through"), "push"));

test("polarity rest: 'recovery'", () => eq(classifyPolarity("take a recovery day"), "rest"));
test("polarity rest: 'back off'", () => eq(classifyPolarity("she needs to back off"), "rest"));
test("polarity rest: 'lighter'", () => eq(classifyPolarity("lighter session today"), "rest"));
test("polarity rest: 'skip'", () => eq(classifyPolarity("skip Thursday's session"), "rest"));
test("polarity rest: 'deload'", () => eq(classifyPolarity("deload this week"), "rest"));

test("polarity neutral: both push and rest present", () =>
  eq(classifyPolarity("push hard but also rest well"), "neutral"));
test("polarity neutral: empty string", () => eq(classifyPolarity(""), "neutral"));
test("polarity neutral: unrelated text", () =>
  eq(classifyPolarity("great week for the team"), "neutral"));

// ── Word-boundary defence against false positives ───────────────────

test("no false positive: 'pushover' does not match push", () =>
  eq(classifyPolarity("he's a pushover"), "neutral"));
test("no false positive: 'restaurant' does not match rest", () =>
  eq(classifyPolarity("went to a restaurant"), "neutral"));
test("no false positive: 'pushing' DOES match (explicit pattern)", () =>
  eq(classifyPolarity("she's pushing too hard"), "push"));

// ── detectConflict: rule 1 — conflict_flag short-circuit ────────────

test("conflict_flag always fires", () => {
  const r = detectConflict([
    ann({ annotation_type: "conflict_flag", body: "parent overrode" }),
  ]);
  eq(r.hasConflict, true);
  eq(r.axis, "explicit");
});

test("conflict_flag fires even with single author_role", () => {
  // System-authored conflict flag from the approval resolver counts
  // regardless of how many human authors are on the event.
  const r = detectConflict([
    ann({ author_role: "system", annotation_type: "conflict_flag" }),
  ]);
  eq(r.hasConflict, true);
});

// ── detectConflict: rule 2 — opposing polarity ──────────────────────

test("coach push vs parent rest → conflict (axis=load)", () => {
  const r = detectConflict([
    ann({ id: "c", author_role: "coach", author_id: "coach1", body: "push hard Thursday", domain: "training" }),
    ann({ id: "p", author_role: "parent", author_id: "parent1", body: "she needs rest — exam Friday", domain: "training" }),
  ]);
  eq(r.hasConflict, true);
  eq(r.axis, "load");
  eq(r.roles.sort().join(","), "coach,parent");
});

test("coach push (training) vs parent rest (academic) → conflict (axis=intent)", () => {
  const r = detectConflict([
    ann({ id: "c", author_role: "coach", author_id: "c1", body: "push this session", domain: "training" }),
    ann({ id: "p", author_role: "parent", author_id: "p1", body: "skip — exam week", domain: "academic" }),
  ]);
  eq(r.hasConflict, true);
  eq(r.axis, "intent");
});

test("both push → no conflict", () => {
  const r = detectConflict([
    ann({ author_role: "coach", author_id: "c1", body: "push hard" }),
    ann({ author_role: "parent", author_id: "p1", body: "yes go hard" }),
  ]);
  eq(r.hasConflict, false);
});

test("both rest → no conflict", () => {
  const r = detectConflict([
    ann({ author_role: "coach", author_id: "c1", body: "take it easy" }),
    ann({ author_role: "parent", author_id: "p1", body: "yes rest today" }),
  ]);
  eq(r.hasConflict, false);
});

test("coach-only annotations → no conflict even with opposing self", () => {
  const r = detectConflict([
    ann({ author_role: "coach", author_id: "c1", body: "push hard" }),
    ann({ author_role: "coach", author_id: "c1", body: "actually rest" }),
  ]);
  eq(r.hasConflict, false);
});

test("athlete + coach → no conflict (athletes don't count)", () => {
  const r = detectConflict([
    ann({ author_role: "coach", author_id: "c1", body: "push hard" }),
    ann({ author_role: "athlete", author_id: "a1", body: "need to rest" }),
  ]);
  eq(r.hasConflict, false);
});

test("empty annotations → no conflict", () => eq(detectConflict([]).hasConflict, false));

test("retracted (filtered by caller) / empty body → no conflict", () => {
  const r = detectConflict([
    ann({ author_role: "coach", author_id: "c1", body: "" }),
    ann({ author_role: "parent", author_id: "p1", body: "   " }),
  ]);
  eq(r.hasConflict, false);
});

// ── detectConflict: rule 3 — timing ─────────────────────────────────

test("coach + parent both reschedule → axis=timing", () => {
  const r = detectConflict([
    ann({ author_role: "coach", author_id: "c1", body: "reschedule to tomorrow", domain: "logistics" }),
    ann({ author_role: "parent", author_id: "p1", body: "can't make Thursday — after exam", domain: "logistics" }),
  ]);
  eq(r.hasConflict, true);
  eq(r.axis, "timing");
});

test("only one side mentions timing → no conflict", () => {
  const r = detectConflict([
    ann({ author_role: "coach", author_id: "c1", body: "reschedule to tomorrow" }),
    ann({ author_role: "parent", author_id: "p1", body: "sounds good" }),
  ]);
  eq(r.hasConflict, false);
});

// ── detectConflict: polarity neutral → no conflict ───────────────────

test("mixed message from coach, clear push from parent → no conflict", () => {
  // coach body has both signals → polarity=neutral → pair skipped
  const r = detectConflict([
    ann({ author_role: "coach", author_id: "c1", body: "push hard but rest well after" }),
    ann({ author_role: "parent", author_id: "p1", body: "skip Thursday please" }),
  ]);
  eq(r.hasConflict, false);
});

// ── Result shape ─────────────────────────────────────────────────────

test("authors list contains both unique ids", () => {
  const r = detectConflict([
    ann({ author_role: "coach", author_id: "coach1", body: "push" }),
    ann({ author_role: "parent", author_id: "parent1", body: "rest" }),
  ]);
  eq(r.authors.sort().join(","), "coach1,parent1");
});

test("domains list dedupes", () => {
  const r = detectConflict([
    ann({ author_role: "coach", author_id: "c1", body: "push", domain: "training" }),
    ann({ author_role: "parent", author_id: "p1", body: "rest", domain: "training" }),
  ]);
  eq(r.domains.length, 1);
  eq(r.domains[0], "training");
});

// ── Report ──────────────────────────────────────────────────────────
console.log(`\nconflict: ${passed} passed, ${failed} failed`);
if (failures.length) {
  console.log("\nFailures:");
  for (const f of failures) console.log("  " + f);
  process.exit(1);
}
