/**
 * PR 3 regression — the intensity_catalog_v1 DEFAULT must produce
 * byte-identical AU outputs to the pre-refactor loadEstimator.ts.
 *
 * These assertions exist so a shape drift in the catalog schema
 * immediately trips a test instead of quietly shifting every athlete's
 * AU numbers on the next event.
 */

import {
  estimateLoad,
  estimateTotalLoad,
} from "../../services/events/computations/loadEstimator";
import {
  INTENSITY_CATALOG_DEFAULT,
  auPerHourForEvent,
  whoopStrainToIntensity,
  rpeToIntensity,
} from "../../services/events/intensityCatalogConfig";

describe("estimateLoad — DEFAULT catalog matches pre-refactor constants", () => {
  test("training + LIGHT at 60 min → 4 AU", () => {
    const r = estimateLoad({ event_type: "training", intensity: "LIGHT", duration_min: 60 });
    expect(r.training_load_au).toBe(4);
    expect(r.academic_load_au).toBe(0);
  });

  test("training + MODERATE at 60 min → 6 AU", () => {
    const r = estimateLoad({ event_type: "training", intensity: "MODERATE", duration_min: 60 });
    expect(r.training_load_au).toBe(6);
  });

  test("training + HARD at 60 min → 8 AU", () => {
    const r = estimateLoad({ event_type: "training", intensity: "HARD", duration_min: 60 });
    expect(r.training_load_au).toBe(8);
  });

  test("training + REST at 60 min → 2 AU", () => {
    const r = estimateLoad({ event_type: "training", intensity: "REST", duration_min: 60 });
    expect(r.training_load_au).toBe(2);
  });

  test("training + null intensity → falls back to MODERATE (6 AU)", () => {
    const r = estimateLoad({ event_type: "training", intensity: null, duration_min: 60 });
    expect(r.training_load_au).toBe(6);
  });

  test("training + unknown intensity label → falls back to MODERATE", () => {
    const r = estimateLoad({ event_type: "training", intensity: "HARDCORE", duration_min: 60 });
    expect(r.training_load_au).toBe(6);
  });

  test("match at 90 min → 13.5 AU (9 AU/h override regardless of intensity field)", () => {
    const r = estimateLoad({ event_type: "match", intensity: "LIGHT", duration_min: 90 });
    expect(r.training_load_au).toBe(13.5);
    expect(r.academic_load_au).toBe(0);
  });

  test("recovery at 60 min → 1 AU (always LIGHT bucket via override)", () => {
    const r = estimateLoad({ event_type: "recovery", intensity: "HARD", duration_min: 60 });
    // Override has au_per_hour=1 which takes precedence over always_intensity.
    expect(r.training_load_au).toBe(1);
  });

  test("study at 60 min → 10 AU academic, 0 training", () => {
    const r = estimateLoad({ event_type: "study", intensity: null, duration_min: 60 });
    expect(r.training_load_au).toBe(0);
    expect(r.academic_load_au).toBe(10);
  });

  test("exam at 90 min → 15 AU academic", () => {
    const r = estimateLoad({ event_type: "exam", intensity: null, duration_min: 90 });
    expect(r.academic_load_au).toBe(15);
  });

  test("other event type → zero load", () => {
    const r = estimateLoad({ event_type: "other", intensity: "HARD", duration_min: 60 });
    expect(r.training_load_au).toBe(0);
    expect(r.academic_load_au).toBe(0);
  });

  test("estimateTotalLoad returns null for zero-load events", () => {
    const r = estimateTotalLoad({ event_type: "other", intensity: null, duration_min: 60 });
    expect(r).toBeNull();
  });

  test("estimateTotalLoad returns sum for mixed events", () => {
    // Not normally possible for one event, but the helper combines both columns.
    expect(estimateTotalLoad({ event_type: "training", intensity: "MODERATE", duration_min: 60 })).toBe(6);
    expect(estimateTotalLoad({ event_type: "study", intensity: null, duration_min: 60 })).toBe(10);
  });

  test("duration rounding — 30 min LIGHT = 2 AU", () => {
    // 30 min * 4 AU/h = 2.0 AU → rounds to 2.0.
    const r = estimateLoad({ event_type: "training", intensity: "LIGHT", duration_min: 30 });
    expect(r.training_load_au).toBe(2);
  });

  test("negative duration clamps to zero", () => {
    const r = estimateLoad({ event_type: "training", intensity: "HARD", duration_min: -30 });
    expect(r.training_load_au).toBe(0);
  });
});

describe("auPerHourForEvent", () => {
  test("training / MODERATE → 6", () => {
    expect(auPerHourForEvent(INTENSITY_CATALOG_DEFAULT, "training", "MODERATE")).toBe(6);
  });

  test("match overrides intensity and returns 9", () => {
    expect(auPerHourForEvent(INTENSITY_CATALOG_DEFAULT, "match", "LIGHT")).toBe(9);
  });

  test("training / null intensity → catalog default_intensity (MODERATE → 6)", () => {
    expect(auPerHourForEvent(INTENSITY_CATALOG_DEFAULT, "training", null)).toBe(6);
  });
});

describe("whoopStrainToIntensity", () => {
  test.each([
    [0,  "LIGHT"],
    [5,  "LIGHT"],
    [6,  "LIGHT"],    // strain_max=6 inclusive → LIGHT
    [7,  "MODERATE"],
    [12, "MODERATE"],
    [13, "HARD"],
    [18, "HARD"],
    [21, "HARD"],
  ] as const)("strain %p → %p", (strain, expected) => {
    expect(whoopStrainToIntensity(INTENSITY_CATALOG_DEFAULT, strain)).toBe(expected);
  });
});

describe("rpeToIntensity", () => {
  test.each([
    [1,  "REST"],
    [2,  "REST"],
    [3,  "LIGHT"],
    [4,  "LIGHT"],
    [5,  "MODERATE"],
    [6,  "MODERATE"],
    [7,  "HARD"],
    [10, "HARD"],
  ] as const)("rpe %p → %p", (rpe, expected) => {
    expect(rpeToIntensity(INTENSITY_CATALOG_DEFAULT, rpe)).toBe(expected);
  });
});
