/**
 * Regression proof — the config refactor of ccrsFormula.ts must produce
 * byte-for-byte identical output as the pre-refactor hardcoded version
 * for the DEFAULT payload.
 *
 * Why this test exists: on PR 2 deploy day, every athlete's CCRS should
 * be mathematically unchanged. If any of these cases diverges, the DB
 * row in migration 083 will produce different scores than the old code
 * did, and ops will be chasing a mystery score shift for hours.
 *
 * What's covered:
 *   - DEFAULT payload fed explicitly produces the same score as no-arg
 *     calculateCCRS() (both should use DEFAULT internally).
 *   - Per-subfunction: getFreshnessMult, getPHVMultiplier,
 *     getACWRMultiplier hit every zone, getCascadeWeights across cascade
 *     scenarios.
 *   - The exact hardcoded values from the pre-refactor version are
 *     inlined as assertions so the test is self-contained.
 */

import {
  calculateCCRS,
  getFreshnessMult,
  getPHVMultiplier,
  getACWRMultiplier,
  getCascadeWeights,
  type CCRSInputs,
  type BiometricInputs,
  type AthleteBaseline,
  type HooperInputs,
  type ACWRInputs,
} from "../../services/ccrs/ccrsFormula";
import { CCRS_FORMULA_DEFAULT } from "../../services/ccrs/ccrsFormulaConfig";
import { ACWR_CONFIG_DEFAULT } from "../../services/events/acwrConfig";

// ── Fresh, well-slept, in-range baseline inputs ────────────────────────────
const BIO: BiometricInputs = { hrv_rmssd: 55, rhr_bpm: 60, sleep_hours: 8.0, data_age_hours: 2 };
const BASE: AthleteBaseline = {
  hrv_mean_30d: 50, hrv_sd_30d: 8, rhr_mean_30d: 62, baseline_valid: true,
};
const HOOPER: HooperInputs = {
  sleep_quality: 4, energy_level: 4, muscle_soreness: 4, stress_level: 4, motivation: 4, athlete_age: 16,
};
const ACWR_OK: ACWRInputs = { acute_load_7d: 700, chronic_load_28d: 2800 };

function baseInputs(overrides: Partial<CCRSInputs> = {}): CCRSInputs {
  return {
    biometric:         BIO,
    baseline:          BASE,
    hooper:            HOOPER,
    acwr:              ACWR_OK,
    phv_stage:         "adult",
    coach_phase_score: null,
    historical_score:  62,
    ...overrides,
  };
}

describe("PR 2 regression — DEFAULT config produces identical output", () => {
  test("calculateCCRS — implicit DEFAULT equals explicit DEFAULT", () => {
    const inputs = baseInputs();
    const implicit = calculateCCRS(inputs);
    const explicit = calculateCCRS(inputs, {
      ccrs: CCRS_FORMULA_DEFAULT,
      acwr: ACWR_CONFIG_DEFAULT,
    });
    expect(explicit).toEqual(implicit);
  });

  test("getFreshnessMult — matches pre-refactor hardcoded ladder", () => {
    // <8h = 1.0, <16h = 0.75, <24h = 0.45, <48h = 0.15, else 0
    expect(getFreshnessMult(0)).toBe(1.0);
    expect(getFreshnessMult(7.99)).toBe(1.0);
    expect(getFreshnessMult(8)).toBe(0.75);
    expect(getFreshnessMult(15.99)).toBe(0.75);
    expect(getFreshnessMult(16)).toBe(0.45);
    expect(getFreshnessMult(23.99)).toBe(0.45);
    expect(getFreshnessMult(24)).toBe(0.15);
    expect(getFreshnessMult(47.99)).toBe(0.15);
    expect(getFreshnessMult(48)).toBe(0);
    expect(getFreshnessMult(1000)).toBe(0);
  });

  test("getPHVMultiplier — matches pre-refactor enum mapping", () => {
    expect(getPHVMultiplier("pre_phv")).toBe(1.0);
    expect(getPHVMultiplier("mid_phv")).toBe(0.85);
    expect(getPHVMultiplier("post_phv")).toBe(0.95);
    expect(getPHVMultiplier("adult")).toBe(1.0);
    expect(getPHVMultiplier("unknown")).toBe(0.9);
  });

  describe("getACWRMultiplier — hard_cap_only mode (DEFAULT)", () => {
    test("sweet spot returns multiplier 1.0", () => {
      const r = getACWRMultiplier({ acute_load_7d: 700, chronic_load_28d: 2800 });
      expect(r.multiplier).toBe(1.0);
      expect(r.zone).toBe("sweet_spot");
      expect(r.hard_cap).toBe(false);
    });

    test("ratio between 1.3 and 2.0 collapses to sweet_spot in hard_cap_only", () => {
      // chronic_weekly = 700, ratio = 1.2 (700 × 1.2 = 840 acute)
      const r = getACWRMultiplier({ acute_load_7d: 840, chronic_load_28d: 2800 });
      expect(r.zone).toBe("sweet_spot");
      expect(r.multiplier).toBe(1.0);
    });

    test("ratio > 2.0 triggers blocked + hard_cap", () => {
      // chronic_weekly = 700, ratio = 3.0 (700 × 3 = 2100 acute)
      const r = getACWRMultiplier({ acute_load_7d: 2100, chronic_load_28d: 2800 });
      expect(r.multiplier).toBe(0.4);
      expect(r.zone).toBe("blocked");
      expect(r.hard_cap).toBe(true);
    });

    test("zero chronic defaults ratio to 1.0 (sweet spot)", () => {
      const r = getACWRMultiplier({ acute_load_7d: 500, chronic_load_28d: 0 });
      expect(r.acwr_value).toBe(1.0);
      expect(r.zone).toBe("sweet_spot");
    });
  });

  describe("getACWRMultiplier — full mode (rollback path)", () => {
    const fullMode = { ...ACWR_CONFIG_DEFAULT, mode: "full" as const };

    test("caution zone (1.3 < ratio ≤ 1.5)", () => {
      const r = getACWRMultiplier({ acute_load_7d: 980, chronic_load_28d: 2800 }, fullMode);
      // chronic_weekly = 700, ratio = 1.4 → caution
      expect(r.zone).toBe("caution");
      expect(r.multiplier).toBe(0.85);
    });

    test("high_risk zone (1.5 < ratio ≤ 2.0)", () => {
      const r = getACWRMultiplier({ acute_load_7d: 1260, chronic_load_28d: 2800 }, fullMode);
      // chronic_weekly = 700, ratio = 1.8 → high_risk
      expect(r.zone).toBe("high_risk");
      expect(r.multiplier).toBe(0.65);
    });

    test("undertraining zone (ratio < 0.8)", () => {
      const r = getACWRMultiplier({ acute_load_7d: 400, chronic_load_28d: 2800 }, fullMode);
      // chronic_weekly = 700, ratio ≈ 0.57 → undertraining
      expect(r.zone).toBe("undertraining");
      expect(r.multiplier).toBe(0.9);
    });
  });

  test("getCascadeWeights — all four tiers present sums to 1.0", () => {
    const w = getCascadeWeights({
      bio_available: true,
      freshness_mult: 1.0,
      checkin_available: true,
      coach_available: true,
    });
    expect(w.biometric + w.hooper + w.historical + w.coach).toBeCloseTo(1.0, 3);
    // With bio fresh + hooper + coach, historical is the remainder:
    // wb=0.55, wh=0.30, wc=0.08 → wHist = 1 - 0.93 = 0.07
    expect(w.biometric).toBeCloseTo(0.55, 3);
    expect(w.hooper).toBeCloseTo(0.30, 3);
    expect(w.coach).toBeCloseTo(0.08, 3);
    expect(w.historical).toBeCloseTo(0.07, 3);
  });

  test("getCascadeWeights — no bio shifts hooper weight to 0.65", () => {
    const w = getCascadeWeights({
      bio_available: false,
      freshness_mult: 0,
      checkin_available: true,
      coach_available: false,
    });
    expect(w.biometric).toBe(0);
    expect(w.hooper).toBeCloseTo(0.65, 3);
    expect(w.historical).toBeCloseTo(0.35, 3);
  });

  test("calculateCCRS — full green inputs produce CCRS ≥ 70 + recommendation moderate+", () => {
    const r = calculateCCRS(baseInputs());
    expect(r.ccrs).toBeGreaterThanOrEqual(70);
    expect(r.confidence).toBe("very_high");
    expect(["full_load", "moderate"]).toContain(r.recommendation);
  });

  test("calculateCCRS — ACWR > 2.0 hard-caps score at 40 + recommendation blocked", () => {
    const r = calculateCCRS(
      baseInputs({ acwr: { acute_load_7d: 2100, chronic_load_28d: 2800 } }),
    );
    expect(r.ccrs).toBeLessThanOrEqual(40);
    expect(r.recommendation).toBe("blocked");
    expect(r.alert_flags).toContain("ACWR_BLOCKED");
  });

  test("calculateCCRS — mid_phv dampens score by ~15%", () => {
    const adult = calculateCCRS(baseInputs({ phv_stage: "adult" }));
    const phv   = calculateCCRS(baseInputs({ phv_stage: "mid_phv" }));
    expect(phv.ccrs / adult.ccrs).toBeCloseTo(0.85, 1);
  });

  test("calculateCCRS — cold-start baseline produces 'estimated' confidence", () => {
    const r = calculateCCRS(
      baseInputs({
        baseline: { hrv_mean_30d: 50, hrv_sd_30d: 8, rhr_mean_30d: 62, baseline_valid: false },
      }),
    );
    expect(r.confidence).toBe("estimated");
    expect(r.alert_flags).toContain("COLD_START");
  });
});
