/**
 * Test Group Constants — Shared definitions for the 7 physical mastery pillars.
 *
 * Used by:
 *   - /api/v1/output/snapshot (existing Output page)
 *   - /api/v1/mastery/snapshot (new Mastery page)
 */

// ── Test Group Definitions ─────────────────────────────────────────────

export interface TestGroupDef {
  groupId: string;
  displayName: string;
  emoji: string;
  colorTheme: string;
  priority: number;
  athleteDescription: string;
}

export const TEST_GROUPS: TestGroupDef[] = [
  {
    groupId: "speed_acceleration", displayName: "Speed & Acceleration", emoji: "⚡",
    colorTheme: "yellow", priority: 1,
    athleteDescription: "How fast you explode off the mark and reach top pace. The first 10m usually wins or loses the ball.",
  },
  {
    groupId: "power_explosiveness", displayName: "Power & Explosiveness", emoji: "💥",
    colorTheme: "orange", priority: 2,
    athleteDescription: "How explosively your muscles work — winning headers, sharp direction changes, and leaping for goal.",
  },
  {
    groupId: "agility_cod", displayName: "Agility & Change of Direction", emoji: "🔀",
    colorTheme: "teal", priority: 3,
    athleteDescription: "How quickly you stop, turn, and re-accelerate. The harder you are to defend against.",
  },
  {
    groupId: "aerobic_endurance", displayName: "Aerobic Engine", emoji: "🫁",
    colorTheme: "blue", priority: 4,
    athleteDescription: "Your engine size — how long you can keep going at high intensity without fading.",
  },
  {
    groupId: "strength", displayName: "Strength", emoji: "💪",
    colorTheme: "red", priority: 5,
    athleteDescription: "Your raw force production — the foundation that supports speed, power, and injury resistance.",
  },
  {
    groupId: "mobility_movement", displayName: "Mobility & Movement Quality", emoji: "🧘",
    colorTheme: "green", priority: 6,
    athleteDescription: "How well your body moves through its full range — protects joints and unlocks athletic potential.",
  },
  {
    groupId: "body_composition", displayName: "Body Composition", emoji: "📐",
    colorTheme: "purple", priority: 7,
    athleteDescription: "Your body's physical makeup — the structural foundation everything else is built on.",
  },
];

// ── Benchmark Metric Key → Test Group Mapping ──────────────────────────

/** Maps benchmark metric keys (from player_benchmark_snapshots) to test group IDs */
export const TEST_GROUP_MAP: Record<string, string> = {
  // Speed & Acceleration
  sprint_10m: "speed_acceleration",
  sprint_20m: "speed_acceleration",
  sprint_30m: "speed_acceleration",
  est_max_speed: "speed_acceleration",
  // Power & Explosiveness
  cmj: "power_explosiveness",
  est_power: "power_explosiveness",
  broad_jump: "power_explosiveness",
  shot_speed: "power_explosiveness",
  // Agility & CoD
  agility_505: "agility_cod",
  dribbling_test: "agility_cod",
  reaction_time: "agility_cod",
  passing_accuracy: "agility_cod",
  shooting_accuracy: "agility_cod",
  shuttle_run: "agility_cod",
  // Aerobic Engine
  vo2max: "aerobic_endurance",
  // Strength
  grip_strength: "strength",
  squat_rel: "strength",
  // Body Composition
  body_fat_pct: "body_composition",
};

// ── Raw Test Type → Test Group Mapping ─────────────────────────────────

/** Maps raw test catalog IDs (from phone_test_sessions.test_type) to test group IDs */
export const RAW_TEST_GROUP_MAP: Record<string, string> = {
  // Speed & Acceleration
  "10m-sprint": "speed_acceleration",
  "20m-sprint": "speed_acceleration",
  "30m-sprint": "speed_acceleration",
  "flying-10m": "speed_acceleration",
  "max-speed": "speed_acceleration",
  // Power & Explosiveness
  "cmj": "power_explosiveness",
  "vertical-jump": "power_explosiveness",
  "squat-jump": "power_explosiveness",
  "drop-jump": "power_explosiveness",
  "broad-jump": "power_explosiveness",
  "jump-height": "power_explosiveness",
  // Agility & CoD
  "5-0-5": "agility_cod",
  "5-10-5-agility": "agility_cod",
  "t-test": "agility_cod",
  "illinois-agility": "agility_cod",
  "pro-agility": "agility_cod",
  "arrowhead-agility": "agility_cod",
  "reaction-time": "agility_cod",
  "choice-reaction": "agility_cod",
  "reaction-tap": "agility_cod",
  // Aerobic Engine
  "yoyo-ir1": "aerobic_endurance",
  "beep-test": "aerobic_endurance",
  "vo2max": "aerobic_endurance",
  "cooper-12min": "aerobic_endurance",
  // Strength
  "1rm-squat": "strength",
  "squat-relative": "strength",
  "squat-1rm": "strength",
  "grip-strength": "strength",
  // Body Composition
  "body-fat": "body_composition",
  // Recovery (mapped but not a main pillar)
  "hrv": "recovery_readiness",
};

// ── Radar Axis Colors ──────────────────────────────────────────────────

export const RADAR_AXIS_COLORS: Record<string, string> = {
  speed_acceleration: "#FFD60A",
  power_explosiveness: "#FF6B35",
  agility_cod: "#00D9FF",
  aerobic_endurance: "#3498DB",
  strength: "#E74C3C",
  mobility_body: "#30D158",
};

// ── Radar Axis Mapping ─────────────────────────────────────────────────

export const RADAR_AXIS_MAP: Record<string, { label: string; color: string; groupIds: string[] }> = {
  pace: { label: "PAC", color: RADAR_AXIS_COLORS.speed_acceleration, groupIds: ["speed_acceleration"] },
  power: { label: "POW", color: RADAR_AXIS_COLORS.power_explosiveness, groupIds: ["power_explosiveness"] },
  agility: { label: "AGI", color: RADAR_AXIS_COLORS.agility_cod, groupIds: ["agility_cod"] },
  endurance: { label: "END", color: RADAR_AXIS_COLORS.aerobic_endurance, groupIds: ["aerobic_endurance"] },
  strength: { label: "STR", color: RADAR_AXIS_COLORS.strength, groupIds: ["strength"] },
  mobility: { label: "MOB", color: RADAR_AXIS_COLORS.mobility_body, groupIds: ["mobility_movement", "body_composition"] },
};

// ── Helper: Category Summary ───────────────────────────────────────────

export function buildCategorySummary(category: string, percentile: number): string {
  if (percentile >= 90) return `Your ${category} is elite — top 10% for your age. Keep it up.`;
  if (percentile >= 75) return `Strong ${category} — you're above most players your age. Small gains could push you to elite.`;
  if (percentile >= 50) return `Your ${category} is solid — right around average. Consistent work will move the needle.`;
  if (percentile >= 25) return `${category} has room to grow. Targeted training can make a real difference here.`;
  return `${category} is a priority area. Talk to your coach about a focused plan.`;
}
