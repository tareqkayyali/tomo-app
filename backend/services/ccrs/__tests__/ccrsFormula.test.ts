/**
 * CCRS Formula Engine — Unit Tests
 *
 * Tests the pure formula engine in isolation (zero I/O).
 * Validates cascade behavior, safety gates, and edge cases.
 */

import {
  calculateCCRS,
  getFreshnessMult,
  getHRVScore,
  getRHRScore,
  getSleepScore,
  getBiometricScore,
  getHooperScore,
  getACWRMultiplier,
  getPHVMultiplier,
  getCascadeWeights,
  tomoCheckinToHooper,
  type CCRSInputs,
  type BiometricInputs,
  type AthleteBaseline,
  type HooperInputs,
  type ACWRInputs,
} from '../ccrsFormula';

// ---------------------------------------------------------------------------
// Test Fixtures
// ---------------------------------------------------------------------------

const GOOD_BASELINE: AthleteBaseline = {
  hrv_mean_30d: 55,
  hrv_sd_30d: 10,
  rhr_mean_30d: 60,
  baseline_valid: true,
};

const GOOD_BIO: BiometricInputs = {
  hrv_rmssd: 60,       // Z = +0.5 → good
  rhr_bpm: 61,         // +1 from baseline → excellent
  sleep_hours: 7.5,
  data_age_hours: 4,   // fresh
};

const GOOD_HOOPER: HooperInputs = {
  sleep_quality: 4,
  energy_level: 4,
  muscle_soreness: 4,
  stress_level: 4,
  motivation: 4,
  athlete_age: 16,
};

function makeInputs(overrides: Partial<CCRSInputs> = {}): CCRSInputs {
  return {
    biometric: GOOD_BIO,
    baseline: GOOD_BASELINE,
    hooper: GOOD_HOOPER,
    acwr: null,
    phv_stage: 'adult',
    coach_phase_score: null,
    historical_score: 62,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CCRS Formula Engine', () => {
  // 1. Full data fresh → CCRS ≥ 70 for good inputs
  test('full fresh data with good inputs produces CCRS ≥ 70', () => {
    const result = calculateCCRS(makeInputs());
    expect(result.ccrs).toBeGreaterThanOrEqual(70);
    expect(result.confidence).toBe('very_high');
    expect(result.recommendation).not.toBe('recovery');
    expect(result.recommendation).not.toBe('blocked');
  });

  // 2. No biometric → weights shift to hooper ≥ 0.60
  test('no biometric data shifts hooper weight to ≥ 0.60', () => {
    const result = calculateCCRS(makeInputs({ biometric: null }));
    expect(result.weights.hooper).toBeGreaterThanOrEqual(0.60);
    expect(result.weights.biometric).toBe(0);
    expect(result.alert_flags).toContain('NO_BIOMETRIC');
  });

  // 3. ACWR > 2.0 → score hard-capped at 40, ACWR_BLOCKED flag
  test('ACWR > 2.0 hard-caps score at 40 with ACWR_BLOCKED flag', () => {
    const dangerousACWR: ACWRInputs = {
      acute_load_7d: 2100,
      chronic_load_28d: 2800,  // chronic_weekly = 700, ratio = 3.0
    };
    const result = calculateCCRS(makeInputs({ acwr: dangerousACWR }));
    expect(result.ccrs).toBeLessThanOrEqual(40);
    expect(result.alert_flags).toContain('ACWR_BLOCKED');
    expect(result.recommendation).toBe('blocked');
  });

  // 4. mid_phv → final score is 0.85× of adult equivalent
  test('mid_phv applies 0.85 multiplier vs adult', () => {
    const adultResult = calculateCCRS(makeInputs({ phv_stage: 'adult' }));
    const phvResult = calculateCCRS(makeInputs({ phv_stage: 'mid_phv' }));

    // PHV multiplier: adult = 1.0, mid_phv = 0.85
    // Score should be approximately 85% of adult score
    const ratio = phvResult.ccrs / adultResult.ccrs;
    expect(ratio).toBeCloseTo(0.85, 1);
    expect(phvResult.alert_flags).toContain('PHV_CAP_ACTIVE');
    expect(phvResult.components.phv_multiplier).toBe(0.85);
  });

  // 5. Cold start (baseline_valid=false) → confidence = 'estimated'
  test('cold start baseline produces estimated confidence', () => {
    const coldBaseline: AthleteBaseline = {
      hrv_mean_30d: 50,
      hrv_sd_30d: 8,
      rhr_mean_30d: 62,
      baseline_valid: false,
    };
    const result = calculateCCRS(makeInputs({ baseline: coldBaseline }));
    expect(result.confidence).toBe('estimated');
    expect(result.alert_flags).toContain('COLD_START');
  });

  // 6. No checkin + no biometric → confidence low or estimated, historical weight = 1.0
  test('no checkin and no biometric falls back to historical with low confidence', () => {
    const result = calculateCCRS(
      makeInputs({ biometric: null, hooper: null, baseline: null }),
    );
    expect(result.weights.historical).toBe(1);
    expect(result.weights.biometric).toBe(0);
    expect(result.weights.hooper).toBe(0);
    expect(result.ccrs).toBeCloseTo(62, 0); // historical_score default
    expect(result.alert_flags).toContain('NO_BIOMETRIC');
    expect(result.alert_flags).toContain('NO_CHECKIN');
    // With no baseline at all, confidence should be estimated
    expect(result.confidence).toBe('estimated');
  });

  // 7. Sleep < 6h → SLEEP_DEFICIT flag
  test('sleep under 6 hours triggers SLEEP_DEFICIT flag', () => {
    const poorSleepBio: BiometricInputs = {
      ...GOOD_BIO,
      sleep_hours: 5,
    };
    const result = calculateCCRS(makeInputs({ biometric: poorSleepBio }));
    expect(result.alert_flags).toContain('SLEEP_DEFICIT');
  });

  // 8. Freshness 30h → FM = 0.15, biometric weight heavily discounted
  test('30-hour stale data produces FM = 0.15 and low biometric weight', () => {
    expect(getFreshnessMult(30)).toBe(0.15);

    const staleBio: BiometricInputs = {
      ...GOOD_BIO,
      data_age_hours: 30,
    };
    const result = calculateCCRS(makeInputs({ biometric: staleBio }));
    // Bio weight should be 0.55 * 0.15 (proportional downscale)
    expect(result.weights.biometric).toBeLessThan(0.15);
    expect(result.components.freshness_mult).toBe(0.15);
  });

  // 9. Weight sum assertion: biometric + hooper + historical + coach === 1.0 (±0.001)
  test('cascade weights always sum to exactly 1.0', () => {
    const scenarios: Parameters<typeof getCascadeWeights>[0][] = [
      { bio_available: true, freshness_mult: 1.0, checkin_available: true, coach_available: true },
      { bio_available: true, freshness_mult: 1.0, checkin_available: true, coach_available: false },
      { bio_available: true, freshness_mult: 0.5, checkin_available: true, coach_available: false },
      { bio_available: true, freshness_mult: 0.15, checkin_available: false, coach_available: false },
      { bio_available: false, freshness_mult: 0, checkin_available: true, coach_available: false },
      { bio_available: false, freshness_mult: 0, checkin_available: false, coach_available: false },
      { bio_available: false, freshness_mult: 0, checkin_available: true, coach_available: true },
      { bio_available: true, freshness_mult: 0.75, checkin_available: false, coach_available: true },
    ];

    for (const scenario of scenarios) {
      const w = getCascadeWeights(scenario);
      const sum = w.biometric + w.hooper + w.historical + w.coach;
      expect(sum).toBeCloseTo(1.0, 3);
    }
  });

  // 10. calculateCCRS is deterministic for identical inputs
  test('calculateCCRS is deterministic', () => {
    const inputs = makeInputs();
    const a = calculateCCRS(inputs);
    const b = calculateCCRS(inputs);
    expect(a).toEqual(b);
  });
});

// ---------------------------------------------------------------------------
// Sub-function tests
// ---------------------------------------------------------------------------

describe('getFreshnessMult', () => {
  test('fresh data (< 8h) returns 1.0', () => {
    expect(getFreshnessMult(0)).toBe(1.0);
    expect(getFreshnessMult(7)).toBe(1.0);
  });

  test('aging data (8-48h) returns decreasing values', () => {
    expect(getFreshnessMult(10)).toBe(0.75);
    expect(getFreshnessMult(20)).toBe(0.45);
    expect(getFreshnessMult(30)).toBe(0.15);
  });

  test('expired data (≥ 48h) returns 0', () => {
    expect(getFreshnessMult(48)).toBe(0);
    expect(getFreshnessMult(100)).toBe(0);
  });
});

describe('getHRVScore', () => {
  test('Z = 0 (at mean) → 70', () => {
    expect(getHRVScore(55, 55, 10)).toBe(70);
  });

  test('Z = +2 → 100', () => {
    expect(getHRVScore(75, 55, 10)).toBe(100);
  });

  test('Z = -1 → 50', () => {
    expect(getHRVScore(45, 55, 10)).toBe(50);
  });

  test('degenerate baseline (sd=0) → 60', () => {
    expect(getHRVScore(50, 55, 0)).toBe(60);
  });
});

describe('getACWRMultiplier', () => {
  test('sweet spot (0.8-1.3) → multiplier 1.0', () => {
    const result = getACWRMultiplier({ acute_load_7d: 700, chronic_load_28d: 2800 });
    expect(result.multiplier).toBe(1.0);
    expect(result.zone).toBe('sweet_spot');
  });

  test('blocked (>2.0) → multiplier 0.4, hard_cap true', () => {
    const result = getACWRMultiplier({ acute_load_7d: 2100, chronic_load_28d: 2800 });
    expect(result.multiplier).toBe(0.4);
    expect(result.hard_cap).toBe(true);
    expect(result.zone).toBe('blocked');
  });

  test('zero chronic → ratio defaults to 1.0 (sweet spot)', () => {
    const result = getACWRMultiplier({ acute_load_7d: 500, chronic_load_28d: 0 });
    expect(result.acwr_value).toBe(1.0);
    expect(result.zone).toBe('sweet_spot');
  });
});

describe('getPHVMultiplier', () => {
  test.each([
    ['pre_phv' as const, 1.00],
    ['mid_phv' as const, 0.85],
    ['post_phv' as const, 0.95],
    ['adult' as const, 1.00],
    ['unknown' as const, 0.90],
  ])('%s → %f', (stage, expected) => {
    expect(getPHVMultiplier(stage)).toBe(expected);
  });
});

describe('tomoCheckinToHooper', () => {
  test('maps 1-10 scale to 1-5 correctly', () => {
    const result = tomoCheckinToHooper({
      energy: 8,
      soreness: 2,      // low soreness = high score in Hooper
      mood: 7,
      sleepHours: 8,
      academicStress: 3, // low stress = high score in Hooper
      athlete_age: 16,
    });
    expect(result.energy_level).toBe(4);       // 8/2 = 4
    expect(result.muscle_soreness).toBe(5);    // (11-2)/2 = 4.5 → ceil = 5
    expect(result.sleep_quality).toBe(4);      // 8h = quality 4
    expect(result.stress_level).toBe(4);       // (11-3)/2 = 4
    expect(result.motivation).toBe(4);         // mood-derived: 7/2 = 3.5 → 4
    expect(result.athlete_age).toBe(16);
  });

  test('clamps values to 1-5 range', () => {
    const low = tomoCheckinToHooper({
      energy: 1, soreness: 10, mood: 1, sleepHours: 4,
      academicStress: 10, athlete_age: 15,
    });
    expect(low.energy_level).toBeGreaterThanOrEqual(1);
    expect(low.muscle_soreness).toBeGreaterThanOrEqual(1);
    expect(low.stress_level).toBeGreaterThanOrEqual(1);
    expect(low.motivation).toBeGreaterThanOrEqual(1);

    const high = tomoCheckinToHooper({
      energy: 10, soreness: 1, mood: 10, sleepHours: 10,
      academicStress: 1, athlete_age: 15,
    });
    expect(high.energy_level).toBeLessThanOrEqual(5);
    expect(high.muscle_soreness).toBeLessThanOrEqual(5);
    expect(high.stress_level).toBeLessThanOrEqual(5);
    expect(high.motivation).toBeLessThanOrEqual(5);
  });
});
