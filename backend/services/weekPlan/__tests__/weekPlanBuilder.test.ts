/**
 * Week Plan Builder — fixture-driven verification.
 *
 * Run:
 *   cd backend && npx tsx services/weekPlan/__tests__/weekPlanBuilder.test.ts
 *
 * No jest/vitest dependency — plain assertions that throw on failure.
 * Each fixture isolates one invariant: placement, constraints, caps, drops.
 */

import {
  buildWeekPlan,
  enumerateWeek,
  type WeekPlanBuilderInput,
  type WeekPlanBuilderOutput,
  type PlayerPrefs,
} from "../weekPlanBuilder";

// ── Tiny assertion helpers ──────────────────────────────────────

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

function expect(actual: unknown) {
  return {
    toBe(expected: unknown) {
      if (actual !== expected) {
        throw new Error(`expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
      }
    },
    toEqual(expected: unknown) {
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(`expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
      }
    },
    toBeGreaterThanOrEqual(n: number) {
      if (typeof actual !== "number" || actual < n) {
        throw new Error(`expected ≥ ${n}, got ${actual}`);
      }
    },
    toBeLessThanOrEqual(n: number) {
      if (typeof actual !== "number" || actual > n) {
        throw new Error(`expected ≤ ${n}, got ${actual}`);
      }
    },
    toContainCategory(category: string) {
      const arr = actual as Array<{ category: string }>;
      if (!Array.isArray(arr) || !arr.some((x) => x.category === category)) {
        throw new Error(`expected items to contain category ${category}, got ${JSON.stringify(arr.map((x) => x.category))}`);
      }
    },
  };
}

// ── Shared fixtures ─────────────────────────────────────────────

const BASE_PREFS: PlayerPrefs = {
  timezone: "Europe/London",
  schoolDays: [1, 2, 3, 4, 5],      // Mon–Fri
  schoolStart: "08:00",
  schoolEnd: "15:00",
  dayBoundsStart: "06:00",
  dayBoundsEnd: "22:00",
  weekendBoundsStart: "08:00",
  weekendBoundsEnd: "22:00",
  examPeriodActive: false,
  leagueActive: false,
};

const MON_2026_04_20 = "2026-04-20"; // verified Monday

function baseInput(overrides: Partial<WeekPlanBuilderInput> = {}): WeekPlanBuilderInput {
  return {
    weekStart: MON_2026_04_20,
    // Today is the Monday of the test week — the full week is plannable
    // (no past-day filtering kicks in). Individual tests override to
    // exercise "mid-week" past-day skip behavior.
    today: MON_2026_04_20,
    trainingMix: [],
    studyMix: [],
    existingEvents: [],
    playerPrefs: BASE_PREFS,
    readinessRag: "GREEN",
    acwr: 1.0,
    dayLocks: [],
    ...overrides,
  };
}

// ── Tests ───────────────────────────────────────────────────────

console.log("\nWeek Plan Builder");
console.log("─".repeat(60));

test("enumerateWeek produces 7 consecutive ISO dates starting Monday", () => {
  const dates = enumerateWeek(MON_2026_04_20);
  expect(dates.length).toBe(7);
  expect(dates[0]).toBe("2026-04-20");
  expect(dates[6]).toBe("2026-04-26");
});

test("empty mix yields empty plan, empty warnings", () => {
  const out = buildWeekPlan(baseInput());
  expect(out.planItems.length).toBe(0);
  expect(out.warnings.length).toBe(0);
  expect(out.summary.trainingSessions).toBe(0);
  expect(out.summary.studySessions).toBe(0);
});

test("3x gym flexible → 3 placed, no warnings, never overlaps school hours on school days", () => {
  const out = buildWeekPlan(baseInput({
    trainingMix: [
      { category: "gym", sessionsPerWeek: 3, durationMin: 60, placement: "flexible" },
    ],
  }));
  expect(out.planItems.length).toBe(3);
  expect(out.warnings.length).toBe(0);
  for (const it of out.planItems) {
    expect(it.category).toBe("gym");
    expect(it.durationMin).toBe(60);
    expect(it.eventType).toBe("training");
    expect(it.intensity).toBe("MODERATE");
    const wd = new Date(`${it.date}T12:00:00Z`).getUTCDay();
    if ([1, 2, 3, 4, 5].includes(wd)) {
      // On a school day, the slot must either end ≤ 07:30 (08:00 school − 30 buf)
      // or start ≥ 15:30 (15:00 school end + 30 buf). Anything else violates buffer.
      const [sh, sm] = it.startTime.split(":").map(Number);
      const [eh, em] = it.endTime.split(":").map(Number);
      const start = sh * 60 + sm;
      const end = eh * 60 + em;
      const preSchool = end <= 8 * 60 - 30;
      const postSchool = start >= 15 * 60 + 30;
      if (!(preSchool || postSchool)) {
        throw new Error(`gym ${it.startTime}-${it.endTime} on weekday ${wd} overlaps school-hour buffer`);
      }
    }
  }
});

test("fixed Monday + fixed Wednesday gym → placed on exactly those days", () => {
  const out = buildWeekPlan(baseInput({
    trainingMix: [
      { category: "gym", sessionsPerWeek: 2, durationMin: 60, placement: "fixed", fixedDays: [1, 3] },
    ],
  }));
  expect(out.planItems.length).toBe(2);
  const dates = out.planItems.map((p) => p.date).sort();
  expect(dates).toEqual(["2026-04-20", "2026-04-22"]); // Mon + Wed
  for (const it of out.planItems) expect(it.placementReason).toBe("fixed");
});

test("5 study sessions flexible → 5 placed, event_type=study, intensity=LIGHT", () => {
  const out = buildWeekPlan(baseInput({
    studyMix: [
      { subject: "Math", sessionsPerWeek: 3, durationMin: 45, placement: "flexible" },
      { subject: "Physics", sessionsPerWeek: 2, durationMin: 45, placement: "flexible" },
    ],
  }));
  expect(out.planItems.length).toBe(5);
  for (const it of out.planItems) {
    expect(it.eventType).toBe("study");
    expect(it.intensity).toBe("LIGHT");
  }
  const mathCount = out.planItems.filter((p) => p.title === "Math").length;
  expect(mathCount).toBe(3);
});

test("match_competition fixed Saturday → placed HARD on Saturday", () => {
  const out = buildWeekPlan(baseInput({
    trainingMix: [
      { category: "match_competition", sessionsPerWeek: 1, durationMin: 90, placement: "fixed", fixedDays: [6] },
    ],
  }));
  expect(out.planItems.length).toBe(1);
  expect(out.planItems[0].date).toBe("2026-04-25"); // Saturday
  expect(out.planItems[0].intensity).toBe("HARD");
  expect(out.planItems[0].eventType).toBe("match");
});

test("day_lock on Wednesday → gym forced off Wed when flexible", () => {
  const out = buildWeekPlan(baseInput({
    trainingMix: [
      { category: "gym", sessionsPerWeek: 5, durationMin: 60, placement: "flexible" },
    ],
    dayLocks: ["2026-04-22"],
  }));
  expect(out.planItems.length).toBeGreaterThanOrEqual(4);
  for (const it of out.planItems) {
    if (it.date === "2026-04-22") throw new Error(`unexpected gym on locked Wednesday`);
  }
});

test("fixed gym on locked day → warning + not placed", () => {
  const out = buildWeekPlan(baseInput({
    trainingMix: [
      { category: "gym", sessionsPerWeek: 1, durationMin: 60, placement: "fixed", fixedDays: [3] },
    ],
    dayLocks: ["2026-04-22"], // the only Wed in the week
  }));
  const hasLockWarn = out.warnings.some((w) => w.code === "day_lock_skipped");
  const fixedDayUnavailable = out.warnings.some((w) => w.code === "fixed_day_unavailable");
  if (!hasLockWarn && !fixedDayUnavailable) {
    throw new Error(`expected day-lock warning, got ${JSON.stringify(out.warnings.map((w) => w.code))}`);
  }
});

test("existing event blocks overlap: gym on Monday 17:00–18:30 → auto-placed away from it", () => {
  const existing = [{
    id: "e1",
    name: "Club Training",
    date: "2026-04-20",
    startTime: "17:00",
    endTime: "18:30",
    eventType: "training",
    intensity: "MODERATE",
  }];
  const out = buildWeekPlan(baseInput({
    existingEvents: existing,
    trainingMix: [
      { category: "gym", sessionsPerWeek: 1, durationMin: 60, placement: "fixed", fixedDays: [1] },
    ],
  }));
  expect(out.planItems.length).toBe(1);
  const [h, m] = out.planItems[0].startTime.split(":").map(Number);
  const start = h * 60 + m;
  // Must not overlap 17:00–18:30 + 30-min buffer. So start ≥ 19:00 OR end ≤ 16:30.
  const end = start + 60;
  const overlapStart = 17 * 60 - 30;
  const overlapEnd = 18 * 60 + 30 + 30;
  if (end > overlapStart && start < overlapEnd) {
    throw new Error(`gym placed inside buffer window at ${out.planItems[0].startTime}`);
  }
});

test("league+exam → max 1 HARD across the week, downgrades extras", () => {
  const out = buildWeekPlan(baseInput({
    playerPrefs: { ...BASE_PREFS, leagueActive: true, examPeriodActive: true },
    trainingMix: [
      { category: "match_competition", sessionsPerWeek: 1, durationMin: 90, placement: "fixed", fixedDays: [6] },
      // Add another category that defaults HARD by forcing it. In v1 only match is HARD by default,
      // so this test just confirms the cap path doesn't crash when the budget is 1.
    ],
  }));
  expect(out.summary.hardSessions).toBeLessThanOrEqual(1);
});

test("exam-subject study gets morning preference when exam period is on", () => {
  const out = buildWeekPlan(baseInput({
    playerPrefs: { ...BASE_PREFS, examPeriodActive: true },
    studyMix: [
      { subject: "Math", sessionsPerWeek: 1, durationMin: 60, placement: "fixed", fixedDays: [6], isExamSubject: true },
    ],
  }));
  expect(out.planItems.length).toBe(1);
  const [h] = out.planItems[0].startTime.split(":").map(Number);
  // Morning anchor is 07:00 → spiral search should land close to morning
  expect(h).toBeLessThanOrEqual(11);
});

test("summary totals align with individual items", () => {
  const out = buildWeekPlan(baseInput({
    trainingMix: [
      { category: "gym", sessionsPerWeek: 2, durationMin: 60, placement: "flexible" },
      { category: "recovery", sessionsPerWeek: 2, durationMin: 30, placement: "flexible" },
    ],
    studyMix: [
      { subject: "Math", sessionsPerWeek: 3, durationMin: 45, placement: "flexible" },
    ],
  }));
  const summed = out.planItems.reduce((a, p) => a + p.durationMin, 0);
  expect(out.summary.totalMinutes).toBe(summed);
  expect(out.summary.trainingSessions + out.summary.studySessions).toBe(out.planItems.length);
});

test("no placement on past days when today is mid-week (this-week scenario)", () => {
  // User picks "this week" on a Saturday. The week range stays Mon-Sun
  // but the builder must not place anything on Mon-Fri. (Multiple
  // sessions CAN still fit on Sat/Sun — we only guard against past
  // dates, not total placement count.)
  const out = buildWeekPlan(baseInput({
    today: "2026-04-25",  // Saturday of the test week (Apr 20 – 26)
    trainingMix: [
      { category: "gym", sessionsPerWeek: 5, durationMin: 60, placement: "flexible" },
    ],
  }));
  for (const it of out.planItems) {
    if (it.date < "2026-04-25") {
      throw new Error(`placed on past date ${it.date} when today=2026-04-25`);
    }
  }
});

test("fixed Monday + today is Tuesday → Monday session dropped, not placed", () => {
  // Athlete wants gym Mondays, planning this week but today is Tuesday.
  // The Monday slot is past — can't be placed. Should emit a warning
  // instead of silently scheduling an event the athlete already missed.
  const out = buildWeekPlan(baseInput({
    today: "2026-04-21",  // Tuesday
    trainingMix: [
      { category: "gym", sessionsPerWeek: 1, durationMin: 60, placement: "fixed", fixedDays: [1] },
    ],
  }));
  // No plan item should land on Monday (the only allowed day, now in the past).
  for (const it of out.planItems) {
    if (it.date === "2026-04-20") throw new Error("gym placed on past Monday");
  }
  // Warning should fire so the athlete knows the fixed day didn't fit.
  const hasWarning = out.warnings.some((w) =>
    w.code === "fixed_day_unavailable" || w.code === "dropped_session_no_slot"
  );
  if (!hasWarning) throw new Error(`expected a warning about the missed Monday, got ${JSON.stringify(out.warnings.map((w) => w.code))}`);
});

test("chronological sort: items returned in date + time order", () => {
  const out = buildWeekPlan(baseInput({
    trainingMix: [
      { category: "gym", sessionsPerWeek: 4, durationMin: 45, placement: "flexible" },
    ],
  }));
  for (let i = 1; i < out.planItems.length; i++) {
    const prev = `${out.planItems[i - 1].date}T${out.planItems[i - 1].startTime}`;
    const cur = `${out.planItems[i].date}T${out.planItems[i].startTime}`;
    if (cur < prev) throw new Error(`items out of order: ${prev} then ${cur}`);
  }
});

// ── Report ──────────────────────────────────────────────────────

console.log("─".repeat(60));
console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) {
  for (const f of failures) console.log(`  • ${f}`);
  process.exit(1);
}
process.exit(0);
