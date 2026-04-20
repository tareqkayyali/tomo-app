/**
 * PR 7 regression — check-in retro-confirm + wearable matcher pure helpers.
 *
 * The side-effect functions (runRetroactiveCheckinConfirm,
 * matchWorkoutToScheduled) require Supabase + emit paths that are
 * expensive to mock — their DB integration is covered by manual smoke
 * after deploy. What's exercised here is the decision logic: classifier
 * thresholds, overlap math, and single-match arbitration.
 */

import {
  classifyCheckinEffort,
} from "../../services/calendar/retroactiveConfirm";
import {
  overlapsWithin,
  pickSingleMatch,
  type ScheduledEventLite,
  type WearableWorkoutLite,
} from "../../services/calendar/wearableMatcher";
import { LOAD_ATTRIBUTION_DEFAULT } from "../../services/events/loadAttributionConfig";

// ── classifier ────────────────────────────────────────────────────────────

describe("classifyCheckinEffort", () => {
  const cfg = LOAD_ATTRIBUTION_DEFAULT;
  const confirmAt = cfg.completion_triggers.checkin_effort_yesterday.confirm_threshold; // 4
  const skipAt = cfg.completion_triggers.checkin_effort_yesterday.skip_threshold;       // 1

  test("null effort → none", () => {
    expect(classifyCheckinEffort(null, cfg)).toBe("none");
    expect(classifyCheckinEffort(undefined, cfg)).toBe("none");
  });

  test("non-finite effort → none", () => {
    expect(classifyCheckinEffort(NaN as any, cfg)).toBe("none");
  });

  test(`effort === confirm_threshold (${confirmAt}) → confirm`, () => {
    expect(classifyCheckinEffort(confirmAt, cfg)).toBe("confirm");
  });

  test("effort > confirm_threshold → confirm", () => {
    expect(classifyCheckinEffort(confirmAt + 1, cfg)).toBe("confirm");
    expect(classifyCheckinEffort(10, cfg)).toBe("confirm");
  });

  test(`effort === skip_threshold (${skipAt}) → skip`, () => {
    expect(classifyCheckinEffort(skipAt, cfg)).toBe("skip");
  });

  test("effort < skip_threshold → skip", () => {
    expect(classifyCheckinEffort(0, cfg)).toBe("skip");
  });

  test("effort between thresholds → none (ambiguous, push notification will nudge)", () => {
    const between = skipAt + 1; // 2
    expect(classifyCheckinEffort(between, cfg)).toBe("none");
    expect(classifyCheckinEffort(confirmAt - 1, cfg)).toBe("none");
  });

  test("trigger disabled in config → none", () => {
    const disabled = {
      ...cfg,
      completion_triggers: {
        ...cfg.completion_triggers,
        checkin_effort_yesterday: {
          ...cfg.completion_triggers.checkin_effort_yesterday,
          enabled: false,
        },
      },
    };
    expect(classifyCheckinEffort(5, disabled)).toBe("none");
  });
});

// ── wearable matcher helpers ──────────────────────────────────────────────

describe("overlapsWithin", () => {
  const workout: WearableWorkoutLite = {
    start:  "2026-04-20T17:00:00Z",
    end:    "2026-04-20T18:00:00Z",
    strain: 11,
  };

  test("workout exactly inside scheduled → match", () => {
    expect(overlapsWithin({
      scheduledStart: "2026-04-20T17:00:00Z",
      scheduledEnd:   "2026-04-20T18:00:00Z",
      workoutStart:   workout.start,
      workoutEnd:     workout.end,
      beforeMin: 30, afterMin: 30,
    })).toBe(true);
  });

  test("workout starts 20min before scheduled, within before-leeway → match", () => {
    expect(overlapsWithin({
      scheduledStart: "2026-04-20T17:20:00Z",
      scheduledEnd:   "2026-04-20T18:20:00Z",
      workoutStart:   workout.start,
      workoutEnd:     workout.end,
      beforeMin: 30, afterMin: 30,
    })).toBe(true);
  });

  test("workout ends 45min after scheduled end, outside after-leeway → no match", () => {
    expect(overlapsWithin({
      scheduledStart: "2026-04-20T15:00:00Z",
      scheduledEnd:   "2026-04-20T16:00:00Z",
      workoutStart:   workout.start,
      workoutEnd:     workout.end,
      beforeMin: 30, afterMin: 30,
    })).toBe(false);
  });

  test("workout starts 2h before scheduled → no match", () => {
    expect(overlapsWithin({
      scheduledStart: "2026-04-20T19:00:00Z",
      scheduledEnd:   "2026-04-20T20:00:00Z",
      workoutStart:   workout.start,
      workoutEnd:     workout.end,
      beforeMin: 30, afterMin: 30,
    })).toBe(false);
  });

  test("scheduledStart null → no match (can't compare)", () => {
    expect(overlapsWithin({
      scheduledStart: null,
      scheduledEnd:   "2026-04-20T18:00:00Z",
      workoutStart:   workout.start,
      workoutEnd:     workout.end,
      beforeMin: 30, afterMin: 30,
    })).toBe(false);
  });

  test("scheduledEnd null → falls back to +1h from start", () => {
    const r = overlapsWithin({
      scheduledStart: "2026-04-20T17:00:00Z",
      scheduledEnd:   null,
      workoutStart:   workout.start,
      workoutEnd:     workout.end,
      beforeMin: 30, afterMin: 30,
    });
    // Scheduled 17:00 + fallback 1h = 18:00; workout 17:00–18:00 overlaps.
    expect(r).toBe(true);
  });
});

describe("pickSingleMatch", () => {
  const workout: WearableWorkoutLite = {
    start:  "2026-04-20T17:00:00Z",
    end:    "2026-04-20T18:00:00Z",
    strain: 11,
  };

  function makeCandidate(
    id: string,
    start: string | null,
    end: string | null,
    event_type: string = "training",
  ): ScheduledEventLite {
    return { id, start_at: start, end_at: end, intensity: null, event_type };
  }

  test("zero candidates → null", () => {
    expect(pickSingleMatch([], workout, 30, 30)).toBeNull();
  });

  test("one matching candidate → returns it", () => {
    const c = makeCandidate("A", "2026-04-20T17:00:00Z", "2026-04-20T18:00:00Z");
    expect(pickSingleMatch([c], workout, 30, 30)?.id).toBe("A");
  });

  test("two overlapping candidates → null (ambiguous)", () => {
    const a = makeCandidate("A", "2026-04-20T17:00:00Z", "2026-04-20T18:00:00Z");
    const b = makeCandidate("B", "2026-04-20T17:30:00Z", "2026-04-20T18:30:00Z");
    expect(pickSingleMatch([a, b], workout, 30, 30)).toBeNull();
  });

  test("one overlapping + one distant → returns the overlapping one", () => {
    const a = makeCandidate("A", "2026-04-20T17:00:00Z", "2026-04-20T18:00:00Z");
    const b = makeCandidate("B", "2026-04-20T06:00:00Z", "2026-04-20T07:00:00Z");
    expect(pickSingleMatch([a, b], workout, 30, 30)?.id).toBe("A");
  });
});
