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
  | "phv_assessment"
  // Capsule card types — interactive cards with inline inputs
  | "test_log_capsule"
  | "checkin_capsule"
  | "program_action_capsule"
  | "cv_edit_capsule"
  | "club_edit_capsule"
  | "navigation_capsule"
  | "quick_action_capsule"
  | "event_edit_capsule"
  | "drill_rating_capsule"
  | "bulk_timeline_edit_capsule";

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

// ── Capsule Card Types — interactive cards with inline inputs ────

export interface CapsuleCatalogItem {
  id: string;
  name: string;
  unit: string;
  category: string;
}

export interface TestLogCapsule {
  type: "test_log_capsule";
  prefilledTestType?: string;
  prefilledDate?: string;
  catalog: CapsuleCatalogItem[];
  recentTests?: Array<{ id: string; name: string; lastValue: number; lastDate: string }>;
}

export interface CheckinCapsule {
  type: "checkin_capsule";
  prefilledDate: string;
  lastCheckinDate?: string;
}

export interface CapsuleProgramAction {
  programId: string;
  programName: string;
  frequency: string;
  duration: string;
  priority: "high" | "medium" | "low";
  currentStatus?: "active" | "done" | "dismissed" | null;
  availableActions: Array<"done" | "dismissed" | "active" | "player_selected" | "schedule" | "details" | "add_to_training">;
}

export interface ProgramActionCapsule {
  type: "program_action_capsule";
  programId: string;
  programName: string;
  frequency: string;
  duration: string;
  priority: "high" | "medium" | "low";
  currentStatus?: "active" | "done" | "dismissed" | null;
  availableActions: Array<"done" | "dismissed" | "active" | "player_selected" | "schedule" | "details" | "add_to_training">;
}

export interface CVEditCapsuleField {
  field: string;
  label: string;
  inputType: "selector" | "number" | "text" | "date";
  options?: string[];
  currentValue: string | number | null;
  unit?: string;
}

export interface CVEditCapsule {
  type: "cv_edit_capsule";
  fields: CVEditCapsuleField[];
}

export interface ClubEditCapsuleEntry {
  id: string;
  entry_type: string;
  club_name: string;
  league_level: string | null;
  country: string | null;
  position: string | null;
  started_month: string | null;
  ended_month: string | null;
  is_current: boolean;
  appearances: number | null;
  goals: number | null;
  assists: number | null;
}

export interface ClubEditCapsule {
  type: "club_edit_capsule";
  existingEntries: ClubEditCapsuleEntry[];
  currentClub: ClubEditCapsuleEntry | null;
}

export interface NavigationCapsule {
  type: "navigation_capsule";
  icon: string;
  target: string;
  label: string;
  description: string;
  deepLink: {
    tabName: string;
    params?: Record<string, any>;
  };
}

export interface QuickActionCapsuleAction {
  label: string;
  toolName: string;
  toolInput: Record<string, any>;
  agentType: string;
  style: "primary" | "secondary" | "destructive";
}

export interface QuickActionCapsule {
  type: "quick_action_capsule";
  icon: string;
  headline: string;
  description?: string;
  actions: QuickActionCapsuleAction[];
}

export interface EventEditCapsule {
  type: "event_edit_capsule";
  mode: "create" | "update" | "delete";
  prefilledTitle?: string;
  prefilledEventType?: "training" | "match" | "study" | "exam" | "recovery" | "other";
  prefilledDate?: string;
  prefilledStartTime?: string;
  prefilledEndTime?: string;
  prefilledIntensity?: "REST" | "LIGHT" | "MODERATE" | "HARD";
  prefilledCategory?: string;
  prefilledDuration?: number;
  trainingCategories?: Array<{ id: string; label: string; icon?: string }>;
  existingEvents?: Array<{
    id: string;
    title: string;
    eventType: string;
    date: string;
    startTime: string;
    endTime: string;
    intensity?: string;
  }>;
  selectedEventId?: string;
}

export interface DrillRatingCapsule {
  type: "drill_rating_capsule";
  drillId: string;
  drillName: string;
  category?: string;
  completedAt?: string;
}

// ── Capsule Action Payload — sent from frontend on capsule submit ──

export interface CapsuleAction {
  type: string;
  toolName: string;
  toolInput: Record<string, any>;
  agentType: string;
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
  | PHVAssessmentCard
  | TestLogCapsule
  | CheckinCapsule
  | ProgramActionCapsule
  | CVEditCapsule
  | ClubEditCapsule
  | NavigationCapsule
  | QuickActionCapsule
  | EventEditCapsule
  | DrillRatingCapsule
  | ScheduleRulesCapsule
  | TrainingScheduleCapsule
  | StudyScheduleCapsule
  | ConflictResolutionCapsule
  | PHVCalculatorCapsule
  | StrengthsGapsCapsule
  | PadelShotCapsule
  | BlazePodsCapsule
  | NotificationSettingsCapsule
  | ProgramInteractCapsule
  | GhostSuggestionCapsule
  | DayLockCapsule
  | WhoopSyncCapsule
  | LeaderboardCapsule
  | ExamCapsule
  | SubjectCapsule
  | TrainingCategoryCapsule
  | BulkTimelineEditCapsule
  | TrainingJournalPreCapsule
  | TrainingJournalPostCapsule
  | RegularStudyCapsule;

export interface RegularStudyCapsule {
  type: "regular_study_capsule";
  studySubjects: string[];
  currentConfig: { subjects: string[]; days: number[]; sessionDurationMin: number; planWeeks: number } | null;
  hasExistingPlan: boolean;
  existingSessionCount?: number;
}

export interface ExamCapsule { type: "exam_capsule"; existingExams: Array<{ id: string; subject: string; examType: string; examDate: string }>; studySubjects?: string[]; }
export interface SubjectCapsule { type: "subject_capsule"; currentSubjects: string[]; }
export interface TrainingCategoryCapsule { type: "training_category_capsule"; currentCategories: Array<Record<string, any>>; }
export interface BulkTimelineEditCapsule {
  type: "bulk_timeline_edit_capsule";
  events: Array<{ id: string; title: string; eventType: string; date: string; startTime: string; endTime: string; intensity?: string }>;
  groupedEvents: Array<{ key: string; title: string; eventType: string; timeSlot: string; count: number; eventIds: string[] }>;
}

export interface PHVCalculatorCapsule { type: "phv_calculator_capsule"; sex?: string; dob?: string; standingHeightCm?: number; sittingHeightCm?: number; weightKg?: number; previousOffset?: number; previousStage?: string; }
export interface StrengthsGapsCapsule { type: "strengths_gaps_capsule"; overallPercentile: number; strengths: Array<Record<string, any>>; gaps: Array<Record<string, any>>; totalMetrics: number; }
export interface PadelShotCapsule { type: "padel_shot_capsule"; shotTypes: string[]; }
export interface BlazePodsCapsule { type: "blazepods_capsule"; drillTypes: string[]; }
export interface NotificationSettingsCapsule { type: "notification_settings_capsule"; current: Record<string, any>; }

export interface ProgramInteractCapsule {
  type: "program_interact_capsule";
  programs: Array<Record<string, any>>;
}

export interface GhostSuggestionCapsule {
  type: "ghost_suggestion_capsule";
  suggestions: Array<Record<string, any>>;
}

export interface DayLockCapsule {
  type: "day_lock_capsule";
  date: string;
  locked: boolean;
}

export interface WhoopSyncCapsule {
  type: "whoop_sync_capsule";
  connected: boolean;
  lastSyncAt?: string;
  syncResult?: Record<string, any>;
}

export interface TrainingJournalPreCapsule {
  type: "training_journal_pre_capsule";
  calendar_event_id: string;
  event_name: string;
  event_time: string;
  event_category: string;
  journal_variant: string;
  existing_target?: string;
  existing_cue?: string;
  todays_trainings?: Array<Record<string, any>>;
}

export interface TrainingJournalPostCapsule {
  type: "training_journal_post_capsule";
  calendar_event_id: string;
  journal_id: string;
  event_name: string;
  event_date: string;
  journal_variant: string;
  pre_target: string | null;
  pending_journals?: Array<Record<string, any>>;
}

export interface LeaderboardCapsule {
  type: "leaderboard_capsule";
  boardType: string;
  entries: Array<Record<string, any>>;
  userRank: number | null;
}

export interface ScheduleRulesCapsule {
  type: "schedule_rules_capsule";
  scenario: string;
  current: Record<string, any>;
}

export interface TrainingScheduleCapsule {
  type: "training_schedule_capsule";
  categories: Array<Record<string, any>>;
  defaultWeeks: number;
}

export interface StudyScheduleCapsule {
  type: "study_schedule_capsule";
  exams: Array<Record<string, any>>;
  studySubjects: string[];
  preExamStudyWeeks: number;
  daysPerSubject: number;
  examPeriodActive: boolean;
  hasStudyPlan?: boolean;
  studyPlanBlockCount?: number;
  studyPlanDateRange?: string;
}

export interface ConflictResolutionCapsule {
  type: "conflict_resolution_capsule";
  conflicts: Array<{
    date: string;
    issue: string;
    severity: "warning" | "danger";
    events: Array<{
      id: string;
      title: string;
      eventType: string;
      localStart: string;
      localEnd: string;
      intensity?: string;
    }>;
    suggestions: Array<{ label: string; action: string }>;
  }>;
  daysChecked: number;
  totalEvents: number;
}

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
  // Strategy 1: Look for ```json ... ``` fenced block
  const fencedMatch = rawText.match(/```json\s*([\s\S]*?)```/);
  if (fencedMatch) {
    try {
      const parsed = JSON.parse(fencedMatch[1]);
      if (parsed.headline && Array.isArray(parsed.cards)) {
        return parsed as TomoResponse;
      }
    } catch {
      // Not valid JSON in fenced block
    }
  }

  // Strategy 2: Try parsing the entire text as JSON (Claude sometimes returns pure JSON)
  const trimmed = rawText.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed.headline && Array.isArray(parsed.cards)) {
        return parsed as TomoResponse;
      }
    } catch {
      // Not valid JSON
    }
  }

  // Strategy 3: Find the outermost { ... } that contains "headline" using brace matching
  const firstBrace = rawText.indexOf('{');
  if (firstBrace >= 0 && rawText.includes('"headline"') && rawText.includes('"cards"')) {
    let depth = 0;
    let start = firstBrace;
    for (let i = firstBrace; i < rawText.length; i++) {
      if (rawText[i] === '{') depth++;
      else if (rawText[i] === '}') {
        depth--;
        if (depth === 0) {
          try {
            const parsed = JSON.parse(rawText.substring(start, i + 1));
            if (parsed.headline && Array.isArray(parsed.cards)) {
              return parsed as TomoResponse;
            }
          } catch {
            // Continue looking
          }
          break;
        }
      }
    }
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
Return JSON in \`\`\`json markers. Schema:
{ "headline": "Max 8 words", "cards": [VisualCard...], "chips": [{ "label": "text", "action": "message" }] }

CARD TYPES (use the right one):
- stat_grid: { type, items: [{ label, value, unit, highlight? }] } — for 3+ metrics (readiness, load). IMPORTANT: "unit" is ONLY for measurement symbols like "/10", "ms", "bpm", "%", "hrs", "AU". NEVER put descriptive text in unit (no "Status", "Green zone", "moderate concern"). Examples: { label: "Readiness", value: "YELLOW", unit: "" }, { label: "ACWR", value: "0.62", unit: "" }, { label: "Energy", value: 6, unit: "/10" }
- stat_row: { type, label, value, unit, trend?, emoji? } — single stat. Same unit rules: measurement symbols only.
- schedule_list: { type, date?, items: [{ time, title, type, clash? }] } — FOR ALL schedule/calendar queries: today, tomorrow, this week, what's on, training windows. ALWAYS use this, never describe events in text_card.
- zone_stack: { type, current, levels: [{ zone, label, detail }] } — exam/load zones
- clash_list: { type, clashes: [{ event1, event2, time, fix }] } — conflicts
- benchmark_bar: { type, metric, value, percentile, unit, ageBand } — percentile bar
- text_card: { type, headline, body, emoji? } — brief advice only (max 2 sentences, NO lists, NO schedule data)
- coach_note: { type, note } — single coaching insight sentence
- session_plan: { type, title, totalDuration, readiness, items: [{ drillId, name, category, duration, intensity, attributeKeys?, reason? }] }
- drill_card: { type, drillId, name, description, category, duration, intensity, equipment, instructions, tags }
- program_recommendation: { type, programs: [{ programId, name, category, priority, weeklyFrequency, durationMin, startingPoint?, positionNote? }], weeklyPlanSuggestion, playerProfile }
- phv_assessment: { type, phvStage, maturityOffset, loadingMultiplier, trainingPriorities, safetyWarnings, trainingImplication }
- test_log_capsule: call get_test_catalog, copy readyToUseCapsuleCard into cards array
- checkin_capsule: { type, prefilledDate, lastCheckinDate? }

RULES:
- Valid JSON in \`\`\`json markers only. No text outside the \`\`\`json block.
- NEVER use markdown syntax (**bold**, *italic*, # headers, numbered/bulleted lists) inside any card field value. Plain text only.
- stat_grid for 3+ metrics, NOT multiple stat_rows.
- schedule_list for ANY calendar/schedule display — NEVER dump schedule data into a text_card body.
- text_card body: plain prose only, max 2 sentences, no lists, no colons introducing event sequences.
- Headline is most important — Gen Z reads it first.
- 1-3 chips as follow-up actions.
- Chip action text = intent ("Log my sprint") never past-tense ("I did a sprint").
`;
