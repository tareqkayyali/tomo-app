import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/apiAuth";
import { upsertUIConfig } from "@/services/admin/uiConfigAdminService";
import { supabaseAdmin } from "@/lib/supabase/admin";

const CONFIG_KEY = "mastery_pillars";

const DEFAULT_PILLARS = [
  {
    id: "speed_acceleration",
    name: "Speed & Acceleration",
    emoji: "\u26A1",
    colorTheme: "yellow",
    enabled: true,
    priority: 1,
    athleteDescription:
      "How fast you explode off the mark and reach top pace. The first 10m usually wins or loses the ball.",
    metrics: [
      { key: "sprint_10m", label: "10m Sprint", weight: 1.0 },
      { key: "sprint_20m", label: "20m Sprint", weight: 1.0 },
      { key: "flying_20m", label: "Flying 20m Sprint", weight: 0.8 },
      { key: "sprint_30m", label: "30m Sprint", weight: 0.7 },
      { key: "est_max_speed", label: "Max Sprint Speed", weight: 0.5 },
    ],
  },
  {
    id: "power_explosiveness",
    name: "Power & Explosiveness",
    emoji: "\uD83D\uDCA5",
    colorTheme: "orange",
    enabled: true,
    priority: 2,
    athleteDescription:
      "How explosively your muscles work \u2014 winning headers, sharp direction changes, and leaping for goal.",
    metrics: [
      { key: "cmj", label: "Standing Vertical Jump", weight: 1.0 },
      { key: "broad_jump", label: "Broad Jump", weight: 1.0 },
      { key: "vertical_jump", label: "Vertical Jump", weight: 0.9 },
      { key: "sl_broad_jump_r", label: "SL Broad Jump R", weight: 0.8 },
      { key: "sl_broad_jump_l", label: "SL Broad Jump L", weight: 0.8 },
      { key: "seated_mb_throw", label: "Seated MB Throw", weight: 0.7 },
      { key: "glycolytic_power", label: "Glycolytic Power", weight: 0.7 },
      { key: "shot_speed", label: "Shot Power", weight: 0.5 },
    ],
  },
  {
    id: "agility_cod",
    name: "Agility & Change of Direction",
    emoji: "\uD83D\uDD00",
    colorTheme: "teal",
    enabled: true,
    priority: 3,
    athleteDescription:
      "How quickly you stop, turn, and re-accelerate. The harder you are to defend against.",
    metrics: [
      { key: "agility_505", label: "5-0-5 Agility", weight: 1.0 },
      { key: "agility_ttest", label: "T-Test Agility", weight: 1.0 },
      { key: "agility_5105", label: "5-10-5 Agility", weight: 1.0 },
      { key: "illinois_agility", label: "Illinois Agility", weight: 0.8 },
      { key: "dribbling_test", label: "Dribbling Test", weight: 0.8 },
      { key: "reaction_time", label: "Reaction Time", weight: 0.6 },
    ],
  },
  {
    id: "aerobic_endurance",
    name: "Aerobic Engine",
    emoji: "\uD83E\uDEC1",
    colorTheme: "blue",
    enabled: true,
    priority: 4,
    athleteDescription:
      "Your engine size \u2014 how long you can keep going at high intensity without fading.",
    metrics: [
      { key: "vo2max", label: "Yo-Yo IR1", weight: 1.0 },
      { key: "mas_running", label: "MAS Running", weight: 1.0 },
    ],
  },
  {
    id: "strength",
    name: "Strength",
    emoji: "\uD83D\uDCAA",
    colorTheme: "red",
    enabled: true,
    priority: 5,
    athleteDescription:
      "Your raw force production \u2014 the foundation that supports speed, power, and injury resistance.",
    metrics: [
      { key: "squat_1rm", label: "1RM Squat", weight: 1.0 },
      { key: "bench_1rm", label: "1RM Bench Press", weight: 1.0 },
      { key: "grip_strength", label: "Grip Strength", weight: 0.5 },
    ],
  },
  {
    id: "mobility_movement",
    name: "Mobility & Movement Quality",
    emoji: "\uD83E\uDDD8",
    colorTheme: "green",
    enabled: true,
    priority: 6,
    athleteDescription:
      "Your body's range of motion and movement efficiency \u2014 prevents injury and improves performance.",
    metrics: [],
  },
  {
    id: "body_composition",
    name: "Body Composition",
    emoji: "\uD83D\uDCD0",
    colorTheme: "purple",
    enabled: true,
    priority: 7,
    athleteDescription:
      "Your body's physical makeup \u2014 lean mass, body fat, and growth tracking.",
    metrics: [{ key: "body_fat_pct", label: "Body Fat %", weight: 1.0 }],
  },
];

const DEFAULT_RADAR_AXES = [
  {
    key: "pace",
    label: "PAC",
    color: "#FFD60A",
    pillarIds: ["speed_acceleration"],
  },
  {
    key: "power",
    label: "POW",
    color: "#FF6B35",
    pillarIds: ["power_explosiveness"],
  },
  {
    key: "agility",
    label: "AGI",
    color: "#00D9FF",
    pillarIds: ["agility_cod"],
  },
  {
    key: "endurance",
    label: "END",
    color: "#3498DB",
    pillarIds: ["aerobic_endurance"],
  },
  {
    key: "strength",
    label: "STR",
    color: "#E74C3C",
    pillarIds: ["strength"],
  },
  {
    key: "mobility",
    label: "MOB",
    color: "#30D158",
    pillarIds: ["mobility_movement", "body_composition"],
  },
];

// All available metrics that can be assigned to pillars
// Derived from NORM_NAME_TO_METRIC_KEY in benchmarkService.ts
const AVAILABLE_METRICS = [
  { key: "sprint_5m", label: "5m Sprint" },
  { key: "sprint_10m", label: "10m Sprint" },
  { key: "sprint_20m", label: "20m Sprint" },
  { key: "sprint_30m", label: "30m Sprint" },
  { key: "sprint_40m", label: "40m Sprint" },
  { key: "flying_20m", label: "Flying 20m Sprint" },
  { key: "est_max_speed", label: "Max Sprint Speed" },
  { key: "rsa_30m", label: "Repeated Sprint Avg 6x30m" },
  { key: "cmj", label: "Standing Vertical Jump" },
  { key: "vertical_jump", label: "Vertical Jump" },
  { key: "broad_jump", label: "Broad Jump" },
  { key: "sl_broad_jump_r", label: "SL Broad Jump R" },
  { key: "sl_broad_jump_l", label: "SL Broad Jump L" },
  { key: "seated_mb_throw", label: "Seated MB Throw" },
  { key: "glycolytic_power", label: "Glycolytic Power" },
  { key: "shot_speed", label: "Shot Power" },
  { key: "kick_distance", label: "Max Kick Distance" },
  { key: "agility_505", label: "5-0-5 Agility" },
  { key: "agility_ttest", label: "T-Test Agility" },
  { key: "agility_5105", label: "5-10-5 Agility" },
  { key: "illinois_agility", label: "Illinois Agility Run" },
  { key: "dribbling_test", label: "Slalom Dribble" },
  { key: "reaction_time", label: "Reaction Time" },
  { key: "arrowhead_agility", label: "Arrowhead Agility" },
  { key: "vo2max", label: "Yo-Yo IR1 Distance" },
  { key: "mas_running", label: "MAS Running" },
  { key: "squat_1rm", label: "1RM Squat" },
  { key: "bench_1rm", label: "1RM Bench Press" },
  { key: "squat_rel", label: "Relative Squat Strength" },
  { key: "grip_strength", label: "Grip Strength" },
  { key: "body_fat_pct", label: "Body Fat %" },
  { key: "passing_accuracy", label: "Passing Accuracy" },
  { key: "shooting_accuracy", label: "Shooting Drill Score" },
  { key: "short_pass_time", label: "Short Pass Drill Time" },
  { key: "long_pass", label: "Long Pass Distance" },
  { key: "pass_speed", label: "Pass Speed" },
  { key: "cross_distance", label: "Cross Delivery Distance" },
  { key: "header_distance", label: "Header Distance" },
  { key: "lateral_shuffle", label: "Lateral Shuffle" },
  { key: "backward_sprint", label: "Backward Sprint 10m" },
  { key: "push_strength", label: "Isometric Push Strength" },
  { key: "hrv_rmssd", label: "HRV RMSSD" },
  { key: "nd_foot_speed", label: "Non-Dominant Foot Speed" },
  { key: "juggling", label: "Ball Juggling Count" },
  { key: "shuttle_run", label: "Shuttle Run" },
];

const DEFAULT_CONFIG = {
  pillars: DEFAULT_PILLARS,
  radarAxes: DEFAULT_RADAR_AXES,
  availableMetrics: AVAILABLE_METRICS,
};

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabaseAdmin() as any;
    const { data, error } = await db
      .from("ui_config")
      .select("config_value")
      .eq("config_key", CONFIG_KEY)
      .single();

    if (error || !data) {
      return NextResponse.json(DEFAULT_CONFIG);
    }

    // Always include availableMetrics for dropdown population
    const saved = data.config_value as Record<string, unknown>;
    return NextResponse.json({ ...saved, availableMetrics: AVAILABLE_METRICS });
  } catch {
    return NextResponse.json(DEFAULT_CONFIG);
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  try {
    const body = await req.json();
    const config = await upsertUIConfig({
      config_key: CONFIG_KEY,
      config_value: body,
    });
    return NextResponse.json(config, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to save mastery config", detail: String(err) },
      { status: 500 }
    );
  }
}
