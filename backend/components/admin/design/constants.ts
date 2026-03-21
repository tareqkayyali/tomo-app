// ── Tab Design System Constants ──
// Maps color groups and component definitions to each app tab.

// ── Types ──

export interface ComponentDef {
  key: string;
  label: string;
  group: string;
}

export interface ComponentStyleEntry {
  fontSize?: number;
  fontWeight?: string;
  letterSpacing?: number;
}

export type ComponentStylesConfig = Record<string, ComponentStyleEntry>;

// ── Color Groups per Tab ──
// Each key array references color keys on the theme's colors_dark / colors_light object.

export const COLOR_GROUPS_BY_TAB: Record<
  string,
  { label: string; keys: string[] }[]
> = {
  global: [
    {
      label: "Brand",
      keys: [
        "accent1",
        "accent2",
        "accent1Dark",
        "accent1Light",
        "accent2Dark",
        "accent2Light",
      ],
    },
    { label: "Background", keys: ["background", "backgroundElevated"] },
    {
      label: "Text",
      keys: [
        "textHeader",
        "textOnDark",
        "textOnLight",
        "textInactive",
        "textMuted",
        "textSecondary",
      ],
    },
    { label: "Semantic", keys: ["success", "warning", "error", "info"] },
    {
      label: "Glass",
      keys: ["glass", "glassBorder", "glassHighlight"],
    },
    { label: "Shadows", keys: ["glowOrange", "glowCyan"] },
  ],
  timeline: [
    {
      label: "Event Colors",
      keys: [
        "eventTraining",
        "eventMatch",
        "eventRecovery",
        "eventStudyBlock",
        "eventExam",
      ],
    },
  ],
  output: [
    {
      label: "Readiness",
      keys: ["readinessGreen", "readinessYellow", "readinessRed"],
    },
    {
      label: "Benchmarks & Normative Lines",
      keys: [
        "benchmarkElite",
        "benchmarkGood",
        "benchmarkAverage",
        "benchmarkDeveloping",
        "benchmarkBelow",
        "normLineP25",
        "normLineP50",
        "normLineP75",
        "normPlayerDot",
        "normGhostDot",
      ],
    },
  ],
  mastery: [
    {
      label: "Radar Chart",
      keys: [
        "radarFill",
        "radarFillBenchmark",
        "radarGrid",
        "radarAxisLine",
        "radarVertexDot",
        "radarLabelText",
        "radarScoreText",
      ],
    },
  ],
  chat: [
    {
      label: "Chat Surfaces",
      keys: ["glass", "glassBorder"],
    },
    {
      label: "Accents",
      keys: ["accent1", "accent2"],
    },
  ],
  "own-it": [
    {
      label: "Readiness",
      keys: ["readinessGreen", "readinessYellow", "readinessRed"],
    },
    {
      label: "Recommendation Types",
      keys: [
        "eventTraining",
        "eventMatch",
        "eventRecovery",
        "eventStudyBlock",
        "eventExam",
      ],
    },
    {
      label: "Accents",
      keys: ["accent1", "accent2"],
    },
  ],
};

// ── Component Registry ──

export const COMPONENT_REGISTRY: ComponentDef[] = [
  // ─── Mastery Tab ───
  { key: "dna_card_overall_number", label: "Overall Number (48)", group: "Mastery — DNA Card" },
  { key: "dna_card_overall_label", label: "OVR Label", group: "Mastery — DNA Card" },
  { key: "dna_card_attribute_label", label: "Attribute Label (PAC)", group: "Mastery — DNA Card" },
  { key: "dna_card_attribute_score", label: "Attribute Score", group: "Mastery — DNA Card" },
  { key: "dna_card_tier_badge", label: "Tier Badge (GOLD)", group: "Mastery — DNA Card" },
  { key: "dna_card_position_badge", label: "Position Badge (ST)", group: "Mastery — DNA Card" },
  { key: "radar_label", label: "Radar Axis Label (PAC)", group: "Mastery — Radar Chart" },
  { key: "radar_score", label: "Radar Score Value", group: "Mastery — Radar Chart" },
  { key: "pillar_title", label: "Pillar Title", group: "Mastery — Pillars" },
  { key: "pillar_value", label: "Pillar Percentile", group: "Mastery — Pillars" },
  { key: "pillar_description", label: "Pillar Description", group: "Mastery — Pillars" },
  { key: "streak_count", label: "Streak Counter", group: "Mastery — Streaks" },
  { key: "streak_label", label: "Streak Label", group: "Mastery — Streaks" },
  { key: "milestone_title", label: "Milestone Title", group: "Mastery — Milestones" },
  { key: "milestone_subtitle", label: "Milestone Subtitle", group: "Mastery — Milestones" },

  // ─── Output Tab ───
  { key: "vital_value", label: "Vital Reading Value", group: "Output — My Vitals" },
  { key: "vital_label", label: "Vital Label", group: "Output — My Vitals" },
  { key: "vital_unit", label: "Vital Unit", group: "Output — My Vitals" },
  { key: "metric_value", label: "Metric Score", group: "Output — My Metrics" },
  { key: "metric_label", label: "Metric Label", group: "Output — My Metrics" },
  { key: "metric_unit", label: "Metric Unit", group: "Output — My Metrics" },
  { key: "benchmark_zone_label", label: "Zone Label (Elite/Good)", group: "Output — Benchmarks" },
  { key: "benchmark_percentile", label: "Percentile Text (P75)", group: "Output — Benchmarks" },
  { key: "benchmark_norm_value", label: "Normative Line Value", group: "Output — Benchmarks" },
  { key: "benchmark_delta", label: "Delta Text (+2.3)", group: "Output — Benchmarks" },
  { key: "program_title", label: "Program Title", group: "Output — My Programs" },
  { key: "program_subtitle", label: "Program Subtitle", group: "Output — My Programs" },
  { key: "drill_name", label: "Drill Name", group: "Output — My Programs" },
  { key: "drill_detail", label: "Drill Detail Text", group: "Output — My Programs" },

  // ─── Timeline Tab ───
  { key: "calendar_day_number", label: "Day Number", group: "Timeline — Calendar" },
  { key: "calendar_day_label", label: "Day Label (Mon)", group: "Timeline — Calendar" },
  { key: "calendar_month_label", label: "Month Label", group: "Timeline — Calendar" },
  { key: "event_title", label: "Event Title", group: "Timeline — Events" },
  { key: "event_time", label: "Event Time", group: "Timeline — Events" },
  { key: "event_detail", label: "Event Detail", group: "Timeline — Events" },
  { key: "insight_title", label: "AI Insight Title", group: "Timeline — Insights" },
  { key: "insight_body", label: "AI Insight Body", group: "Timeline — Insights" },

  // ─── Tomo Chat Tab ───
  { key: "chat_message", label: "Chat Message Text", group: "Tomo Chat" },
  { key: "chat_agent_name", label: "Agent Name Label", group: "Tomo Chat" },
  { key: "chat_chip", label: "Suggestion Chip", group: "Tomo Chat" },
  { key: "chat_timestamp", label: "Message Timestamp", group: "Tomo Chat" },

  // ─── Own It Tab ───
  { key: "rec_card_title", label: "Recommendation Title", group: "Own It — Feed" },
  { key: "rec_card_body", label: "Recommendation Body", group: "Own It — Feed" },
  { key: "rec_card_tag", label: "Recommendation Tag", group: "Own It — Feed" },
  { key: "readiness_score", label: "Readiness Score", group: "Own It — Readiness" },
  { key: "readiness_label", label: "Readiness Label", group: "Own It — Readiness" },
  { key: "focus_tip", label: "Focus Tip Text", group: "Own It — Tips" },

  // ─── Shared / Global ───
  { key: "page_title", label: "Page Title", group: "Shared" },
  { key: "page_subtitle", label: "Page Subtitle", group: "Shared" },
  { key: "card_header", label: "Card Header", group: "Shared" },
  { key: "section_header", label: "Section Header", group: "Shared" },
  { key: "tab_label", label: "Tab Label", group: "Shared" },
  { key: "badge_text", label: "Badge Text", group: "Shared" },
  { key: "button_label", label: "Button Label", group: "Shared" },
  { key: "empty_state", label: "Empty State Text", group: "Shared" },
];

// ── Component Defaults ──

export const COMPONENT_DEFAULTS: ComponentStylesConfig = {
  dna_card_overall_number: { fontSize: 48, fontWeight: "700", letterSpacing: 0 },
  dna_card_overall_label: { fontSize: 12, fontWeight: "600", letterSpacing: 2 },
  dna_card_attribute_label: { fontSize: 10, fontWeight: "700", letterSpacing: 1.5 },
  dna_card_attribute_score: { fontSize: 22, fontWeight: "700", letterSpacing: 0 },
  dna_card_tier_badge: { fontSize: 12, fontWeight: "700", letterSpacing: 1 },
  dna_card_position_badge: { fontSize: 13, fontWeight: "700", letterSpacing: 1 },
  radar_label: { fontSize: 10, fontWeight: "700", letterSpacing: 0.5 },
  radar_score: { fontSize: 12, fontWeight: "600", letterSpacing: 0 },
  pillar_title: { fontSize: 15, fontWeight: "600", letterSpacing: 0 },
  pillar_value: { fontSize: 11, fontWeight: "600", letterSpacing: 0 },
  pillar_description: { fontSize: 13, fontWeight: "400", letterSpacing: 0 },
  streak_count: { fontSize: 28, fontWeight: "700", letterSpacing: 0 },
  streak_label: { fontSize: 12, fontWeight: "500", letterSpacing: 0.5 },
  milestone_title: { fontSize: 14, fontWeight: "600", letterSpacing: 0 },
  milestone_subtitle: { fontSize: 12, fontWeight: "400", letterSpacing: 0 },
  vital_value: { fontSize: 24, fontWeight: "700", letterSpacing: 0 },
  vital_label: { fontSize: 13, fontWeight: "500", letterSpacing: 0 },
  vital_unit: { fontSize: 11, fontWeight: "400", letterSpacing: 0 },
  metric_value: { fontSize: 20, fontWeight: "700", letterSpacing: 0 },
  metric_label: { fontSize: 13, fontWeight: "500", letterSpacing: 0 },
  metric_unit: { fontSize: 11, fontWeight: "400", letterSpacing: 0 },
  benchmark_zone_label: { fontSize: 9, fontWeight: "400", letterSpacing: 0 },
  benchmark_percentile: { fontSize: 10, fontWeight: "600", letterSpacing: 0 },
  benchmark_norm_value: { fontSize: 12, fontWeight: "400", letterSpacing: 0 },
  benchmark_delta: { fontSize: 11, fontWeight: "500", letterSpacing: 0 },
  program_title: { fontSize: 16, fontWeight: "600", letterSpacing: 0 },
  program_subtitle: { fontSize: 13, fontWeight: "400", letterSpacing: 0 },
  drill_name: { fontSize: 14, fontWeight: "600", letterSpacing: 0 },
  drill_detail: { fontSize: 12, fontWeight: "400", letterSpacing: 0 },
  calendar_day_number: { fontSize: 14, fontWeight: "600", letterSpacing: 0 },
  calendar_day_label: { fontSize: 10, fontWeight: "500", letterSpacing: 0.5 },
  calendar_month_label: { fontSize: 13, fontWeight: "600", letterSpacing: 0 },
  event_title: { fontSize: 14, fontWeight: "600", letterSpacing: 0 },
  event_time: { fontSize: 12, fontWeight: "500", letterSpacing: 0 },
  event_detail: { fontSize: 12, fontWeight: "400", letterSpacing: 0 },
  insight_title: { fontSize: 14, fontWeight: "600", letterSpacing: 0 },
  insight_body: { fontSize: 13, fontWeight: "400", letterSpacing: 0 },
  chat_message: { fontSize: 14, fontWeight: "400", letterSpacing: 0 },
  chat_agent_name: { fontSize: 12, fontWeight: "600", letterSpacing: 0.5 },
  chat_chip: { fontSize: 13, fontWeight: "500", letterSpacing: 0 },
  chat_timestamp: { fontSize: 10, fontWeight: "400", letterSpacing: 0 },
  rec_card_title: { fontSize: 15, fontWeight: "600", letterSpacing: 0 },
  rec_card_body: { fontSize: 13, fontWeight: "400", letterSpacing: 0 },
  rec_card_tag: { fontSize: 11, fontWeight: "600", letterSpacing: 0.5 },
  readiness_score: { fontSize: 36, fontWeight: "700", letterSpacing: 0 },
  readiness_label: { fontSize: 13, fontWeight: "500", letterSpacing: 0 },
  focus_tip: { fontSize: 13, fontWeight: "400", letterSpacing: 0 },
  page_title: { fontSize: 36, fontWeight: "700", letterSpacing: -0.72 },
  page_subtitle: { fontSize: 13, fontWeight: "500", letterSpacing: 0 },
  card_header: { fontSize: 14, fontWeight: "600", letterSpacing: 0 },
  section_header: { fontSize: 16, fontWeight: "600", letterSpacing: 0 },
  tab_label: { fontSize: 14, fontWeight: "500", letterSpacing: 0 },
  badge_text: { fontSize: 12, fontWeight: "600", letterSpacing: 0 },
  button_label: { fontSize: 10, fontWeight: "600", letterSpacing: 0.8 },
  empty_state: { fontSize: 14, fontWeight: "400", letterSpacing: 0 },
};

// ── Tab → Component Group Filter ──

export const COMPONENTS_BY_TAB: Record<string, (group: string) => boolean> = {
  global: (g) => g === "Shared",
  timeline: (g) => g.startsWith("Timeline"),
  output: (g) => g.startsWith("Output"),
  chat: (g) => g.startsWith("Tomo Chat"),
  mastery: (g) => g.startsWith("Mastery"),
  "own-it": (g) => g.startsWith("Own It"),
};

// ── Font weights ──

export const FONT_WEIGHTS = [
  { value: "300", label: "Light (300)" },
  { value: "400", label: "Regular (400)" },
  { value: "500", label: "Medium (500)" },
  { value: "600", label: "SemiBold (600)" },
  { value: "700", label: "Bold (700)" },
];

// ── Tab metadata ──

export const TAB_META: Record<string, { icon: string; title: string; description: string }> = {
  global: {
    icon: "🎨",
    title: "Global Theme",
    description: "Brand colors, backgrounds, text, glass effects, and shared component typography",
  },
  timeline: {
    icon: "📅",
    title: "Timeline",
    description: "Event colors and calendar/event/insight component typography",
  },
  output: {
    icon: "⚡",
    title: "Output",
    description: "Readiness, benchmark colors, and vitals/metrics/program component typography",
  },
  chat: {
    icon: "💬",
    title: "Tomo Chat",
    description: "Chat message, agent label, chip, and timestamp typography",
  },
  mastery: {
    icon: "🏆",
    title: "Mastery",
    description: "Radar chart colors, DNA card tiers, and mastery component typography",
  },
  "own-it": {
    icon: "⭐",
    title: "Own It",
    description: "Recommendation feed, readiness, and tips component typography",
  },
};
