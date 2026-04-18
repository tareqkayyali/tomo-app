/**
 * moderate() — pure severity-decision tests.
 *
 * We test the deterministic layer (decideSeverity) without hitting
 * OpenAI. End-to-end tests against the real classifier live in the
 * integration suite.
 *
 * Run: `npx tsx backend/services/moderation/__tests__/moderate.test.ts`
 */

import { decideSeverity, moderate, type ClassifierResponse } from "../moderate";

let passed = 0, failed = 0;
const failures: string[] = [];

function test(name: string, fn: () => void | Promise<void>): void {
  const res = fn();
  const finalize = (err?: unknown) => {
    if (err) {
      failed++;
      failures.push(`${name} — ${err instanceof Error ? err.message : String(err)}`);
    } else passed++;
  };
  if (res && typeof (res as Promise<void>).then === "function") {
    (res as Promise<void>).then(() => finalize(), finalize);
  } else {
    try {
      finalize();
    } catch (e) {
      finalize(e);
    }
  }
}

function eq<T>(actual: T, expected: T, ctx?: string): void {
  if (actual !== expected) {
    throw new Error(`${ctx ? ctx + ": " : ""}expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

// ── decideSeverity: sexual_minors always critical ──────────────────
test("sexual_minors flag → critical + autoHide regardless of recipient", () => {
  const r = decideSeverity(
    { flags: ["sexual_minors"], scores: { "sexual/minors": 0.2 } },
    { recipientIsMinor: false }
  );
  eq(r.severity, "critical");
  eq(r.autoHide, true);
});

// ── decideSeverity: self_harm to minor → critical ─────────────────
test("self_harm flag with minor recipient → critical", () => {
  const r = decideSeverity(
    { flags: ["self_harm"], scores: { "self-harm": 0.35 } },
    { recipientIsMinor: true }
  );
  eq(r.severity, "critical");
  eq(r.autoHide, true);
});

test("self_harm flag with adult recipient → scored not auto-critical", () => {
  const r = decideSeverity(
    { flags: ["self_harm"], scores: { "self-harm": 0.35 } },
    { recipientIsMinor: false }
  );
  // Adult threshold is higher; 0.35 should not auto-hide.
  if (r.severity === "critical") throw new Error("should not auto-critical for adult");
});

// ── Score thresholds for minors (stricter) ────────────────────────
test("score 0.85 with minor recipient → critical", () => {
  const r = decideSeverity(
    { flags: ["harassment"], scores: { harassment: 0.85 } },
    { recipientIsMinor: true }
  );
  eq(r.severity, "critical");
  eq(r.autoHide, true);
});

test("score 0.55 with minor recipient → high + autoHide", () => {
  const r = decideSeverity(
    { flags: ["harassment"], scores: { harassment: 0.55 } },
    { recipientIsMinor: true }
  );
  eq(r.severity, "high");
  eq(r.autoHide, true);
});

test("score 0.30 with minor recipient → med (no auto-hide)", () => {
  const r = decideSeverity(
    { flags: ["harassment"], scores: { harassment: 0.30 } },
    { recipientIsMinor: true }
  );
  eq(r.severity, "med");
  eq(r.autoHide, false);
});

test("score 0.06 with minor recipient → low (cleared)", () => {
  const r = decideSeverity(
    { flags: ["harassment"], scores: { harassment: 0.06 } },
    { recipientIsMinor: true }
  );
  eq(r.severity, "low");
});

// ── Score thresholds for adults (looser) ──────────────────────────
test("score 0.75 with adult recipient → high (not critical)", () => {
  const r = decideSeverity(
    { flags: ["harassment"], scores: { harassment: 0.75 } },
    { recipientIsMinor: false }
  );
  eq(r.severity, "high");
  eq(r.autoHide, true);
});

test("score 0.45 with adult recipient → med (no auto-hide)", () => {
  const r = decideSeverity(
    { flags: ["harassment"], scores: { harassment: 0.45 } },
    { recipientIsMinor: false }
  );
  eq(r.severity, "med");
  eq(r.autoHide, false);
});

test("score 0.05 with adult recipient → low", () => {
  const r = decideSeverity(
    { flags: [], scores: { harassment: 0.05 } },
    { recipientIsMinor: false }
  );
  eq(r.severity, "low");
});

// ── moderate() with injected classifier ───────────────────────────
test("empty body short-circuits to low/cleared", async () => {
  const calls = { n: 0 };
  const classifier = async (): Promise<ClassifierResponse> => {
    calls.n++;
    return { flags: [], scores: {} };
  };
  const r = await moderate(
    { body: "   ", targetType: "coach_note", authorId: "a" },
    { classifier }
  );
  eq(r.severity, "low");
  eq(r.moderationState, "cleared");
  eq(calls.n, 0);
});

test("moderationState maps from severity + autoHide", async () => {
  const classifier = async (): Promise<ClassifierResponse> => ({
    flags: ["harassment"],
    scores: { harassment: 0.92 },
  });
  const r = await moderate(
    { body: "something nasty", targetType: "coach_note", authorId: "a", recipientIsMinor: false },
    { classifier }
  );
  eq(r.severity, "critical");
  eq(r.autoHide, true);
  eq(r.moderationState, "hidden");
});

test("medium severity → pending (for human review)", async () => {
  const classifier = async (): Promise<ClassifierResponse> => ({
    flags: ["harassment"],
    scores: { harassment: 0.50 },
  });
  const r = await moderate(
    { body: "ambiguous", targetType: "coach_note", authorId: "a", recipientIsMinor: false },
    { classifier }
  );
  eq(r.severity, "med");
  eq(r.moderationState, "pending");
});

// ── Wait for async tests ──────────────────────────────────────────
setTimeout(() => {
  console.log(`\nmoderate: ${passed} passed, ${failed} failed`);
  if (failures.length) {
    console.log("\nFailures:");
    for (const f of failures) console.log("  " + f);
    process.exit(1);
  }
}, 200);
