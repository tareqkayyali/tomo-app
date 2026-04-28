/**
 * applyInjuryGate — active-injury category filter for program recommendations.
 *
 * Covers:
 *   - RED + hip location blocks sprint/plyometric/agility/sled/power.
 *   - Injury-prevention categories (nordic, hip_mobility, …) survive the block.
 *   - GREEN flag is a no-op.
 *   - Side prefixes (upper_right_hip) normalise to the canonical region.
 *   - Unrecognised regions emit a review rule but block nothing.
 */

import {
  applyInjuryGate,
  parseInjuryLocations,
  normaliseRegion,
} from "../../services/programs/programGuardrails";

type P = { programId: string; category: string };

const programs: P[] = [
  { programId: "sprint_linear_10_30", category: "sprint" },
  { programId: "sprint_flying_20_40", category: "sprint" },
  { programId: "agility_cod", category: "agility" },
  { programId: "agility_reactive", category: "agility" },
  { programId: "plyo_lower_body", category: "plyometric" },
  { programId: "power_olympic_lifts", category: "power" },
  { programId: "tech_passing_short", category: "passing" },
  { programId: "tech_shooting", category: "shooting" },
  { programId: "nordic_hamstring_protocol", category: "nordic" },
  { programId: "mobility_hip_ankle", category: "hip_mobility" },
];

describe("applyInjuryGate", () => {
  it("blocks lower-body load categories when RED + hip location", () => {
    const snap = {
      injuryRiskFlag: "RED",
      activeInjuryCount: 1,
      injuryLocations: JSON.stringify(["upper_right_hip"]),
    };
    const res = applyInjuryGate(programs, snap as any);
    const ids = res.programs.map((p) => p.programId);

    // Sprint, agility, plyometric, power excluded
    expect(ids).not.toContain("sprint_linear_10_30");
    expect(ids).not.toContain("sprint_flying_20_40");
    expect(ids).not.toContain("agility_cod");
    expect(ids).not.toContain("plyo_lower_body");
    expect(ids).not.toContain("power_olympic_lifts");

    // Technical work survives
    expect(ids).toContain("tech_passing_short");
    expect(ids).toContain("tech_shooting");

    // Injury prevention survives even when category is in the block list
    expect(ids).toContain("nordic_hamstring_protocol");
    expect(ids).toContain("mobility_hip_ankle");

    expect(res.blockedCategories).toEqual(
      expect.arrayContaining(["sprint", "agility", "plyometric", "power"])
    );
    expect(res.appliedRules.join("\n")).toMatch(/Hip concern logged/i);
  });

  it("is a no-op when injuryRiskFlag is GREEN", () => {
    const snap = {
      injuryRiskFlag: "GREEN",
      activeInjuryCount: 0,
      injuryLocations: "[]",
    };
    const res = applyInjuryGate(programs, snap as any);
    expect(res.programs).toHaveLength(programs.length);
    expect(res.appliedRules).toEqual([]);
    expect(res.blockedCategories).toEqual([]);
  });

  it("is a no-op when activeInjuryCount is 0 even if flag is RED", () => {
    const snap = {
      injuryRiskFlag: "RED",
      activeInjuryCount: 0,
      injuryLocations: "[]",
    };
    const res = applyInjuryGate(programs, snap as any);
    expect(res.programs).toHaveLength(programs.length);
  });

  it("emits a review rule for unrecognised regions and blocks nothing", () => {
    const snap = {
      injuryRiskFlag: "RED",
      activeInjuryCount: 1,
      injuryLocations: JSON.stringify(["pinky_toenail"]),
    };
    const res = applyInjuryGate(programs, snap as any);
    expect(res.programs).toHaveLength(programs.length);
    expect(res.blockedCategories).toEqual([]);
    expect(res.appliedRules.join("\n")).toMatch(/unrecognised region "pinky_toenail"/);
  });

  it("accepts already-parsed arrays as well as JSON strings", () => {
    const snapStr = {
      injuryRiskFlag: "RED",
      activeInjuryCount: 1,
      injuryLocations: '["left_knee"]',
    };
    const snapArr = {
      injuryRiskFlag: "RED",
      activeInjuryCount: 1,
      injuryLocations: ["left_knee"],
    };
    expect(applyInjuryGate(programs, snapStr as any).blockedCategories).toEqual(
      applyInjuryGate(programs, snapArr as any).blockedCategories
    );
  });
});

describe("parseInjuryLocations", () => {
  it("handles JSON strings", () => {
    expect(parseInjuryLocations('["upper_right_hip","left_knee"]')).toEqual([
      "hip",
      "knee",
    ]);
  });

  it("handles raw arrays", () => {
    expect(parseInjuryLocations(["right_ankle"])).toEqual(["ankle"]);
  });

  it("returns [] for null / invalid JSON / non-arrays", () => {
    expect(parseInjuryLocations(null)).toEqual([]);
    expect(parseInjuryLocations("not-json")).toEqual([]);
    expect(parseInjuryLocations(42)).toEqual([]);
    expect(parseInjuryLocations({})).toEqual([]);
  });

  it("dedupes after normalisation", () => {
    expect(
      parseInjuryLocations(["upper_right_hip", "left_hip", "hip"]).sort()
    ).toEqual(["hip"]);
  });
});

describe("normaliseRegion", () => {
  it.each([
    ["upper_right_hip", "hip"],
    ["LOWER_LEFT_back", "back"],
    ["right_knee", "knee"],
    ["lower_back", "back"],
    ["upper_back", "back"],
    ["achilles", "calf"],
    ["Hip", "hip"],
    ["  groin  ", "groin"],
  ])("normalises %s → %s", (input, expected) => {
    expect(normaliseRegion(input)).toBe(expected);
  });
});
