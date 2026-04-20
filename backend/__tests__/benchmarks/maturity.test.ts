/**
 * Unit tests for the maturity helpers + SD widener.
 *
 * The widener read-through (getSdWidener) hits Supabase, so we don't exercise
 * it directly here — it's a thin DB lookup with a 5-min cache. Integration
 * is covered by the "effective sd propagation" case further down, which
 * uses the widener multiplier AS IF it came from the table.
 */

import { interpolatePercentile } from "../../scripts/seeds/football_benchmark_seed";
import {
  resolveMaturityAdjustedAgeBand,
  type ChronoAgeBand,
} from "../../services/benchmarks/maturity";

describe("resolveMaturityAdjustedAgeBand", () => {
  describe("phv_stage shift (fallback path)", () => {
    test("POST-PHV on a U15 shifts up to U17 (early maturer)", () => {
      const result = resolveMaturityAdjustedAgeBand({
        chronoBand: "U15",
        phvStage: "POST",
      });
      expect(result.effectiveBand).toBe("U17");
      expect(result.shiftApplied).toBe(1);
      expect(result.reason).toBe("phv_stage");
    });

    test("PRE-PHV on a U17 shifts down to U15 (late maturer)", () => {
      const result = resolveMaturityAdjustedAgeBand({
        chronoBand: "U17",
        phvStage: "PRE",
      });
      expect(result.effectiveBand).toBe("U15");
      expect(result.shiftApplied).toBe(-1);
      expect(result.reason).toBe("phv_stage");
    });

    test("CIRCA-PHV applies no shift", () => {
      const result = resolveMaturityAdjustedAgeBand({
        chronoBand: "U17",
        phvStage: "CIRCA",
      });
      expect(result.effectiveBand).toBe("U17");
      expect(result.shiftApplied).toBe(0);
      expect(result.reason).toBe("none");
    });

    test("null PHV stage applies no shift (safe default)", () => {
      const result = resolveMaturityAdjustedAgeBand({
        chronoBand: "U17",
        phvStage: null,
      });
      expect(result.effectiveBand).toBe("U17");
      expect(result.shiftApplied).toBe(0);
    });
  });

  describe("phv_offset_years preferred path (continuous)", () => {
    test("15yo with offset=+1.8 maps to U17", () => {
      const result = resolveMaturityAdjustedAgeBand({
        chronoBand: "U15",
        phvStage: "POST",
        phvOffsetYears: 1.8,
        chronoAge: 15,
      });
      // effective age = 15 + 1.8 = 16.8 → U17 (threshold: 16-17)
      expect(result.effectiveBand).toBe("U17");
      expect(result.reason).toBe("phv_offset_years");
    });

    test("17yo with offset=-1.5 maps to U15 (late maturer)", () => {
      const result = resolveMaturityAdjustedAgeBand({
        chronoBand: "U17",
        phvStage: "PRE",
        phvOffsetYears: -1.5,
        chronoAge: 17,
      });
      // effective age = 17 - 1.5 = 15.5 → U15 (threshold: 14-15)
      expect(result.effectiveBand).toBe("U15");
      expect(result.reason).toBe("phv_offset_years");
    });

    test("offset_years takes precedence over phv_stage when both present", () => {
      // stage would say "shift down one band", but offset keeps the effective
      // age inside U17 — band-mapping uses `age < 18 → U17`, so 17.2 is U17.
      const result = resolveMaturityAdjustedAgeBand({
        chronoBand: "U17",
        phvStage: "PRE",
        phvOffsetYears: 0.2,
        chronoAge: 17,
      });
      expect(result.effectiveBand).toBe("U17");
      expect(result.reason).toBe("phv_offset_years");
      expect(result.shiftApplied).toBe(0);
    });

    test("offset_years large enough to cross a band boundary promotes the band", () => {
      // 16yo with offset=+2.5 → effective age 18.5 → U19
      const result = resolveMaturityAdjustedAgeBand({
        chronoBand: "U17",
        phvStage: "POST",
        phvOffsetYears: 2.5,
        chronoAge: 16,
      });
      expect(result.effectiveBand).toBe("U19");
      expect(result.reason).toBe("phv_offset_years");
    });
  });

  describe("senior bands never shift", () => {
    test("SEN + POST stays SEN", () => {
      const result = resolveMaturityAdjustedAgeBand({
        chronoBand: "SEN",
        phvStage: "POST",
      });
      expect(result.effectiveBand).toBe("SEN");
      expect(result.shiftApplied).toBe(0);
    });

    test("VET + PRE stays VET", () => {
      const result = resolveMaturityAdjustedAgeBand({
        chronoBand: "VET",
        phvStage: "PRE",
      });
      expect(result.effectiveBand).toBe("VET");
    });
  });

  describe("band clamping at extremes", () => {
    test("U13 + PRE stays U13 (can't go younger)", () => {
      const result = resolveMaturityAdjustedAgeBand({
        chronoBand: "U13",
        phvStage: "PRE",
      });
      expect(result.effectiveBand).toBe("U13");
      // shiftApplied stays -1 semantically but the band clamps
    });
  });
});

describe("Effective SD propagation (widener × base SD → percentile)", () => {
  // This is the integration guard: given a base SD and a widener multiplier,
  // confirm the resulting percentile reflects the widened distribution. This
  // test is DB-free — we pass (baseSd * multiplier) directly into
  // interpolatePercentile, which is exactly what benchmarkService does.

  const BASE_P50 = 15.2;
  const BASE_SD_UNWIDENED = 1.014; // derived from displayed UI thresholds

  test("MAS 17.67 km/h at U17: unwidened hits P99, widened (1.25x) drops to ~P96", () => {
    // Unwidened — regression of the issue the user observed
    const unwidened = interpolatePercentile(
      17.67,
      BASE_P50,
      BASE_SD_UNWIDENED,
      "higher_better"
    );
    expect(unwidened).toBe(99);

    // With U17 widener multiplier 1.25 applied (signed-off value)
    const WIDENER_U17 = 1.25;
    const widened = interpolatePercentile(
      17.67,
      BASE_P50,
      BASE_SD_UNWIDENED * WIDENER_U17,
      "higher_better"
    );
    // z = 2.47 / (1.014 * 1.25) = 2.47 / 1.2675 ≈ 1.948 → Φ(1.948) ≈ 0.9743
    expect(widened).toBeGreaterThanOrEqual(96);
    expect(widened).toBeLessThanOrEqual(98);
    expect(widened).toBeLessThan(unwidened);
  });

  test("Wider widener → percentile closer to 50 for the same raw value", () => {
    const values = [1.0, 1.25, 1.5, 2.0];
    const percentiles = values.map((w) =>
      interpolatePercentile(17.67, BASE_P50, BASE_SD_UNWIDENED * w, "higher_better")
    );

    // Monotonic: each wider multiplier should produce a percentile that's
    // ≤ the narrower one (z-score shrinks as sd grows).
    for (let i = 1; i < percentiles.length; i++) {
      expect(percentiles[i]).toBeLessThanOrEqual(percentiles[i - 1]);
    }
  });

  test("Widener < 1 (tightening) pushes elite scores higher — don't do this in prod", () => {
    // Guard the math for symmetry. A tightening multiplier (< 1) should
    // INCREASE percentile for an above-mean value. This isn't a use case
    // we support in UI (DB constraint is 0.5–3.0), but the math must be
    // consistent.
    const normal = interpolatePercentile(17.67, BASE_P50, BASE_SD_UNWIDENED, "higher_better");
    const tightened = interpolatePercentile(
      17.67,
      BASE_P50,
      BASE_SD_UNWIDENED * 0.8,
      "higher_better"
    );
    expect(tightened).toBeGreaterThanOrEqual(normal);
  });
});

describe("Chronological-band boundary (sanity)", () => {
  // Confirms the helpers don't silently corrupt the chrono band when
  // no PHV signal is present — the safe default path.

  const YOUTH_BANDS: ChronoAgeBand[] = ["U13", "U15", "U17", "U19"];
  YOUTH_BANDS.forEach((band) => {
    test(`${band} with no PHV data stays ${band}`, () => {
      const result = resolveMaturityAdjustedAgeBand({
        chronoBand: band,
        phvStage: null,
        phvOffsetYears: null,
        chronoAge: null,
      });
      expect(result.effectiveBand).toBe(band);
      expect(result.shiftApplied).toBe(0);
      expect(result.reason).toBe("none");
    });
  });
});
