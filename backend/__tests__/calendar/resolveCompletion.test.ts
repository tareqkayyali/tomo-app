/**
 * PR 6A regression — session completion resolution logic.
 *
 * Covers:
 *   - resolveEffectiveIntensity: RPE wins over scheduled, scheduled wins
 *     over catalog default, MATCH/RECOVERY collapse correctly for the
 *     calendar_events CHECK constraint.
 *   - resolveEffectiveDuration: reported > scheduled span > 60-minute
 *     fallback; invalid inputs clamp to fallback without crashing.
 *   - toCalendarIntensity: every bucket round-trips through the filter.
 */

import {
  resolveEffectiveIntensity,
  resolveEffectiveDuration,
  toCalendarIntensity,
} from "../../services/calendar/resolveCompletion";
import { INTENSITY_CATALOG_DEFAULT } from "../../services/events/intensityCatalogConfig";

describe("toCalendarIntensity", () => {
  test("REST, LIGHT, MODERATE, HARD pass through unchanged", () => {
    expect(toCalendarIntensity("REST")).toBe("REST");
    expect(toCalendarIntensity("LIGHT")).toBe("LIGHT");
    expect(toCalendarIntensity("MODERATE")).toBe("MODERATE");
    expect(toCalendarIntensity("HARD")).toBe("HARD");
  });

  test("MATCH collapses to HARD for calendar row", () => {
    expect(toCalendarIntensity("MATCH")).toBe("HARD");
  });

  test("RECOVERY collapses to LIGHT for calendar row", () => {
    expect(toCalendarIntensity("RECOVERY")).toBe("LIGHT");
  });
});

describe("resolveEffectiveIntensity", () => {
  const catalog = INTENSITY_CATALOG_DEFAULT;

  test("RPE 1 → REST (lowest ladder bucket)", () => {
    expect(resolveEffectiveIntensity({ catalog, rpe: 1, scheduledIntensity: "HARD" })).toBe("REST");
  });

  test("RPE 3 → LIGHT (next ladder bucket)", () => {
    expect(resolveEffectiveIntensity({ catalog, rpe: 3, scheduledIntensity: "HARD" })).toBe("LIGHT");
  });

  test("RPE 5 → MODERATE", () => {
    expect(resolveEffectiveIntensity({ catalog, rpe: 5, scheduledIntensity: "LIGHT" })).toBe("MODERATE");
  });

  test("RPE 9 → HARD", () => {
    expect(resolveEffectiveIntensity({ catalog, rpe: 9, scheduledIntensity: "LIGHT" })).toBe("HARD");
  });

  test("RPE wins over scheduled intensity", () => {
    // Scheduled was LIGHT but athlete reports RPE 9 → HARD.
    expect(resolveEffectiveIntensity({ catalog, rpe: 9, scheduledIntensity: "LIGHT" })).toBe("HARD");
  });

  test("No RPE → falls back to scheduled intensity", () => {
    expect(resolveEffectiveIntensity({ catalog, rpe: null, scheduledIntensity: "HARD" })).toBe("HARD");
    expect(resolveEffectiveIntensity({ catalog, rpe: undefined, scheduledIntensity: "MODERATE" })).toBe("MODERATE");
  });

  test("No RPE + no scheduled → catalog default (MODERATE)", () => {
    expect(resolveEffectiveIntensity({ catalog, rpe: null, scheduledIntensity: null })).toBe("MODERATE");
    expect(resolveEffectiveIntensity({ catalog, rpe: undefined, scheduledIntensity: undefined })).toBe("MODERATE");
  });

  test("Unknown scheduled intensity → catalog default", () => {
    expect(resolveEffectiveIntensity({ catalog, rpe: null, scheduledIntensity: "WEIRD" })).toBe("MODERATE");
  });

  test("Custom catalog with different RPE ladder is respected", () => {
    const customCatalog = {
      ...INTENSITY_CATALOG_DEFAULT,
      rpe_to_intensity: [
        { rpe_max: 5,  intensity: "LIGHT"    as const },
        { rpe_max: 10, intensity: "MODERATE" as const },
      ],
    };
    // RPE 8 with custom catalog maps to MODERATE (not HARD like default).
    expect(resolveEffectiveIntensity({ catalog: customCatalog, rpe: 8, scheduledIntensity: null })).toBe("MODERATE");
  });
});

describe("resolveEffectiveDuration", () => {
  test("reported duration wins over scheduled span", () => {
    const d = resolveEffectiveDuration({
      reported:       45,
      scheduledStart: "2026-04-20T14:00:00Z",
      scheduledEnd:   "2026-04-20T15:30:00Z", // 90 min scheduled
    });
    expect(d).toBe(45);
  });

  test("no reported → computes from scheduled span", () => {
    const d = resolveEffectiveDuration({
      reported:       null,
      scheduledStart: "2026-04-20T14:00:00Z",
      scheduledEnd:   "2026-04-20T15:00:00Z",
    });
    expect(d).toBe(60);
  });

  test("no reported + no scheduled → 60 minute fallback", () => {
    expect(resolveEffectiveDuration({ reported: null, scheduledStart: null, scheduledEnd: null })).toBe(60);
  });

  test("invalid scheduled dates → 60 fallback", () => {
    expect(
      resolveEffectiveDuration({
        reported:       null,
        scheduledStart: "not-a-date",
        scheduledEnd:   "nope",
      }),
    ).toBe(60);
  });

  test("end before start → 60 fallback (never negative)", () => {
    const d = resolveEffectiveDuration({
      reported:       null,
      scheduledStart: "2026-04-20T15:00:00Z",
      scheduledEnd:   "2026-04-20T14:00:00Z",
    });
    expect(d).toBe(60);
  });

  test("zero-reported → falls through to scheduled span", () => {
    const d = resolveEffectiveDuration({
      reported:       0,
      scheduledStart: "2026-04-20T14:00:00Z",
      scheduledEnd:   "2026-04-20T14:30:00Z",
    });
    expect(d).toBe(30);
  });

  test("negative reported → falls through to scheduled", () => {
    const d = resolveEffectiveDuration({
      reported:       -30,
      scheduledStart: "2026-04-20T14:00:00Z",
      scheduledEnd:   "2026-04-20T15:00:00Z",
    });
    expect(d).toBe(60);
  });

  test("rounds fractional minutes to the nearest integer", () => {
    // 65 minutes and 30 seconds → 66.
    const d = resolveEffectiveDuration({
      reported:       null,
      scheduledStart: "2026-04-20T14:00:00Z",
      scheduledEnd:   "2026-04-20T15:05:30Z",
    });
    expect(d).toBe(66);
  });
});
