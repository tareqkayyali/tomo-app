/**
 * Response Formatter — Structured visual response system for Tomo Chat.
 *
 * Converts Claude's JSON output into typed visual cards that the
 * frontend ResponseRenderer can display as rich UI components.
 *
 * Card types: stat_row, stat_grid, schedule_list, zone_stack, clash_list,
 *             benchmark_bar, text_card, coach_note, confirm_card
 */

// ── Card Types ───────────────────────────────────────────────────

export type CardType =
  | "stat_row"
  | "stat_grid"
  | "schedule_list"
  | "zone_stack"
  | "clash_list"
  | "benchmark_bar"
  | "text_card"
  | "coach_note"
  | "confirm_card"
  | "session_plan"
  | "drill_card"
  | "schedule_preview"
  | "program_recommendation"
  | "phv_assessment";

export interface StatRow {
  type: "stat_row";
  label: string;
  value: string | number;
  unit?: string;
  trend?: "up" | "down" | "flat";
  emoji?: string;
}

export interface ScheduleItem {
  time: string;
  title: string;
  type: "training" | "match" | "study" | "rest" | "exam" | "other";
  clash?: boolean;
}

export interface ScheduleList {
  type: "schedule_list";
  date: string;
  items: ScheduleItem[];
}

export interface ZoneLevel {
  zone: "green" | "yellow" | "red";
  label: string;
  detail: string;
}

export interface ZoneStack {
  type: "zone_stack";
  current: "green" | "yellow" | "red";
  levels: ZoneLevel[];
}

export interface ClashItem {
  event1: string;
  event2: string;
  time: string;
  fix: string;
}

export interface ClashList {
  type: "clash_list";
  clashes: ClashItem[];
}

export interface BenchmarkBar {
  type: "benchmark_bar";
  metric: string;
  value: number;
  percentile: number;
  unit: string;
  ageBand: string;
}

export interface TextCard {
  type: "text_card";
  headline: string;
  body: string;
  emoji?: string;
}

export interface CoachNote {
  type: "coach_note";
  note: string;
  source?: string;
}

export interface StatGridItem {
  label: string;
  value: string | number;
  unit?: string;
  highlight?: boolean; // orange highlight for attention items (e.g. high soreness)
}

export interface StatGrid {
  type: "stat_grid";
  items: StatGridItem[];
}

export interface ConfirmCard {
  type: "confirm_card";
  headline: string;
  body: string;
  confirmLabel: string;
  cancelLabel?: string;
}

// ── Session Plan & Drill Cards ───────────────────────────────────

export interface SessionPlanItem {
  drillId: string;
  name: string;
  category: "warmup" | "training" | "cooldown" | "recovery" | "activation";
  duration: number;
  intensity: "light" | "moderate" | "hard";
  attributeKeys: string[];
  reason?: string;
}

export interface SessionPlan {
  type: "session_plan";
  title: string;
  totalDuration: number;
  readiness: string;
  items: SessionPlanItem[];
}

export interface DrillCard {
  type: "drill_card";
  drillId: string;
  name: string;
  description: string;
  category: string;
  duration: number;
  intensity: "light" | "moderate" | "hard";
  equipment: string[];
  instructions: string[];
  tags: string[];
  progressionCount: number;
}

// ── Schedule Preview Card ────────────────────────────────────────

export interface SchedulePreviewEvent {
  title: string;
  event_type: string;
  date: string;
  startTime: string;
  endTime: string;
  intensity?: string;
  violations: Array<{ type: string; message: string; severity: "error" | "warning" }>;
  alternatives: Array<{ startTime: string; endTime: string }>;
  accepted: boolean;
}

export interface SchedulePreviewCard {
  type: "schedule_preview";
  events: SchedulePreviewEvent[];
  summary: { total: number; withViolations: number; blocked: number };
  scenario: string;
  confirmAction: string;    // endpoint to call on confirm
  confirmPayload: string;   // JSON string of the original batch params
}

// ── Program Recommendation & PHV Cards ──────────────────────────────

export interface ProgramRecommendationItem {
  programId: string;
  name: string;
  category: string;
  priority: "mandatory" | "high" | "medium";
  weeklyFrequency: number;
  durationMin: number;
  startingPoint: string;
  positionNote: string;
}

export interface ProgramRecommendationCard {
  type: "program_recommendation";
  programs: ProgramRecommendationItem[];
  weeklyPlanSuggestion: string;
  playerProfile: {
    name: string;
    position: string;
    ageBand: string;
    phvStage: string;
  };
}

export interface PHVAssessmentCard {
  type: "phv_assessment";
  phvStage: string;
  maturityOffset: number;
  loadingMultiplier: number;
  trainingPriorities: string[];
  safetyWarnings: string[];
  trainingImplication: string;
}

export type VisualCard =
  | StatRow
  | StatGrid
  | ScheduleList
  | ZoneStack
  | ClashList
  | BenchmarkBar
  | TextCard
  | CoachNote
  | ConfirmCard
  | SessionPlan
  | DrillCard
  | SchedulePreviewCard
  | ProgramRecommendationCard
  | PHVAssessmentCard;

// ── Action Chips ─────────────────────────────────────────────────

export interface ActionChip {
  label: string;
  action: string; // message to send when tapped
}

export interface ConfirmAction {
  label: string;
  toolName: string;
  toolInput: Record<string, any>;
  agentType: string;
}

// ── TomoResponse — the full structured response ──────────────────

export interface TomoResponse {
  headline: string;
  cards: VisualCard[];
  chips?: ActionChip[];
  confirm?: ConfirmAction;
}

// ── Builder Functions ────────────────────────────────────────────

export function buildReadinessResponse(data: {
  score: string;
  energy: number;
  soreness: number;
  sleep: number;
  recommendation: string;
}): TomoResponse {
  return {
    headline: `You're ${data.score} today`,
    cards: [
      {
        type: "stat_row",
        label: "Energy",
        value: data.energy,
        unit: "/10",
        emoji: data.energy >= 7 ? "⚡" : "😴",
      },
      {
        type: "stat_row",
        label: "Soreness",
        value: data.soreness,
        unit: "/10",
        emoji: data.soreness <= 3 ? "💪" : "🩹",
      },
      {
        type: "stat_row",
        label: "Sleep",
        value: data.sleep,
        unit: "hrs",
        emoji: data.sleep >= 8 ? "😴" : "⏰",
      },
      {
        type: "text_card",
        headline: "Coach says",
        body: data.recommendation,
        emoji: "🎯",
      },
    ],
    chips: [
      { label: "Log check-in", action: "I want to check in" },
      { label: "See schedule", action: "What's on my schedule today?" },
    ],
  };
}

export function buildScheduleResponse(data: {
  date: string;
  items: ScheduleItem[];
}): TomoResponse {
  const hasClash = data.items.some((i) => i.clash);
  return {
    headline: hasClash ? "⚠️ Schedule clash detected" : `${data.items.length} events on ${data.date}`,
    cards: [
      {
        type: "schedule_list",
        date: data.date,
        items: data.items,
      },
    ],
    chips: hasClash
      ? [
          { label: "Fix clashes", action: "Fix my schedule clashes" },
          { label: "Add event", action: "Add a new event" },
        ]
      : [
          { label: "Add event", action: "Add a new event" },
          { label: "Tomorrow", action: "What about tomorrow?" },
        ],
  };
}

export function buildClashFixResponse(data: {
  clashes: ClashItem[];
}): TomoResponse {
  return {
    headline: `${data.clashes.length} clash${data.clashes.length > 1 ? "es" : ""} found`,
    cards: [
      {
        type: "clash_list",
        clashes: data.clashes,
      },
    ],
    chips: [
      { label: "Apply fixes", action: "Yes, apply all fixes" },
      { label: "Show schedule", action: "Show my full schedule" },
    ],
  };
}

export function buildExamWeekResponse(data: {
  headline: string;
  zones: ZoneLevel[];
  currentZone: "green" | "yellow" | "red";
  recommendation: string;
}): TomoResponse {
  return {
    headline: data.headline,
    cards: [
      {
        type: "zone_stack",
        current: data.currentZone,
        levels: data.zones,
      },
      {
        type: "coach_note",
        note: data.recommendation,
      },
    ],
    chips: [
      { label: "Adjust training", action: "Reduce my training load this week" },
      { label: "Study blocks", action: "Show my study blocks" },
    ],
  };
}

export function buildBenchmarkResponse(data: {
  metrics: Array<{
    metric: string;
    value: number;
    percentile: number;
    unit: string;
    ageBand: string;
  }>;
}): TomoResponse {
  return {
    headline: "Your benchmarks",
    cards: data.metrics.map((m) => ({
      type: "benchmark_bar" as const,
      ...m,
    })),
    chips: [
      { label: "Improve weakest", action: "How do I improve my weakest area?" },
      { label: "Full profile", action: "Show my full athlete profile" },
    ],
  };
}

/**
 * Attempts to parse a structured TomoResponse from Claude's output.
 * Falls back gracefully if Claude returns plain text.
 */
export function parseStructuredResponse(
  rawText: string
): TomoResponse | null {
  // Look for JSON block in Claude's response
  const jsonMatch = rawText.match(/```json\s*([\s\S]*?)```/) ||
    rawText.match(/\{[\s\S]*"headline"[\s\S]*"cards"[\s\S]*\}/);

  if (!jsonMatch) return null;

  try {
    const jsonStr = jsonMatch[1] || jsonMatch[0];
    const parsed = JSON.parse(jsonStr);

    if (parsed.headline && Array.isArray(parsed.cards)) {
      return parsed as TomoResponse;
    }
  } catch {
    // Not valid JSON — return null
  }

  return null;
}

/**
 * Extracts a clean short message from a TomoResponse (for typewriter / plain text).
 * Returns headline + first text_card body (if any).
 */
export function extractCleanMessage(response: TomoResponse): string {
  const parts: string[] = [response.headline];
  for (const card of response.cards) {
    if (card.type === "text_card" && card.body) {
      parts.push(card.body);
      break; // only first text card
    }
    if (card.type === "coach_note" && card.note) {
      parts.push(card.note);
      break;
    }
  }
  return parts.join("\n");
}

/**
 * Builds a generic text-only structured response from plain message text.
 * Used as fallback when Claude doesn't return structured JSON.
 */
export function buildTextResponse(
  message: string,
  chips?: ActionChip[]
): TomoResponse {
  // Extract first sentence as headline (max 60 chars)
  const firstSentence = message.split(/[.!?\n]/)[0]?.trim() || message;
  const headline =
    firstSentence.length > 60
      ? firstSentence.slice(0, 57) + "..."
      : firstSentence;

  return {
    headline,
    cards: [
      {
        type: "text_card",
        headline: "",
        body: message,
      },
    ],
    chips: chips ?? [],
  };
}

/**
 * OUTPUT FORMAT INSTRUCTION — appended to every agent system prompt.
 * Teaches Claude how to return structured visual responses.
 */
export const OUTPUT_FORMAT_INSTRUCTION = `
OUTPUT FORMAT — MANDATORY:
You MUST return your response as a JSON block wrapped in \`\`\`json ... \`\`\` markers.
The JSON must match this schema exactly:

{
  "headline": "Max 8 words — the bottom-line takeaway",
  "cards": [
    // Array of visual cards. Use the right card type for the data:
    //
    // stat_grid — Horizontal pill row for readiness/metrics overview:
    //   { "type": "stat_grid", "items": [{ "label": "Energy", "value": 8, "unit": "/10", "highlight": false }] }
    //
    // stat_row — Single stat with optional trend arrow:
    //   { "type": "stat_row", "label": "Sprint", "value": "4.2", "unit": "sec", "trend": "up", "emoji": "🏃" }
    //
    // schedule_list — Timeline of events:
    //   { "type": "schedule_list", "date": "Today", "items": [{ "time": "15:00", "title": "Speed & Power", "type": "training", "clash": false }] }
    //   Item types: "training" | "match" | "study" | "rest" | "exam" | "other"
    //
    // zone_stack — Color-coded priority/readiness zones:
    //   { "type": "zone_stack", "current": "yellow", "levels": [{ "zone": "red", "label": "Exam days", "detail": "No training" }] }
    //
    // clash_list — Schedule conflicts with fixes:
    //   { "type": "clash_list", "clashes": [{ "event1": "Math Study", "event2": "Training", "time": "15:45", "fix": "Move Math to 16:30" }] }
    //
    // benchmark_bar — Performance percentile bar:
    //   { "type": "benchmark_bar", "metric": "Sprint", "value": 4.2, "percentile": 78, "unit": "sec", "ageBand": "U17" }
    //
    // text_card — Short text block (max 2 sentences):
    //   { "type": "text_card", "headline": "", "body": "Your one-liner advice here.", "emoji": "🎯" }
    //
    // coach_note — Highlighted coaching insight:
    //   { "type": "coach_note", "note": "The advice text" }
    //
    // confirm_card — Action confirmation (only when proposing changes):
    //   { "type": "confirm_card", "headline": "Make these changes?", "body": "Details of what will change.", "confirmLabel": "Yes, update ✓", "cancelLabel": "Edit" }
    //
    // session_plan — Personalized training session with ordered drills:
    //   { "type": "session_plan", "title": "Speed & Agility Session", "totalDuration": 45, "readiness": "Green",
    //     "items": [{ "drillId": "uuid", "name": "Dynamic Stretches", "category": "warmup", "duration": 10, "intensity": "light", "attributeKeys": ["pace"], "reason": "Targets your pace gap" }] }
    //
    // drill_card — Individual drill detail with instructions and equipment:
    //   { "type": "drill_card", "drillId": "uuid", "name": "Cone Weave Sprint", "description": "...", "category": "training",
    //     "duration": 15, "intensity": "moderate", "equipment": ["cones", "football"], "instructions": ["Step 1...", "Step 2..."], "tags": ["speed", "agility"], "progressionCount": 3 }
    //
    // program_recommendation — Multi-week training program recommendations:
    //   { "type": "program_recommendation",
    //     "programs": [{ "programId": "sprint_linear_10_30", "name": "Linear Sprint", "category": "sprint", "priority": "mandatory", "weeklyFrequency": 2, "durationMin": 25, "startingPoint": "3x4 at 95%", "positionNote": "Mandatory for W position" }],
    //     "weeklyPlanSuggestion": "Suggested weekly plan text...",
    //     "playerProfile": { "name": "Player", "position": "W", "ageBand": "U17", "phvStage": "post_phv" } }
    //
    // phv_assessment — PHV maturity assessment result:
    //   { "type": "phv_assessment", "phvStage": "mid_phv", "maturityOffset": -0.3, "loadingMultiplier": 0.6,
    //     "trainingPriorities": ["Flexibility...", "Core stability..."], "safetyWarnings": ["No maximal loading..."],
    //     "trainingImplication": "Mid-PHV: Critical growth phase..." }
  ],
  "chips": [
    // 1-3 follow-up action suggestions:
    { "label": "Button text", "action": "Message to send when tapped" }
  ]
}

RULES:
- ALWAYS return valid JSON inside \`\`\`json markers. No text before or after the JSON block.
- Use stat_grid (NOT multiple stat_rows) when showing 3+ metrics side by side (readiness, check-in breakdown).
- Use schedule_list for any day/week schedule view. Mark clashes with "clash": true.
- Use zone_stack for exam week / load zone displays.
- Use text_card for brief advice or explanations (max 2 sentences in body).
- Use confirm_card when you're proposing schedule changes the user needs to approve.
- Include 1-3 chips as follow-up actions. Phrase as questions or short commands.
- The headline is the MOST IMPORTANT part — it's what Gen Z reads first.
- Keep text_card bodies under 2 sentences. If more detail is needed, use multiple cards.
- Use session_plan when returning a training session or workout plan with multiple drills.
- Use drill_card when showing detailed information about a single drill.
`;
