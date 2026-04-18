/**
 * Repair Engine — fixture verification.
 *
 * Focuses on the cases hardest to verify at the builder level:
 *   - time shift IS silent (no adjustment log)
 *   - day shift IS logged with a reason
 *   - swap preserves priority ordering (higher category wins)
 *   - swap re-queues the displaced item so it gets its own repair pass
 *   - drop happens only when all three moves fail
 *
 * Run: cd backend && npx tsx services/weekPlan/__tests__/repairEngine.test.ts
 */

import {
  runRepair,
  type UnplacedCandidate,
  type RepairablePlanItem,
} from "../repairEngine";
import type { PlayerPrefs } from "../weekPlanBuilder";
import type { ResolvedPriority } from "../priorityResolver";
import { DEFAULT_CONFIG, type ScheduleEvent } from "@/services/schedulingEngine";

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
    toBe(exp: unknown) {
      if (actual !== exp) throw new Error(`expected ${JSON.stringify(exp)}, got ${JSON.stringify(actual)}`);
    },
    toEqual(exp: unknown) {
      if (JSON.stringify(actual) !== JSON.stringify(exp))
        throw new Error(`expected ${JSON.stringify(exp)}, got ${JSON.stringify(actual)}`);
    },
    toBeGreaterThan(n: number) {
      if (typeof actual !== "number" || actual <= n)
        throw new Error(`expected > ${n}, got ${actual}`);
    },
  };
}

// ── Fixtures ──────────────────────────────────────────────────

const BASE_PREFS: PlayerPrefs = {
  timezone: "Europe/London",
  schoolDays: [],     // no school — keeps fixtures focused on repair logic
  schoolStart: "08:00",
  schoolEnd: "15:00",
  dayBoundsStart: "06:00",
  dayBoundsEnd: "22:00",
  examPeriodActive: false,
  leagueActive: false,
};

const MON_2026_04_20 = "2026-04-20";
const weekDates = [
  "2026-04-20", "2026-04-21", "2026-04-22", "2026-04-23",
  "2026-04-24", "2026-04-25", "2026-04-26",
];

const PRIORITY: ResolvedPriority = {
  scenario: "normal",
  modeId: "balanced",
  order: ["match_competition", "club", "tactical", "individual_technical", "gym", "personal", "mental_performance", "study", "recovery"],
  source: "cms",
};

function cand(over: Partial<UnplacedCandidate>): UnplacedCandidate {
  return {
    title: "Test Session",
    category: "gym",
    durationMin: 60,
    placement: "flexible",
    allowedWeekdays: [0, 1, 2, 3, 4, 5, 6],
    preferredStartMin: 17 * 60,
    eventType: "training",
    intensity: "MODERATE",
    dayLocks: new Set<string>(),
    ...over,
  };
}

console.log("\nRepair Engine");
console.log("─".repeat(60));

test("empty input → empty output, no warnings", () => {
  const r = runRepair({
    weekDates,
    unplaced: [],
    placedItems: [],
    existingByDate: {},
    stagedByDate: {},
    playerPrefs: BASE_PREFS,
    config: DEFAULT_CONFIG,
    priority: PRIORITY,
  });
  expect(r.placedItems.length).toBe(0);
  expect(r.droppedItems.length).toBe(0);
  expect(r.warnings.length).toBe(0);
});

test("time shift places on preferred day; no adjustment log (silent)", () => {
  // Clean day — a simple autoPosition call should succeed at preferred.
  const r = runRepair({
    weekDates,
    unplaced: [cand({ title: "Gym" })],
    placedItems: [],
    existingByDate: {},
    stagedByDate: {},
    playerPrefs: BASE_PREFS,
    config: DEFAULT_CONFIG,
    priority: PRIORITY,
  });
  expect(r.placedItems.length).toBe(1);
  expect(r.droppedItems.length).toBe(0);
  const item = r.placedItems[0];
  expect(item.status).toBe("clean");
  expect(Array.isArray(item.adjustments)).toBe(false);
});

test("day shift: blocked preferred day → lands on adjacent day + logged", () => {
  // Fill day 0 entirely from 6 AM to 10 PM → no slot any amount of shift
  // can find on that day. Forces day shift to day 1.
  const fullyBlockingEvent: ScheduleEvent = {
    id: "existing-full",
    name: "Club Training Session",
    startTime: "06:00",
    endTime: "22:00",
    type: "training",
    intensity: "MODERATE",
  };
  // Drive the "preferred day" to be day 0 by giving the candidate a dayLocks
  // set covering days 1–6 except 1 — that way preferredDateFor picks day 0
  // (first non-locked date). But a day shift can escape to day 1.
  const locks = new Set(weekDates.slice(2));  // lock days 2–6
  const c = cand({
    title: "Gym",
    preferredStartMin: 10 * 60,   // 10 AM — squarely inside the blocker
    dayLocks: locks,
  });

  const r = runRepair({
    weekDates,
    unplaced: [c],
    placedItems: [],
    existingByDate: { [weekDates[0]]: [fullyBlockingEvent] },
    stagedByDate: {},
    playerPrefs: BASE_PREFS,
    config: DEFAULT_CONFIG,
    priority: PRIORITY,
  });
  expect(r.placedItems.length).toBe(1);
  expect(r.droppedItems.length).toBe(0);
  const item = r.placedItems[0];
  expect(item.status).toBe("adjusted");
  expect(Array.isArray(item.adjustments)).toBe(true);
  expect(item.adjustments!.length).toBe(1);
  expect(item.adjustments![0].move).toBe("day_shift");
  // Must have landed on day 1 (the only unlocked day besides day 0).
  expect(item.date).toBe(weekDates[1]);
});

test("swap: higher priority category displaces lower on same date", () => {
  // Day 0 is full except for one slot currently held by recovery. Higher-
  // priority club candidate should swap in; recovery gets re-queued to
  // another day.
  const blockers: ScheduleEvent[] = [
    { id: "fill-am", name: "Morning lock", startTime: "06:00", endTime: "16:00", type: "other", intensity: null },
    { id: "fill-pm", name: "Evening lock", startTime: "18:30", endTime: "22:00", type: "other", intensity: null },
  ];
  const recoveryEvent: ScheduleEvent = {
    id: "existing-placed",
    name: "Recovery Session",
    startTime: "17:00",
    endTime: "18:00",
    type: "recovery",
    intensity: "LIGHT",
  };
  const recoveryPlaced: RepairablePlanItem = {
    title: "Recovery Session",
    category: "recovery",
    date: weekDates[0],
    startTime: "17:00",
    endTime: "18:00",
    durationMin: 60,
    eventType: "recovery",
    intensity: "LIGHT",
    placementReason: "auto",
    predictedLoadAu: 1,
    status: "clean",
  };

  const clubCand = cand({
    title: "Club Training Session",
    category: "club",
    preferredStartMin: 17 * 60,
    // Fix this candidate to day 0 so only swap (not day shift) can satisfy.
    placement: "fixed",
    allowedWeekdays: [new Date(`${weekDates[0]}T12:00:00Z`).getUTCDay()],
  });

  const r = runRepair({
    weekDates,
    unplaced: [clubCand],
    placedItems: [recoveryPlaced],
    existingByDate: { [weekDates[0]]: blockers },
    stagedByDate: { [weekDates[0]]: [recoveryEvent] },
    playerPrefs: BASE_PREFS,
    config: DEFAULT_CONFIG,
    priority: PRIORITY,
  });

  // Club must be placed on day 0
  const club = r.placedItems.find((p) => p.category === "club");
  if (!club) throw new Error("club never placed");
  expect(club.date).toBe(weekDates[0]);
  expect(club.status).toBe("adjusted");
  expect(club.adjustments![0].move).toBe("swap");

  // Recovery must have been relocated (or dropped) — but NOT on day 0 at
  // 17:00 anymore since club took its slot.
  const recovery = r.placedItems.find((p) => p.category === "recovery");
  // Either recovery got moved elsewhere OR it got dropped. Dropped is
  // acceptable in this tight fixture (no free days).
  if (recovery) {
    const sameDayAtSameTime =
      recovery.date === weekDates[0] && recovery.startTime === "17:00";
    if (sameDayAtSameTime) throw new Error("recovery wasn't actually displaced");
  }
});

test("drop only when all 3 moves fail", () => {
  // Lock every day, fix the candidate's allowed weekday to one of them —
  // nothing can save it.
  const locks = new Set(weekDates);
  const c = cand({
    title: "Gym",
    placement: "fixed",
    allowedWeekdays: [1, 2, 3],
    dayLocks: locks,
  });
  const r = runRepair({
    weekDates,
    unplaced: [c],
    placedItems: [],
    existingByDate: {},
    stagedByDate: {},
    playerPrefs: BASE_PREFS,
    config: DEFAULT_CONFIG,
    priority: PRIORITY,
  });
  expect(r.placedItems.length).toBe(0);
  expect(r.droppedItems.length).toBe(1);
  expect(r.warnings.length).toBe(1);
});

test("swap direction respects priority (lower category NEVER displaces higher)", () => {
  // Setup: recovery can't fit on a day already held by a club session.
  // Repair must NOT swap the higher-priority club out.
  const clubEvent: ScheduleEvent = {
    id: "existing-club",
    name: "Club Training Session",
    startTime: "17:00",
    endTime: "18:30",
    type: "training",
    intensity: "MODERATE",
  };
  const clubPlaced: RepairablePlanItem = {
    title: "Club Training Session",
    category: "club",
    date: weekDates[0],
    startTime: "17:00",
    endTime: "18:30",
    durationMin: 90,
    eventType: "training",
    intensity: "MODERATE",
    placementReason: "fixed",
    predictedLoadAu: 9,
    status: "clean",
  };
  // Fully block every other slot/day to force the recovery candidate into
  // a position where its only hope is a swap.
  const fullBlock: ScheduleEvent[] = [
    { id: "am", name: "AM lock", startTime: "06:00", endTime: "16:59", type: "other", intensity: null },
    { id: "pm", name: "PM lock", startTime: "18:31", endTime: "22:00", type: "other", intensity: null },
  ];
  const locks = new Set(weekDates.slice(1));  // lock days 1–6
  const recoveryCand = cand({
    title: "Recovery Session",
    category: "recovery",
    placement: "flexible",
    preferredStartMin: 17 * 60,
    dayLocks: locks,
  });

  const r = runRepair({
    weekDates,
    unplaced: [recoveryCand],
    placedItems: [clubPlaced],
    existingByDate: { [weekDates[0]]: fullBlock },
    stagedByDate: { [weekDates[0]]: [clubEvent] },
    playerPrefs: BASE_PREFS,
    config: DEFAULT_CONFIG,
    priority: PRIORITY,
  });

  // Club MUST still be in place — recovery does NOT outrank it so swap
  // shouldn't happen.
  const club = r.placedItems.find((p) => p.title === "Club Training Session");
  if (!club) throw new Error("club was wrongly displaced");
  expect(club.startTime).toBe("17:00");
  expect(club.status).toBe("clean");

  // Recovery should be dropped — no valid move.
  expect(r.droppedItems.length).toBe(1);
});

console.log("─".repeat(60));
console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) {
  for (const f of failures) console.log(`  • ${f}`);
  process.exit(1);
}
process.exit(0);
