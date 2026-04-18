/**
 * parentProgress — pure function tests.
 *
 * Run: `npx tsx backend/services/triangle/__tests__/parentProgress.test.ts`
 */

import {
  parentLoadLabel,
  nextExamFrom,
  buildWeeklyDigest,
} from "../parentProgress";

let passed = 0, failed = 0;
const failures: string[] = [];
function test(name: string, fn: () => void): void {
  try { fn(); passed++; } catch (e) {
    failed++;
    failures.push(`${name} — ${e instanceof Error ? e.message : String(e)}`);
  }
}
function eq<T>(a: T, b: T, ctx?: string): void {
  const as = JSON.stringify(a); const bs = JSON.stringify(b);
  if (as !== bs) throw new Error(`${ctx ? ctx + ": " : ""}expected ${bs}, got ${as}`);
}

// ── parentLoadLabel ──────────────────────────────────────────────────

test("null zone → Insufficient data", () => {
  const r = parentLoadLabel(null, null);
  eq(r.label, "Insufficient data");
  eq(r.color, "amber");
});

test("green zone → Balanced", () => {
  const r = parentLoadLabel("green", 35);
  eq(r.label, "Balanced");
  eq(r.color, "green");
});

test("amber zone → Building", () => {
  const r = parentLoadLabel("amber", 60);
  eq(r.label, "Building");
  eq(r.color, "amber");
});

test("red zone → Stressed", () => {
  const r = parentLoadLabel("red", 78);
  eq(r.label, "Stressed");
  eq(r.color, "red");
});

test("critical zone → Alarming", () => {
  const r = parentLoadLabel("critical", 92);
  eq(r.label, "Alarming");
  eq(r.color, "red");
});

test("label text NEVER contains clinical jargon", () => {
  const banned = ["ACWR", "PHV", "HRV", "acute:chronic"];
  for (const zone of ["green", "amber", "red", "critical"] as const) {
    const r = parentLoadLabel(zone, 50);
    for (const b of banned) {
      if (r.label.includes(b) || r.hint.includes(b)) {
        throw new Error(`zone ${zone} leaked clinical term '${b}'`);
      }
    }
  }
});

// ── nextExamFrom ─────────────────────────────────────────────────────

const NOW = new Date("2026-04-18T12:00:00Z");

test("empty list → null", () => eq(nextExamFrom([], NOW), null));

test("picks nearest upcoming exam", () => {
  const r = nextExamFrom(
    [
      { subject: "Math", exam_date: "2026-05-01T09:00:00Z" },
      { subject: "Biology", exam_date: "2026-04-20T09:00:00Z" },
      { subject: "History", exam_date: "2026-06-15T09:00:00Z" },
    ],
    NOW
  );
  eq(r?.subject, "Biology");
  eq(r?.daysUntil, 2);
});

test("ignores past exams", () => {
  const r = nextExamFrom(
    [
      { subject: "Math", exam_date: "2026-03-01T09:00:00Z" },
      { subject: "Biology", exam_date: "2026-04-25T09:00:00Z" },
    ],
    NOW
  );
  eq(r?.subject, "Biology");
});

test("exam today (within half-day window) counts", () => {
  const r = nextExamFrom(
    [{ subject: "Math", exam_date: "2026-04-18T18:00:00Z" }],
    NOW
  );
  eq(r?.subject, "Math");
});

test("all past → null", () => {
  const r = nextExamFrom(
    [{ subject: "Math", exam_date: "2020-01-01T09:00:00Z" }],
    NOW
  );
  eq(r, null);
});

test("unparseable date ignored gracefully", () => {
  const r = nextExamFrom(
    [
      { subject: "X", exam_date: "not-a-date" },
      { subject: "Y", exam_date: "2026-05-01T09:00:00Z" },
    ],
    NOW
  );
  eq(r?.subject, "Y");
});

// ── buildWeeklyDigest ────────────────────────────────────────────────

test("empty input → empty bullets", () => {
  eq(buildWeeklyDigest({}).length, 0);
});

test("streak 1 → singular text", () => {
  const b = buildWeeklyDigest({ streak: 1 });
  eq(b.length, 1);
  eq(b[0].icon, "streak");
  if (!b[0].text.includes("1-day")) throw new Error("expected singular form");
});

test("streak >1 → plural text", () => {
  const b = buildWeeklyDigest({ streak: 5 });
  eq(b.length, 1);
  if (!b[0].text.includes("5-day")) throw new Error("expected '5-day'");
});

test("wellness trend mapped to parent-readable sentence", () => {
  const improving = buildWeeklyDigest({
    weeklyDigestRow: { wellness_trend: "IMPROVING" },
  });
  eq(improving[0].text.includes("trending up"), true);

  const declining = buildWeeklyDigest({
    weeklyDigestRow: { wellness_trend: "DECLINING" },
  });
  eq(declining[0].text.includes("trending down"), true);
});

test("upcoming exam within 14 days appears", () => {
  const b = buildWeeklyDigest({
    exam: { subject: "Biology", daysUntil: 4 },
  });
  eq(b.length, 1);
  if (!b[0].text.includes("Biology")) throw new Error("exam subject missing");
  if (!b[0].text.includes("4 days")) throw new Error("days count missing");
});

test("exam >14 days away suppressed", () => {
  const b = buildWeeklyDigest({
    exam: { subject: "Math", daysUntil: 30 },
  });
  eq(b.length, 0);
});

test("exam today handled singular", () => {
  const b = buildWeeklyDigest({ exam: { subject: "History", daysUntil: 0 } });
  if (!b[0].text.includes("today")) throw new Error("expected 'today' wording");
});

test("digest caps at 5 bullets", () => {
  const b = buildWeeklyDigest({
    streak: 7,
    weeklyDigestRow: {
      training_sessions: 4,
      training_minutes: 240,
      study_sessions: 6,
      study_minutes_total: 420,
      wellness_trend: "IMPROVING",
    },
    exam: { subject: "Math", daysUntil: 3 },
  });
  if (b.length > 5) throw new Error("exceeded 5-bullet cap");
});

test("no clinical jargon in digest output", () => {
  const b = buildWeeklyDigest({
    streak: 3,
    weeklyDigestRow: {
      training_sessions: 2,
      wellness_trend: "DECLINING",
    },
    exam: { subject: "Chemistry", daysUntil: 2 },
  });
  const banned = ["ACWR", "PHV", "HRV", "acute:chronic"];
  for (const bullet of b) {
    for (const term of banned) {
      if (bullet.text.includes(term)) throw new Error(`leak: ${term}`);
    }
  }
});

// ── Report ──────────────────────────────────────────────────────────
console.log(`\nparentProgress: ${passed} passed, ${failed} failed`);
if (failures.length) {
  console.log("\nFailures:");
  for (const f of failures) console.log("  " + f);
  process.exit(1);
}
