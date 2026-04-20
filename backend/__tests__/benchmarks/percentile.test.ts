/**
 * Unit tests for interpolatePercentile — the percentile math at the heart of
 * the Mastery / Output benchmark cards. Replaces a logistic-CDF approximation
 * (logistic(1.7·z)) with an erf-based standard-normal CDF.
 *
 * Why these cases:
 *  - z=0, ±1.282, ±2.326 are the textbook P50/P10/P90/P1/P99 boundaries.
 *    The old logistic drifted ~1 pt at |z|≈2.
 *  - The MAS Running 17.67 km/h / U17 case is the real-world scenario from
 *    the April 2026 user report ("why is 17.67 km/h showing P99?").
 *  - sd=0 and the lower_better inversion are the two structural branches
 *    most likely to regress on a rewrite.
 */

import {
  interpolatePercentile,
  getPercentileZone,
} from "../../scripts/seeds/football_benchmark_seed";

describe("interpolatePercentile — standard normal CDF", () => {
  describe("boundary z-scores (higher_better)", () => {
    test("z=0 → P50", () => {
      expect(interpolatePercentile(50, 50, 10, "higher_better")).toBe(50);
    });

    test("z≈+1.282 → P90", () => {
      // value = p50 + 1.282*sd
      expect(interpolatePercentile(62.82, 50, 10, "higher_better")).toBe(90);
    });

    test("z≈-1.282 → P10", () => {
      expect(interpolatePercentile(37.18, 50, 10, "higher_better")).toBe(10);
    });

    test("z≈+2.326 → P99", () => {
      expect(interpolatePercentile(73.26, 50, 10, "higher_better")).toBe(99);
    });

    test("z≈-2.326 → P1", () => {
      expect(interpolatePercentile(26.74, 50, 10, "higher_better")).toBe(1);
    });
  });

  describe("lower_better inversion", () => {
    test("value below p50 ranks ABOVE P50 when lower_better", () => {
      // 5s sprint against a 6s p50 with 0.5s sd → z=+2 → should be P~98
      const pct = interpolatePercentile(5, 6, 0.5, "lower_better");
      expect(pct).toBeGreaterThanOrEqual(97);
      expect(pct).toBeLessThanOrEqual(98);
    });

    test("value equal to p50 is P50 regardless of direction", () => {
      expect(interpolatePercentile(6, 6, 0.5, "lower_better")).toBe(50);
      expect(interpolatePercentile(6, 6, 0.5, "higher_better")).toBe(50);
    });

    test("value above p50 ranks BELOW P50 when lower_better", () => {
      const pct = interpolatePercentile(7, 6, 0.5, "lower_better");
      expect(pct).toBeLessThan(50);
    });
  });

  describe("guards and clamping", () => {
    test("sd=0 short-circuits to P50 (avoids division-by-zero)", () => {
      expect(interpolatePercentile(17.67, 15.2, 0, "higher_better")).toBe(50);
    });

    test("extremely high z clamps to P99 (UI cannot render P100)", () => {
      expect(interpolatePercentile(100, 50, 10, "higher_better")).toBe(99);
    });

    test("extremely low z clamps to P1", () => {
      expect(interpolatePercentile(-100, 50, 10, "higher_better")).toBe(1);
    });
  });

  describe("real-world MAS Running 17.67 km/h (2026-04-20 regression case)", () => {
    // These are the U17 ALL-position thresholds the UI displayed:
    // Needs Attention 13.9 / Developing 14.5 / Solid 15.2 / Strong 15.9 / Elite 16.5.
    // Derived sd ≈ (16.5 - 15.2) / 1.282 ≈ 1.014.
    const p50 = 15.2;
    const sd = (16.5 - 15.2) / 1.282;

    test("17.67 km/h is mathematically P99 against these U17 norms", () => {
      // z ≈ (17.67 - 15.2) / 1.014 ≈ 2.436. True Φ(2.436) ≈ 0.9926.
      // Prior logistic(1.7·z) returned ~98 for the same input; the erf CDF
      // returns the textbook-correct 99 — this is not the fix for "feels too
      // hot"; it's the fix for the math being wrong. If product wants this
      // case to render lower, that's a norm-calibration change (wider sd),
      // not a CDF change.
      const pct = interpolatePercentile(17.67, p50, sd, "higher_better");
      expect(pct).toBe(99);
    });

    test("a mid-elite MAS (z≈1.5) lands around P93, not P97", () => {
      // Regression guard against a future re-introduction of logistic(1.7·z):
      // that approximation returned ~93 here, but the textbook normal CDF
      // returns ~93 too — so this test pins down the shared behaviour.
      // The meaningful divergence was at |z|≈2 (see case above).
      const value = p50 + 1.5 * sd;
      const pct = interpolatePercentile(value, p50, sd, "higher_better");
      expect(pct).toBeGreaterThanOrEqual(92);
      expect(pct).toBeLessThanOrEqual(94);
    });

    test("P99 maps to the 'elite' zone label", () => {
      expect(getPercentileZone(99)).toBe("elite");
    });

    test("P89 is NOT elite (zone boundary is 90, not 85)", () => {
      expect(getPercentileZone(89)).toBe("good");
      expect(getPercentileZone(90)).toBe("elite");
    });
  });

  describe("monotonicity", () => {
    test("higher value → higher or equal percentile (higher_better)", () => {
      const a = interpolatePercentile(55, 50, 10, "higher_better");
      const b = interpolatePercentile(60, 50, 10, "higher_better");
      const c = interpolatePercentile(65, 50, 10, "higher_better");
      expect(a).toBeLessThanOrEqual(b);
      expect(b).toBeLessThanOrEqual(c);
    });

    test("higher value → lower or equal percentile (lower_better)", () => {
      const a = interpolatePercentile(5.0, 6, 0.5, "lower_better");
      const b = interpolatePercentile(6.0, 6, 0.5, "lower_better");
      const c = interpolatePercentile(7.0, 6, 0.5, "lower_better");
      expect(a).toBeGreaterThanOrEqual(b);
      expect(b).toBeGreaterThanOrEqual(c);
    });
  });
});
