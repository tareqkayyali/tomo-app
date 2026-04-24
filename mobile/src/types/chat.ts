/**
 * Chat Types — Frontend type definitions for Tomo structured responses.
 * Mirrors backend/services/agents/responseFormatter.ts
 */

// ── Card Types ───────────────────────────────────────────────────

export type CardType =
  | 'stat_row'
  | 'stat_grid'
  | 'schedule_list'
  | 'zone_stack'
  | 'clash_list'
  | 'benchmark_bar'
  | 'text_card'
  | 'coach_note'
  | 'confirm_card'
  | 'session_plan'
  | 'drill_card'
  | 'schedule_preview'
  // Capsule card types — interactive cards with inline inputs
  | 'test_log_capsule'
  | 'checkin_capsule'
  | 'program_action_capsule'
  | 'cv_edit_capsule'
  | 'club_edit_capsule'
  | 'navigation_capsule'
  | 'quick_action_capsule'
  | 'week_schedule'
  | 'week_plan'
  | 'choice_card'
  | 'training_journal_pre_capsule'
  | 'training_journal_post_capsule';

export interface StatRow {
  type: 'stat_row';
  label: string;
  value: string | number;
  unit?: string;
  trend?: 'up' | 'down' | 'flat';
  emoji?: string;
}

export interface ScheduleItem {
  time: string;
  title: string;
  type: 'training' | 'match' | 'study' | 'rest' | 'exam' | 'gym' | 'personal_dev' | 'club_training' | 'recovery' | 'other';
  clash?: boolean;
  intensity?: string;
  notes?: string;
}

export interface ScheduleList {
  type: 'schedule_list';
  date: string;
  items: ScheduleItem[];
}

export interface WeekDaySchedule {
  dayLabel: string;
  items: ScheduleItem[];
}

export interface WeekSchedule {
  type: 'week_schedule';
  summary: string;
  days: WeekDaySchedule[];
}

// ── Week Plan Card (Pulse design — colored pills per day) ──────
export interface WeekPlanTag {
  label: string;
  color: 'green' | 'yellow' | 'red' | 'blue' | 'orange' | 'gray';
}

export interface WeekPlanDay {
  day: string;                  // "MON", "TUE", etc.
  tags: WeekPlanTag[];          // Colored pills like [Football] [Gym]
  note?: string;                // e.g. "Light activation only"
  time?: string;                // e.g. "19:30" or "TBC"
}

export interface WeekPlan {
  type: 'week_plan';
  title?: string;               // "WEEK PLAN"
  date_range?: string;          // "Apr 13–19"
  days: WeekPlanDay[];
}

// ── Choice Card (interactive options — radio-style) ────────────
export interface ChoiceOption {
  label: string;
  description?: string;
  value: string;                // sent as chip message when tapped
}

export interface ChoiceCard {
  type: 'choice_card';
  headline: string;
  options: ChoiceOption[];
}

export interface ZoneLevel {
  zone: 'green' | 'yellow' | 'red';
  label: string;
  detail: string;
}

export interface ZoneStack {
  type: 'zone_stack';
  current: 'green' | 'yellow' | 'red';
  levels: ZoneLevel[];
}

export interface ClashItem {
  event1: string;
  event2: string;
  time: string;
  fix: string;
}

export interface ClashList {
  type: 'clash_list';
  clashes: ClashItem[];
}

export interface BenchmarkBar {
  type: 'benchmark_bar';
  metric: string;
  value: number;
  percentile: number;
  unit: string;
  ageBand: string;
}

export interface TextCard {
  type: 'text_card';
  headline: string;
  body: string;
  emoji?: string;
}

export interface CoachNote {
  type: 'coach_note';
  note: string;
  source?: string;
}

export interface ProgramRecommendationItem {
  programId: string;
  name: string;
  category: string;
  priority: 'mandatory' | 'high' | 'medium';
  weeklyFrequency: number;
  durationMin: number;
  startingPoint?: string;
  positionNote?: string;
}

export interface ProgramRecommendationCard {
  type: 'program_recommendation';
  programs: ProgramRecommendationItem[];
  weeklyPlanSuggestion: string;
  playerProfile: {
    name: string;
    position: string;
    ageBand: string;
    phvStage: string;
  };
}

export interface StatGridItem {
  label: string;
  value: string | number;
  unit?: string;
  highlight?: boolean;
}

export interface StatGrid {
  type: 'stat_grid';
  items: StatGridItem[];
}

export interface ConfirmCard {
  type: 'confirm_card';
  headline: string;
  body: string;
  confirmLabel: string;
  cancelLabel?: string;
}

// ── Session Plan & Drill Cards ───────────────────────────────────

export interface SessionPlanItem {
  drillId: string;
  name: string;
  category: 'warmup' | 'training' | 'cooldown' | 'recovery' | 'activation';
  duration: number;
  intensity: 'light' | 'moderate' | 'hard';
  attributeKeys: string[];
  reason?: string;
}

export interface SessionPlan {
  type: 'session_plan';
  title: string;
  totalDuration: number;
  readiness: string;
  items: SessionPlanItem[];
}

export interface DrillCard {
  type: 'drill_card';
  drillId: string;
  name: string;
  description: string;
  category: string;
  duration: number;
  intensity: 'light' | 'moderate' | 'hard';
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
  violations: Array<{ type: string; message: string; severity: 'error' | 'warning' }>;
  alternatives: Array<{ startTime: string; endTime: string }>;
  accepted: boolean;
}

export interface SchedulePreviewCard {
  type: 'schedule_preview';
  events: SchedulePreviewEvent[];
  summary: { total: number; withViolations: number; blocked: number };
  scenario: string;
  confirmAction: string;
  confirmPayload: string;
}

// ── Capsule Card Types — interactive inline forms ────────────────

export interface CapsuleCatalogItem {
  id: string;
  name: string;
  unit: string;
  category: string;
}

export interface TestLogCapsule {
  type: 'test_log_capsule';
  prefilledTestType?: string;
  prefilledDate?: string;
  catalog: CapsuleCatalogItem[];
  recentTests?: Array<{ id: string; name: string; lastValue: number; lastDate: string }>;
}

export interface CheckinCapsule {
  type: 'checkin_capsule';
  prefilledDate: string;
  lastCheckinDate?: string;
}

export interface ExamCapsule {
  type: 'exam_capsule';
  existingExams: Array<{ id: string; subject: string; examType: string; examDate: string }>;
  studySubjects?: string[];
}

export interface SubjectCapsule {
  type: 'subject_capsule';
  currentSubjects: string[];
}

export interface TrainingCategoryCapsule {
  type: 'training_category_capsule';
  currentCategories: Array<{
    id: string;
    label: string;
    enabled: boolean;
    daysPerWeek: number;
    sessionDuration: number;
    preferredTime: string;
  }>;
}

export interface ProgramActionCapsule {
  type: 'program_action_capsule';
  programId: string;
  programName: string;
  frequency: string;
  duration: string;
  priority: 'high' | 'medium' | 'low';
  /** Short rationale / description from snapshot or recommendation engine */
  summary?: string;
  currentStatus?: 'active' | 'done' | 'dismissed' | null;
  /** Server/LLM may omit; client defaults to a safe CTA set. */
  availableActions?: Array<'done' | 'dismissed' | 'active' | 'player_selected' | 'schedule' | 'details' | 'add_to_training'>;
}

export interface CVEditCapsuleField {
  field: string;
  label: string;
  inputType: 'selector' | 'number' | 'text' | 'date';
  options?: string[];
  currentValue: string | number | null;
  unit?: string;
}

export interface CVEditCapsule {
  type: 'cv_edit_capsule';
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
  type: 'club_edit_capsule';
  existingEntries: ClubEditCapsuleEntry[];
  currentClub: ClubEditCapsuleEntry | null;
}

export interface NavigationCapsule {
  type: 'navigation_capsule';
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
  style: 'primary' | 'secondary' | 'destructive';
}

export interface QuickActionCapsule {
  type: 'quick_action_capsule';
  icon: string;
  headline: string;
  description?: string;
  actions: QuickActionCapsuleAction[];
}

export interface EventEditCapsule {
  type: 'event_edit_capsule';
  mode: 'create' | 'update' | 'delete';
  /** Pre-filled values from natural language parsing */
  prefilledTitle?: string;
  prefilledEventType?: 'training' | 'match' | 'study' | 'exam' | 'recovery' | 'other';
  prefilledDate?: string;
  prefilledStartTime?: string;
  prefilledEndTime?: string;
  prefilledIntensity?: 'REST' | 'LIGHT' | 'MODERATE' | 'HARD';
  prefilledCategory?: string;
  prefilledDuration?: number; // minutes
  /** Player's custom training categories from schedule preferences */
  trainingCategories?: Array<{ id: string; label: string; icon?: string }>;
  /** For update/delete: existing events to pick from */
  existingEvents?: Array<{
    id: string;
    title: string;
    eventType: string;
    date: string;
    startTime: string;
    endTime: string;
    intensity?: string;
  }>;
  /** For update: the event being edited */
  selectedEventId?: string;
}

export interface DrillRatingCapsule {
  type: 'drill_rating_capsule';
  drillId: string;
  drillName: string;
  category?: string;
  completedAt?: string;
}

export interface ScheduleRulesCapsule {
  type: 'schedule_rules_capsule';
  /** Current scenario */
  scenario: 'normal' | 'league_active' | 'exam_period' | 'league_and_exam';
  /** Current values for pre-filling */
  current: {
    schoolDays: number[];
    schoolStart: string;
    schoolEnd: string;
    sleepStart: string;
    sleepEnd: string;
    leagueIsActive: boolean;
    examPeriodActive: boolean;
    bufferDefaultMin: number;
    bufferPostMatchMin: number;
    bufferPostHighIntensityMin: number;
    studyDays: number[];
    studyStart: string;
    studyDurationMin: number;
  };
}

export interface TrainingScheduleCapsule {
  type: 'training_schedule_capsule';
  /** Player's training categories with current config */
  categories: Array<{
    id: string;
    label: string;
    icon?: string;
    enabled: boolean;
    mode: 'fixed_days' | 'days_per_week';
    fixedDays: number[];
    daysPerWeek: number;
    sessionDuration: number;
    preferredTime: string;
  }>;
  /** Default plan duration in weeks */
  defaultWeeks: number;
}

export interface StudyScheduleCapsule {
  type: 'study_schedule_capsule';
  /** Current exams with countdown */
  exams: Array<{
    id: string;
    subject: string;
    examType: string;
    examDate: string;
    daysUntil: number;
  }>;
  /** Available study subjects */
  studySubjects: string[];
  /** Current config */
  preExamStudyWeeks: number;
  daysPerSubject: number;
  examPeriodActive: boolean;
  /** Existing study plan info */
  hasStudyPlan?: boolean;
  studyPlanBlockCount?: number;
  studyPlanDateRange?: string;
}

export interface PHVCalculatorCapsule {
  type: 'phv_calculator_capsule';
  /** Pre-filled from profile */
  sex?: 'male' | 'female';
  dob?: string;
  standingHeightCm?: number;
  sittingHeightCm?: number;
  weightKg?: number;
  /** Previous result if exists */
  previousOffset?: number;
  previousStage?: string;
}

export interface StrengthsGapsCapsule {
  type: 'strengths_gaps_capsule';
  overallPercentile: number;
  strengths: Array<{ metric: string; percentile: number; value: number; unit: string }>;
  gaps: Array<{ metric: string; percentile: number; value: number; unit: string }>;
  totalMetrics: number;
}

export interface PadelShotCapsule {
  type: 'padel_shot_capsule';
  shotTypes: string[];
}

export interface BlazePodsCapsule {
  type: 'blazepods_capsule';
  drillTypes: string[];
}

export interface NotificationSettingsCapsule {
  type: 'notification_settings_capsule';
  current: {
    dailyReminder: boolean;
    dailyReminderTime: string;
    streakReminders: boolean;
    milestoneAlerts: boolean;
    redDayGuidance: boolean;
    weeklySummary: boolean;
  };
}

export interface ProgramInteractCapsule {
  type: 'program_interact_capsule';
  programs: Array<{
    programId: string;
    name: string;
    category: string;
    status: 'recommended' | 'active' | 'done' | 'dismissed';
    description?: string;
  }>;
}

export interface GhostSuggestionCapsule {
  type: 'ghost_suggestion_capsule';
  suggestions: Array<{
    patternKey: string;
    name: string;
    eventType: string;
    date: string;
    startTime: string | null;
    endTime: string | null;
    confidence: number;
    patternDescription: string;
  }>;
}

export interface DayLockCapsule {
  type: 'day_lock_capsule';
  date: string;
  locked: boolean;
}

export interface WhoopSyncCapsule {
  type: 'whoop_sync_capsule';
  connected: boolean;
  lastSyncAt?: string;
  /** Result after sync */
  syncResult?: {
    recoveries: number;
    sleeps: number;
    workouts: number;
  };
}

export interface LeaderboardCapsule {
  type: 'leaderboard_capsule';
  boardType: 'global' | 'archetype' | 'streaks';
  entries: Array<{
    rank: number;
    name: string;
    sport: string;
    totalPoints: number;
    currentStreak: number;
    isCurrentUser: boolean;
  }>;
  userRank: number | null;
}

export interface BulkTimelineEditCapsule {
  type: 'bulk_timeline_edit_capsule';
  events: Array<{
    id: string;
    title: string;
    eventType: string;
    date: string;
    startTime: string;
    endTime: string;
    intensity?: string;
  }>;
  groupedEvents: Array<{
    key: string;
    title: string;
    eventType: string;
    timeSlot: string;
    count: number;
    eventIds: string[];
  }>;
}

export interface ConflictResolutionCapsule {
  type: 'conflict_resolution_capsule';
  conflicts: Array<{
    date: string;
    issue: string;
    severity: 'warning' | 'danger';
    events: Array<{
      id: string;
      title: string;
      eventType: string;
      localStart: string;
      localEnd: string;
      intensity?: string;
    }>;
    /** Suggested resolution actions */
    suggestions: Array<{
      label: string;
      action: string; // chat message to send
    }>;
  }>;
  daysChecked: number;
  totalEvents: number;
}

// ── Week Planner Capsules ────────────────────────────────────────

export interface WeekScopeOption {
  id: 'this' | 'next' | 'after';
  label: string;
  description: string;
}

export interface WeekScopeMode {
  id: string;
  label: string;
  description?: string | null;
  icon?: string | null;
  color?: string | null;
}

export interface WeekScopeCapsule {
  type: 'week_scope_capsule';
  weeks: WeekScopeOption[];
  modes: WeekScopeMode[];
  currentMode: string | null;
}



export type WeekPlanCategoryId =
  | 'club'
  | 'gym'
  | 'personal'
  | 'recovery'
  | 'individual_technical'
  | 'tactical'
  | 'match_competition'
  | 'mental_performance';

export type WeekPlanPlacement = 'fixed' | 'flexible';
export type WeekPlanPreferredTime = 'morning' | 'afternoon' | 'evening';

export interface TrainingMixItem {
  // WeekPlanCategoryId is the catalog-seeded set; athletes can add custom
  // categories from the Training Mix capsule, so the runtime value may be
  // any slug. The `string & {}` keeps IDE autocomplete on the known ids.
  category: WeekPlanCategoryId | (string & {});
  sessionsPerWeek: number;
  durationMin: number;
  placement: WeekPlanPlacement;
  fixedDays?: number[];
  preferredTime?: WeekPlanPreferredTime;
  label?: string;
  defaultMode?: string;
  defaultSessionsPerWeek?: number;
  defaultDurationMin?: number;
  defaultPreferredTime?: WeekPlanPreferredTime;
}

export interface StudyMixItem {
  subject: string;
  sessionsPerWeek: number;
  durationMin: number;
  placement: WeekPlanPlacement;
  fixedDays?: number[];
  preferredTime?: WeekPlanPreferredTime;
  isExamSubject?: boolean;
}

export interface TrainingMixCapsule {
  type: 'training_mix_capsule';
  weekStart: string;
  categories: TrainingMixItem[];
  notes?: Array<{ level: 'info' | 'warn'; text: string }>;
}

export interface StudyPlanCapsule {
  type: 'study_plan_capsule';
  weekStart: string;
  subjects: StudyMixItem[];
}

export interface WeekPlanItemAdjustment {
  move: 'time_shift' | 'day_shift' | 'swap';
  from: { date: string; startTime: string };
  to: { date: string; startTime: string };
  reason: string;
}

export type WeekPlanItemStatus = 'clean' | 'adjusted' | 'dropped';

export interface WeekPlanPreviewItem {
  title: string;
  category: string;
  subject?: string;
  date: string;
  startTime: string;
  endTime: string;
  durationMin: number;
  eventType: 'training' | 'match' | 'study' | 'recovery';
  intensity: 'LIGHT' | 'MODERATE' | 'HARD';
  placementReason: string;
  predictedLoadAu: number;
  status?: WeekPlanItemStatus;
  adjustments?: WeekPlanItemAdjustment[];
}

export interface WeekPlanSummary {
  trainingSessions: number;
  studySessions: number;
  totalMinutes: number;
  hardSessions: number;
  predictedLoadAu: number;
}

export interface WeekPlanWarning {
  code: string;
  category: string;
  message: string;
  date?: string;
}

export interface WeekPlanPreviewCapsule {
  type: 'week_plan_preview_capsule';
  weekStart: string;
  planItems: WeekPlanPreviewItem[];
  summary: WeekPlanSummary;
  warnings: WeekPlanWarning[];
}

// ── Training Journal Capsules ────────────────────────────────────

export interface TrainingJournalPreCapsule {
  type: 'training_journal_pre_capsule';
  calendar_event_id: string;
  event_name: string;
  event_time: string;
  event_category: string;
  journal_variant: 'standard' | 'recovery' | 'match';
  existing_target?: string;
  existing_cue?: string;
  todays_trainings?: Array<{
    eventId: string;
    name: string;
    eventType: string;
    startTime: string;
    journalState: string;
    journalVariant: string;
    hasPreJournal: boolean;
  }>;
}

export interface TrainingJournalPostCapsule {
  type: 'training_journal_post_capsule';
  calendar_event_id: string;
  journal_id: string;
  event_name: string;
  event_date: string;
  journal_variant: 'standard' | 'recovery' | 'match';
  pre_target: string | null;
  pending_journals?: Array<{
    journalId: string;
    eventId: string;
    name: string;
    date: string;
    state: string;
  }>;
}

export interface RegularStudyCapsule {
  type: 'regular_study_capsule';
  studySubjects: string[];
  currentConfig: {
    subjects: string[];
    days: number[];          // 0=Sun..6=Sat
    sessionDurationMin: number;
    planWeeks: number;
  } | null;
  hasExistingPlan: boolean;
  existingSessionCount?: number;
}

// ── Scheduling Capsule (interactive session booking) ────────────
export interface SchedulingCapsule {
  type: 'scheduling_capsule';
  context?: {
    prefilledTitle?: string;
    prefilledDate?: string;
    prefilledFocus?: string;
    prefilledTime?: string;
    prefilledIntensity?: string;
    days: Array<{
      date: string;
      label: string;
      dayOfWeek: string;
      existingEvents: Array<{ id: string; name: string; startTime: string; endTime: string; type: string }>;
      availableSlots: Array<{ start24: string; end24: string; label: string; score: number }>;
    }>;
    focusOptions: Array<{ id: string; label: string }>;
    intensityOptions: Array<{ id: string; label: string }>;
    trainingCategories?: Array<{ id: string; label: string }>;
    readinessLevel?: string;
    sport?: string;
    durationMin?: number;
  };
}

/** Study session picker — pre-fetched slots + subjects (ai-service study_scheduling_capsule) */
export interface StudySchedulingCapsule {
  type: 'study_scheduling_capsule';
  context?: {
    prefilledSubject?: string | null;
    prefilledDate?: string;
    days: Array<{
      date: string;
      label: string;
      dayOfWeek: string;
      existingEvents: Array<{ id: string; name: string; startTime: string; endTime: string; type: string }>;
      availableSlots: Array<{ start24: string; end24: string; label: string; score: number }>;
      isSchoolDay?: boolean;
      schoolStart?: string | null;
      schoolEnd?: string | null;
      isStudyDay?: boolean;
    }>;
    subjectOptions: Array<{
      id: string;
      label: string;
      examDate?: string;
      examType?: string;
      daysUntil?: number;
      urgency?: string;
    }>;
    durationOptions: Array<{ id: number; label: string }>;
    durationMin?: number;
    schoolDays?: number[];
    schoolHours?: { start: string; end: string };
    studyDays?: number[];
    examSchedule?: unknown[];
  };
}

// ── Capsule Action — sent from frontend on capsule submit ────────

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
  | ExamCapsule
  | SubjectCapsule
  | TrainingCategoryCapsule
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
  | BulkTimelineEditCapsule
  | TrainingJournalPreCapsule
  | TrainingJournalPostCapsule
  | RegularStudyCapsule
  | SchedulingCapsule
  | StudySchedulingCapsule
  | WeekScopeCapsule
  | TrainingMixCapsule
  | StudyPlanCapsule
  | WeekPlanPreviewCapsule
  | ProgramRecommendationCard
  | WeekSchedule
  | WeekPlan
  | ChoiceCard
  | InjuryCard
  | GoalCard
  | DailyBriefingCard;

// ── Injury Card ─────────────────────────────────────────────────
export interface InjuryCard {
  type: 'injury_card';
  location: string;
  severity: 1 | 2 | 3;
  severityLabel: string;
  loggedAt?: string;
  recoveryTip?: string;
  autoAdjustedSession?: boolean;
}

// ── Goal Card ───────────────────────────────────────────────────
export interface GoalCard {
  type: 'goal_card';
  title: string;
  targetValue?: number;
  targetUnit?: string;
  currentValue?: number;
  progressPct: number;
  deadline?: string;
  daysRemaining?: number | null;
  trend?: 'on_track' | 'behind' | 'achieved';
}

// ── Daily Briefing Card ─────────────────────────────────────────
export interface DailyBriefingCard {
  type: 'daily_briefing_card';
  date: string;
  readinessColor: string;
  readinessScore?: number;
  acwr?: number;
  loadZone?: string;
  eventCount: number;
  trainingCount: number;
  matchCount: number;
  urgentGoals?: Array<{ title: string; progressPct: number; daysRemaining: number }>;
  pendingJournalCount?: number;
  briefingSummary: string;
}

// ── Action Chips ─────────────────────────────────────────────────

export interface ActionChip {
  label: string;
  /** Python AI service sends 'message', TS legacy sends 'action' — accept both */
  action: string;
  message?: string;
}

export interface ConfirmAction {
  label: string;
  toolName: string;
  toolInput: Record<string, any>;
  agentType: string;
}

// ── TomoResponse ─────────────────────────────────────────────────

export interface TomoResponse {
  headline: string;
  /** Coaching body text — 2-4 sentences of interpretation and advice */
  body?: string;
  cards: VisualCard[];
  chips?: ActionChip[];
  /**
   * Response context tags from the finite taxonomy in
   * backend/lib/chatPills/tagTaxonomy.ts. Mobile does not consume them;
   * kept optional for backend/mobile type parity.
   */
  contextTags?: string[];
  confirm?: ConfirmAction;
}

// ── Session Types ────────────────────────────────────────────────

export interface ChatSession {
  id: string;
  user_id: string;
  title: string;
  ended_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChatMessageRecord {
  id: string;
  session_id: string;
  user_id: string;
  role: 'user' | 'assistant';
  content: string;
  structured: TomoResponse | null;
  agent: string | null;
  token_count: number;
  created_at: string;
}
