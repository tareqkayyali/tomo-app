/**
 * Unit tests for the rollout cohort assignment. These test the hash
 * function's determinism + distribution properties, plus all the edge
 * cases around missing athlete context and sport filtering.
 */

import { isInRollout, stableBucket } from "../../services/config/rollout";

describe("stableBucket", () => {
  test("deterministic — same input always maps to the same bucket", () => {
    const a = stableBucket("athlete-abc|ccrs_formula_v1");
    const b = stableBucket("athlete-abc|ccrs_formula_v1");
    expect(a).toBe(b);
  });

  test("different inputs map to (statistically) different buckets", () => {
    const a = stableBucket("athlete-abc|ccrs_formula_v1");
    const b = stableBucket("athlete-xyz|ccrs_formula_v1");
    // Not guaranteed for every pair, but wildly unlikely for two different
    // inputs to collide. If this ever fails, the hash is broken.
    expect(a).not.toBe(b);
  });

  test("buckets are in [0, 100)", () => {
    for (let i = 0; i < 500; i++) {
      const b = stableBucket(`athlete-${i}|ccrs_formula_v1`);
      expect(b).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThan(100);
    }
  });

  test("distribution is roughly uniform across 500 inputs", () => {
    // With 500 samples and 10 buckets of width 10, each bucket should see
    // ~50 ± a few. Check that no bucket is starved below 20 or over 100.
    const counts = new Array(10).fill(0);
    for (let i = 0; i < 500; i++) {
      const b = stableBucket(`athlete-${i}|ccrs_formula_v1`);
      counts[Math.floor(b / 10)]++;
    }
    for (const c of counts) {
      expect(c).toBeGreaterThan(20);
      expect(c).toBeLessThan(100);
    }
  });
});

describe("isInRollout", () => {
  const base = {
    configKey:    "ccrs_formula_v1",
    athleteSport: "football",
    sportFilter:  null,
  };

  test("rollout_percentage = 100 + no sport filter → always true", () => {
    expect(
      isInRollout({ ...base, athleteId: "a", rolloutPercentage: 100 }),
    ).toBe(true);
  });

  test("rollout_percentage = 0 → always false", () => {
    expect(
      isInRollout({ ...base, athleteId: "a", rolloutPercentage: 0 }),
    ).toBe(false);
  });

  test("athleteId undefined + rollout < 100 → false (safe unknown)", () => {
    expect(
      isInRollout({
        ...base,
        athleteId:         undefined,
        rolloutPercentage: 50,
      }),
    ).toBe(false);
  });

  test("athleteId undefined + rollout = 100 + no sport filter → true", () => {
    expect(
      isInRollout({
        ...base,
        athleteId:         undefined,
        rolloutPercentage: 100,
      }),
    ).toBe(true);
  });

  test("sport filter set but athlete's sport missing → false", () => {
    expect(
      isInRollout({
        ...base,
        athleteId:    "a",
        athleteSport: null,
        rolloutPercentage: 100,
        sportFilter:  ["football"],
      }),
    ).toBe(false);
  });

  test("sport filter set, athlete in filter → true", () => {
    expect(
      isInRollout({
        ...base,
        athleteId:         "a",
        rolloutPercentage: 100,
        sportFilter:       ["football", "padel"],
      }),
    ).toBe(true);
  });

  test("sport filter set, athlete NOT in filter → false", () => {
    expect(
      isInRollout({
        ...base,
        athleteId:         "a",
        athleteSport:      "tennis",
        rolloutPercentage: 100,
        sportFilter:       ["football"],
      }),
    ).toBe(false);
  });

  test("same athlete is stably assigned across repeated calls at a given %", () => {
    // An athlete should never flip between "in rollout" and "out" on
    // successive reads at an unchanged rollout_percentage.
    const id = "stable-athlete-id";
    const pct = 30;
    const results = Array.from({ length: 10 }, () =>
      isInRollout({ ...base, athleteId: id, rolloutPercentage: pct }),
    );
    const unique = new Set(results);
    expect(unique.size).toBe(1);
  });

  test("rollout percentage widening only adds athletes, never removes", () => {
    // If an athlete is in the cohort at 40%, they must stay in the cohort
    // at 60%, 80%, 100%. Guards against hash-bucket drift bugs.
    const id = "athlete-mono";
    const in30  = isInRollout({ ...base, athleteId: id, rolloutPercentage: 30 });
    const in60  = isInRollout({ ...base, athleteId: id, rolloutPercentage: 60 });
    const in100 = isInRollout({ ...base, athleteId: id, rolloutPercentage: 100 });

    // The rule: monotone in rollout_percentage for a fixed athlete.
    if (in30) expect(in60).toBe(true);
    if (in60) expect(in100).toBe(true);
    // Always in at 100
    expect(in100).toBe(true);
  });

  test("approximately rolloutPercentage % of athletes pass at a given %", () => {
    const pct = 40;
    let hits = 0;
    const trials = 500;
    for (let i = 0; i < trials; i++) {
      if (
        isInRollout({
          ...base,
          athleteId:         `athlete-${i}`,
          rolloutPercentage: pct,
        })
      ) hits++;
    }
    // Expected 200 ± ~30 at n=500. Accept wide band to stay deterministic.
    expect(hits).toBeGreaterThan(150);
    expect(hits).toBeLessThan(250);
  });
});
