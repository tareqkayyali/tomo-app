import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/apiAuth";
import { upsertUIConfig } from "@/services/admin/uiConfigAdminService";
import { supabaseAdmin } from "@/lib/supabase/admin";

const CONFIG_KEY = "proactive_dashboard";

const DEFAULT_CONFIG = {
  greeting: { enabled: true, showEmoji: true },
  pills: [
    {
      id: "readiness",
      label: "Ready",
      emoji: "\uD83D\uDFE2",
      dataSource: "latestCheckin.readiness",
      format: "readiness_color",
      enabled: true,
      emptyValue: "?",
      tapAction: "check in",
      tapHint: "Tap to check in",
      sortOrder: 1,
    },
    {
      id: "sleep",
      label: "Sleep",
      emoji: "\uD83D\uDE34",
      dataSource: "latestCheckin.sleepHours",
      format: "hours",
      enabled: true,
      emptyValue: "\u2014",
      sortOrder: 2,
    },
    {
      id: "acwr",
      label: "ACWR",
      emoji: "\uD83D\uDCCA",
      dataSource: "snapshot.acwr",
      format: "decimal1",
      enabled: true,
      emptyValue: "\u2014",
      colorRules: { green: ">= 0.8", yellow: "< 0.8", red: "> 1.3" },
      sortOrder: 3,
    },
    {
      id: "streak",
      label: "Streak",
      emoji: "\uD83D\uDD25",
      dataSource: "streak",
      format: "number",
      enabled: true,
      emptyValue: "0",
      sortOrder: 4,
    },
    {
      id: "hrv",
      label: "HRV",
      emoji: "\u2764\uFE0F",
      dataSource: "metricPercentiles.hrv_rmssd",
      format: "metric_zone_percentile",
      enabled: false,
      emptyValue: "\u2014",
      sortOrder: 5,
    },
  ],
  todaySection: {
    enabled: true,
    maxEvents: 3,
    showEventTime: true,
    showRestDayMessage: true,
    restDayMessage: "Rest day \u2014 recovery focus",
  },
  flags: [
    {
      id: "exam",
      condition: "hasExamSoon",
      icon: "alert-circle",
      message: "Exam coming up \u2014 pace your load",
      color: "#F39C12",
      priority: 1,
      enabled: true,
    },
    {
      id: "injury",
      condition: "snapshot.injury_risk_flag == RED",
      icon: "alert-circle",
      message: "Injury risk elevated \u2014 prioritize recovery",
      color: "#E74C3C",
      priority: 2,
      enabled: true,
    },
    {
      id: "highLoad",
      condition: "snapshot.acwr > 1.3",
      icon: "trending-up",
      message: "Training load is high \u2014 manage intensity",
      color: "#F39C12",
      priority: 3,
      enabled: true,
    },
    {
      id: "dualLoad",
      condition: "snapshot.dual_load_index > 65",
      icon: "warning",
      message: "Academic + athletic load elevated",
      color: "#F39C12",
      priority: 4,
      enabled: true,
    },
  ],
  chips: [
    {
      id: "checkin",
      label: "Check in",
      message: "check in",
      condition: "!hasCheckinToday",
      priority: 1,
      enabled: true,
    },
    {
      id: "matchPrep",
      label: "Match prep",
      message: "help me prepare for my match today",
      condition: "hasMatch",
      priority: 2,
      enabled: true,
    },
    {
      id: "studyPlan",
      label: "Study plan",
      message: "plan my study schedule",
      condition: "hasExamSoon",
      priority: 3,
      enabled: true,
    },
    {
      id: "myLoad",
      label: "My load",
      message: "what's my training load looking like?",
      condition: "highLoad",
      priority: 4,
      enabled: true,
    },
    {
      id: "planDay",
      label: "Plan my day",
      message: "help me plan my day",
      condition: "hasEvents",
      priority: 5,
      enabled: true,
    },
    {
      id: "recs",
      label: "My recommendations",
      message: "show me my recommendations",
      condition: "hasRecs",
      priority: 6,
      enabled: true,
    },
    {
      id: "howAmI",
      label: "How am I doing?",
      message: "how am I doing overall?",
      condition: "always",
      priority: 7,
      enabled: true,
    },
    {
      id: "progress",
      label: "My progress",
      message: "show me my progress",
      condition: "always",
      priority: 8,
      enabled: true,
    },
    {
      id: "whatTrain",
      label: "What should I train?",
      message: "what should I train today?",
      condition: "always",
      priority: 9,
      enabled: true,
    },
  ],
  newUserMessage: "Start by checking in to unlock your dashboard",
};

const DATA_SOURCES = [
  { group: "Checkin", field: "latestCheckin.readiness", label: "Readiness (color)" },
  { group: "Checkin", field: "latestCheckin.energy", label: "Energy (1-10)" },
  { group: "Checkin", field: "latestCheckin.soreness", label: "Soreness (1-10)" },
  { group: "Checkin", field: "latestCheckin.sleepHours", label: "Sleep Hours" },
  { group: "Checkin", field: "latestCheckin.mood", label: "Mood" },
  { group: "Snapshot", field: "snapshot.readiness_score", label: "Readiness Score (0-100)" },
  { group: "Snapshot", field: "snapshot.acwr", label: "ACWR" },
  { group: "Snapshot", field: "snapshot.atl_7day", label: "ATL (7-day)" },
  { group: "Snapshot", field: "snapshot.ctl_28day", label: "CTL (28-day)" },
  { group: "Snapshot", field: "snapshot.dual_load_index", label: "Dual Load Index" },
  { group: "Snapshot", field: "snapshot.hrv_today_ms", label: "HRV Today" },
  { group: "Snapshot", field: "snapshot.sleep_quality", label: "Sleep Quality" },
  { group: "Snapshot", field: "snapshot.wellness_7day_avg", label: "Wellness (7-day avg)" },
  { group: "Snapshot", field: "snapshot.cv_completeness", label: "CV Completeness %" },
  { group: "Snapshot", field: "snapshot.sessions_total", label: "Total Sessions" },
  { group: "Snapshot", field: "snapshot.training_age_weeks", label: "Training Age (weeks)" },
  { group: "Profile", field: "streak", label: "Current Streak" },
  { group: "Profile", field: "age", label: "Age" },
  { group: "Benchmark", field: "benchmarkSummary.overallPercentile", label: "Overall Percentile" },
  // Metric percentiles — zone-based coloring (use format: metric_zone_percentile or metric_zone_value)
  { group: "Metric Norms", field: "metricPercentiles.hrv_rmssd", label: "HRV (RMSSD) — zone + percentile" },
  { group: "Metric Norms", field: "metricPercentiles.cmj", label: "CMJ Height — zone + percentile" },
  { group: "Metric Norms", field: "metricPercentiles.sprint_30m", label: "30m Sprint — zone + percentile" },
  { group: "Metric Norms", field: "metricPercentiles.sprint_10m", label: "10m Sprint — zone + percentile" },
  { group: "Metric Norms", field: "metricPercentiles.vo2max", label: "VO2max — zone + percentile" },
  { group: "Metric Norms", field: "metricPercentiles.yoyo_ir1", label: "Yo-Yo IR1 — zone + percentile" },
  { group: "Metric Norms", field: "metricPercentiles.agility_505", label: "5-0-5 COD — zone + percentile" },
  { group: "Metric Norms", field: "metricPercentiles.agility_ttest", label: "T-Test Agility — zone + percentile" },
  { group: "Metric Norms", field: "metricPercentiles.squat_1rm", label: "Squat 1RM — zone + percentile" },
];

const CHIP_CONDITIONS = [
  { value: "always", label: "Always show" },
  { value: "!hasCheckinToday", label: "No checkin today" },
  { value: "hasCheckinToday", label: "Has checked in today" },
  { value: "hasMatch", label: "Match day" },
  { value: "hasExamSoon", label: "Exam within 7 days" },
  { value: "highLoad", label: "High training load" },
  { value: "hasRecs", label: "Has recommendations" },
  { value: "hasEvents", label: "Has events today" },
];

const FORMAT_OPTIONS = [
  { value: "number", label: "Number (rounded)" },
  { value: "decimal1", label: "Decimal (1 place)" },
  { value: "hours", label: "Hours (e.g. 7.5h)" },
  { value: "percent", label: "Percentage (%)" },
  { value: "text", label: "Text (as-is)" },
  { value: "readiness_color", label: "Readiness Color" },
  { value: "metric_zone_percentile", label: "Metric Zone — show percentile (e.g. p68), color by zone" },
  { value: "metric_zone_value", label: "Metric Zone — show raw value, color by zone" },
  { value: "metric_zone_label", label: "Metric Zone — show zone label (Elite / Good / Avg), color by zone" },
];

const EMOJI_OPTIONS = [
  { value: "", label: "Green circle" },
  { value: "", label: "Yellow circle" },
  { value: "", label: "Red circle" },
  { value: "", label: "Question mark" },
  { value: "", label: "Sleep" },
  { value: "", label: "Chart" },
  { value: "", label: "Fire" },
  { value: "", label: "Muscle" },
  { value: "", label: "Heart" },
  { value: "", label: "Brain" },
  { value: "", label: "Energy" },
  { value: "", label: "Running" },
  { value: "", label: "Target" },
  { value: "", label: "Trending up" },
  { value: "", label: "Trophy" },
  { value: "", label: "Star" },
  { value: "", label: "Shield" },
  { value: "", label: "Moon" },
  { value: "", label: "Smile" },
  { value: "", label: "100" },
];

const ICON_OPTIONS = [
  { value: "alert-circle", label: "Alert Circle", emoji: "\u26A0\uFE0F" },
  { value: "trending-up", label: "Trending Up", emoji: "\uD83D\uDCC8" },
  { value: "trending-down", label: "Trending Down", emoji: "\uD83D\uDCC9" },
  { value: "warning", label: "Warning", emoji: "\u26A0\uFE0F" },
  { value: "checkmark-circle", label: "Checkmark", emoji: "\u2705" },
  { value: "flame", label: "Flame", emoji: "\uD83D\uDD25" },
  { value: "heart", label: "Heart", emoji: "\u2764\uFE0F" },
  { value: "fitness", label: "Fitness", emoji: "\uD83D\uDCAA" },
  { value: "pulse", label: "Pulse", emoji: "\uD83D\uDC93" },
  { value: "shield-checkmark", label: "Shield", emoji: "\uD83D\uDEE1\uFE0F" },
  { value: "barbell-outline", label: "Barbell", emoji: "\uD83C\uDFCB\uFE0F" },
  { value: "trophy-outline", label: "Trophy", emoji: "\uD83C\uDFC6" },
  { value: "school-outline", label: "School", emoji: "\uD83C\uDFEB" },
  { value: "book-outline", label: "Book", emoji: "\uD83D\uDCD6" },
  { value: "calendar-outline", label: "Calendar", emoji: "\uD83D\uDCC5" },
  { value: "moon-outline", label: "Moon", emoji: "\uD83C\uDF19" },
  { value: "speedometer-outline", label: "Speedometer", emoji: "\u23F1\uFE0F" },
  { value: "information-circle", label: "Info", emoji: "\u2139\uFE0F" },
];

const OPERATOR_OPTIONS = [
  { value: ">", label: "greater than (>)" },
  { value: "<", label: "less than (<)" },
  { value: ">=", label: "greater or equal (\u2265)" },
  { value: "<=", label: "less or equal (\u2264)" },
  { value: "==", label: "equals (=)" },
  { value: "!=", label: "not equal (\u2260)" },
];

const CHAT_COMMANDS = [
  { value: "check in", label: "Check in" },
  { value: "help me plan my day", label: "Plan my day" },
  { value: "help me prepare for my match today", label: "Match prep" },
  { value: "plan my study schedule", label: "Study plan" },
  { value: "what's my training load looking like?", label: "My load" },
  { value: "show me my recommendations", label: "My recommendations" },
  { value: "how am I doing overall?", label: "How am I doing?" },
  { value: "show me my progress", label: "My progress" },
  { value: "what should I train today?", label: "What should I train?" },
  { value: "my programs", label: "My programs" },
  { value: "edit my CV profile", label: "Edit CV" },
  { value: "plan my training week", label: "Plan training week" },
  { value: "check for any schedule conflicts", label: "Check conflicts" },
  { value: "edit my schedule rules", label: "Edit schedule rules" },
  { value: "what are my strengths and gaps?", label: "Strengths & gaps" },
  { value: "notification settings", label: "Notification settings" },
];

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
      return NextResponse.json({
        ...DEFAULT_CONFIG,
        dataSources: DATA_SOURCES,
        chipConditions: CHIP_CONDITIONS,
        formatOptions: FORMAT_OPTIONS,
        emojiOptions: EMOJI_OPTIONS,
        iconOptions: ICON_OPTIONS,
        operatorOptions: OPERATOR_OPTIONS,
        chatCommands: CHAT_COMMANDS,
      });
    }

    // Always include dropdown options for CMS population
    const saved = data.config_value as Record<string, unknown>;
    return NextResponse.json({
      ...saved,
      dataSources: DATA_SOURCES,
      chipConditions: CHIP_CONDITIONS,
      formatOptions: FORMAT_OPTIONS,
    });
  } catch {
    return NextResponse.json({
      ...DEFAULT_CONFIG,
      dataSources: DATA_SOURCES,
      chipConditions: CHIP_CONDITIONS,
      formatOptions: FORMAT_OPTIONS,
    });
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
      { error: "Failed to save dashboard config", detail: String(err) },
      { status: 500 }
    );
  }
}
