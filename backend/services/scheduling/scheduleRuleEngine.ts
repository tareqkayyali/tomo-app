/**
 * Schedule Rule Engine — Single source of truth for all scheduling logic.
 *
 * Governs: AI Command Center, Training Plans, Study Plans, Auto-Fill, Ghost Suggestions.
 * Pure functions — no DB deps, no React deps. Can run on frontend + backend identically.
 *
 * Architecture:
 *   - MASTER_RULES: Universal constraints (priority order, buffer times, intensity caps)
 *   - SCENARIO_MODIFIERS: Phase-specific adjustments (Normal, League, Exam, League+Exam)
 *   - REFERENCE_TEMPLATES: What a correct week looks like per scenario (for AI grounding)
 *   - getEffectiveRules(): Merges master + scenario + player prefs → typed config
 *   - buildRuleContext(): Generates text block for AI system prompt injection
 *   - buildExamStudyBlocks(): Produces study event proposals for exam prep
 */

// ── Types ────────────────────────────────────────────────────────

export type ScenarioId = "normal" | "league_active" | "exam_period" | "league_and_exam";
export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0=Sun..6=Sat
export type IntensityCap = "REST" | "LIGHT" | "MODERATE" | "HARD";

export interface PlayerSchedulePreferences {
  // School
  school_days: DayOfWeek[];
  school_start: string;   // HH:MM
  school_end: string;     // HH:MM

  // Sleep (determines day bounds)
  sleep_start: string;    // HH:MM — bedtime (e.g. "22:00")
  sleep_end: string;      // HH:MM — wake time (e.g. "06:00")

  // Day bounds (derived from sleep, overridable)
  day_bounds_start: string; // HH:MM — earliest schedulable time
  day_bounds_end: string;   // HH:MM — latest schedulable time

  // Study
  study_days: DayOfWeek[];
  study_start: string;
  study_duration_min: number;

  // Gym / individual training
  gym_days: DayOfWeek[];
  gym_start: string;
  gym_duration_min: number;

  // Personal development (film study, tactical review, etc.)
  personal_dev_days: DayOfWeek[];
  personal_dev_start: string;

  // Club / academy training
  club_days: DayOfWeek[];
  club_start: string;

  // Buffers
  buffer_default_min: number;
  buffer_post_match_min: number;
  buffer_post_high_intensity_min: number;

  // Scenario flags
  league_is_active: boolean;
  exam_period_active: boolean;

  // Exam details (for study plan generation)
  exam_subjects: string[];
  exam_start_date: string | null; // YYYY-MM-DD
  pre_exam_study_weeks: number;
  days_per_subject: number;

  // Training categories (flexible schema)
  training_categories?: TrainingCategoryRule[];

  // Exam schedule entries
  exam_schedule?: ExamScheduleEntry[];

  // Study subjects
  study_subjects?: string[];
}

export interface TrainingCategoryRule {
  id: string;
  label: string;
  icon: string;
  color: string;
  enabled: boolean;
  mode: "fixed_days" | "days_per_week";
  fixedDays: number[];
  daysPerWeek: number;
  sessionDuration: number;
  preferredTime: "morning" | "afternoon" | "evening";
}

export interface ExamScheduleEntry {
  id: string;
  subject: string;
  examType: string;
  examDate: string; // YYYY-MM-DD
}

export interface ScheduleRule {
  id: string;
  category: string;
  priority: number;           // 1 = highest, placed first
  name: string;
  days: DayOfWeek[];
  startTime: string;          // HH:MM
  endTime: string;            // HH:MM
  intensity: IntensityCap;
  locked: boolean;            // true = immovable (school, exams)
  bufferAfter: number;        // minutes
  note: string;
}

export interface EffectiveRules {
  rules: ScheduleRule[];
  buffers: {
    default: number;
    afterHighIntensity: number;
    afterMatch: number;
    beforeMatch: number;       // min gap before match kickoff
  };
  intensityCaps: {
    maxHardPerWeek: number;
    maxSessionsPerDay: number;
    noHardBeforeMatch: boolean;
    noHardOnExamDay: boolean;
    recoveryDayAfterMatch: boolean;
  };
  scenario: ScenarioId;
  dayBounds: { startHour: number; endHour: number };
}

export interface ExamStudyBlock {
  subject: string;
  dates: string[];             // YYYY-MM-DD[]
}

export interface ExamSchedule {
  examStudyBlocks: ExamStudyBlock[];
  exams: Array<{ subject: string; date: string; startTime: string; endTime: string }>;
  studyStartDate: string;
}

// ── Master Rules (universal, not player-specific) ────────────────

/**
 * Priority order: 1 = highest, scheduled first. When two rules want the same slot,
 * higher priority wins. The scheduling engine places events in priority order.
 */
export const PRIORITY_ORDER = [
  { priority: 1, category: "school",       note: "Non-negotiable — locked hours" },
  { priority: 1, category: "exam",         note: "Non-negotiable — locked time" },
  { priority: 2, category: "match",        note: "Fixture date/time set by league" },
  { priority: 3, category: "recovery",     note: "Mandatory after match days" },
  { priority: 4, category: "club",         note: "Coach-set session times" },
  { priority: 5, category: "gym",          note: "Player's own training" },
  { priority: 6, category: "study",        note: "Daily study block" },
  { priority: 7, category: "personal_dev", note: "Film study, tactical review" },
] as const;

export const MASTER_BUFFERS = {
  default: 30,                 // min gap between any two events
  afterHighIntensity: 45,      // min after RPE>=7 training
  afterMatch: 60,              // min after match ends
  beforeMatch: 120,            // no hard training within 2h of kickoff
} as const;

export const MASTER_INTENSITY_CAPS = {
  maxHardPerWeek: 3,           // max HARD sessions per 7-day cycle
  maxSessionsPerDay: 2,        // absolute cap on training sessions per day
  noHardBeforeMatch: true,     // no HARD training day before match
  noHardOnExamDay: true,       // no HARD training on exam day
  recoveryDayAfterMatch: true, // next day is recovery/light only
} as const;

// ── Scenario Modifiers ──────────────────────────────────────────

interface ScenarioModifier {
  id: ScenarioId;
  name: string;
  description: string;
  overrides: {
    maxHardPerWeek?: number;
    maxSessionsPerDay?: number;
    reduceGymDays?: number;       // reduce gym to N days/week max
    studyDurationMultiplier?: number; // 1.0 = normal, 1.5 = 50% longer
    addRecoveryAfterMatch?: boolean;
    dropPersonalDev?: boolean;
    intensityCapOnExamDays?: IntensityCap;
  };
}

export const SCENARIO_MODIFIERS: Record<ScenarioId, ScenarioModifier> = {
  normal: {
    id: "normal",
    name: "Normal",
    description: "No league matches, no exams. Full training capacity.",
    overrides: {},
  },
  league_active: {
    id: "league_active",
    name: "League Active",
    description: "Match days Fri/Sat. Recovery Sunday. Reduce gym load.",
    overrides: {
      maxHardPerWeek: 2,
      reduceGymDays: 3,
      addRecoveryAfterMatch: true,
    },
  },
  exam_period: {
    id: "exam_period",
    name: "Exam Period",
    description: "Pre-exam study blocks. Extended study time. Light training only on exam days.",
    overrides: {
      studyDurationMultiplier: 1.5,
      intensityCapOnExamDays: "LIGHT",
      dropPersonalDev: true,
      maxHardPerWeek: 2,
    },
  },
  league_and_exam: {
    id: "league_and_exam",
    name: "League + Exam",
    description: "Maximum pressure. Matches + exams. Minimal gym, extended study, strict recovery.",
    overrides: {
      maxHardPerWeek: 1,
      reduceGymDays: 2,
      studyDurationMultiplier: 1.5,
      intensityCapOnExamDays: "LIGHT",
      addRecoveryAfterMatch: true,
      dropPersonalDev: true,
    },
  },
};

// ── Reference Templates (for AI grounding) ──────────────────────

/**
 * What a correct day looks like per scenario × day-of-week.
 * Used to generate the AI system prompt text block.
 * Key: `${scenario}_${dayName}` → array of {time, name, locked, intensity}
 */
interface TemplateEvent {
  time: string;        // "08:00-15:00"
  name: string;
  locked: boolean;
  intensity?: string;
  note?: string;
}

type DayName = "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun";

const REFERENCE_TEMPLATES: Record<string, TemplateEvent[]> = {
  // ── NORMAL SCENARIO ────────────────────────
  normal_Mon: [
    { time: "08:00-15:00", name: "School", locked: true },
    { time: "16:00-17:30", name: "Study block", locked: false },
    { time: "18:00-19:00", name: "Gym (strength)", locked: false, intensity: "MODERATE" },
    { time: "19:30-21:00", name: "Club training", locked: false, intensity: "HARD" },
  ],
  normal_Tue: [
    { time: "08:00-15:00", name: "School", locked: true },
    { time: "16:00-17:30", name: "Study block", locked: false },
    { time: "18:00-19:00", name: "Gym (power)", locked: false, intensity: "MODERATE" },
    { time: "19:30-21:00", name: "Club training", locked: false, intensity: "HARD" },
  ],
  normal_Wed: [
    { time: "08:00-15:00", name: "School", locked: true },
    { time: "16:00-17:30", name: "Study block", locked: false },
    { time: "18:00-19:00", name: "Gym (conditioning)", locked: false, intensity: "MODERATE" },
  ],
  normal_Thu: [
    { time: "08:00-15:00", name: "School", locked: true },
    { time: "16:00-17:30", name: "Study block", locked: false },
    { time: "18:00-19:00", name: "Gym (speed)", locked: false, intensity: "MODERATE" },
    { time: "19:30-21:00", name: "Club training", locked: false, intensity: "MODERATE" },
  ],
  normal_Fri: [
    { time: "08:00-15:00", name: "School", locked: true },
    { time: "17:00-18:00", name: "Personal dev", locked: false },
    { time: "18:00-19:00", name: "Gym (light)", locked: false, intensity: "LIGHT" },
  ],
  normal_Sat: [
    { time: "10:00-11:00", name: "Gym (optional)", locked: false, intensity: "LIGHT" },
    { time: "17:00-18:00", name: "Personal dev", locked: false },
  ],
  normal_Sun: [
    { time: "10:00-11:30", name: "Study block", locked: false },
    { time: "16:00-17:00", name: "Recovery / mobility", locked: false, intensity: "LIGHT" },
  ],

  // ── LEAGUE ACTIVE SCENARIO ────────────────
  league_active_Mon: [
    { time: "08:00-15:00", name: "School", locked: true },
    { time: "16:00-17:30", name: "Study block", locked: false },
    { time: "18:00-19:00", name: "Gym (strength)", locked: false, intensity: "MODERATE" },
    { time: "19:30-21:00", name: "Club training", locked: false, intensity: "HARD" },
  ],
  league_active_Tue: [
    { time: "08:00-15:00", name: "School", locked: true },
    { time: "16:00-17:30", name: "Study block", locked: false },
    { time: "19:30-21:00", name: "Club training", locked: false, intensity: "MODERATE" },
  ],
  league_active_Wed: [
    { time: "08:00-15:00", name: "School", locked: true },
    { time: "16:00-17:30", name: "Study block", locked: false },
    { time: "18:00-19:00", name: "Gym (conditioning)", locked: false, intensity: "MODERATE" },
  ],
  league_active_Thu: [
    { time: "08:00-15:00", name: "School", locked: true },
    { time: "16:00-17:30", name: "Study block", locked: false },
    { time: "19:30-21:00", name: "Club training (tactical)", locked: false, intensity: "LIGHT", note: "Pre-match: tactical only" },
  ],
  league_active_Fri: [
    { time: "08:00-15:00", name: "School", locked: true },
    { time: "16:00-17:00", name: "Light activation", locked: false, intensity: "LIGHT", note: "Pre-match day" },
    { time: "19:00-21:00", name: "MATCH", locked: true, intensity: "HARD" },
  ],
  league_active_Sat: [
    { time: "10:00-11:00", name: "Recovery walk / pool", locked: false, intensity: "REST", note: "Post-match recovery" },
    { time: "17:00-19:00", name: "MATCH (alternate)", locked: true, intensity: "HARD", note: "If Sat fixture" },
  ],
  league_active_Sun: [
    { time: "10:00-11:00", name: "Recovery / mobility", locked: false, intensity: "LIGHT", note: "Post-match +1" },
    { time: "16:00-17:30", name: "Study block", locked: false },
  ],

  // ── EXAM PERIOD SCENARIO ──────────────────
  exam_period_Mon: [
    { time: "08:00-15:00", name: "School", locked: true },
    { time: "16:00-19:00", name: "Study block (extended)", locked: false, note: "Pre-exam revision" },
    { time: "19:30-20:30", name: "Gym (light)", locked: false, intensity: "LIGHT" },
  ],
  exam_period_Tue: [
    { time: "08:00-15:00", name: "School", locked: true },
    { time: "16:00-19:00", name: "Study block (extended)", locked: false },
    { time: "19:30-21:00", name: "Club training", locked: false, intensity: "MODERATE" },
  ],
  exam_period_Wed: [
    { time: "08:00-15:00", name: "School", locked: true },
    { time: "16:00-19:00", name: "Study block (extended)", locked: false },
  ],
  exam_period_Thu: [
    { time: "08:00-15:00", name: "School", locked: true },
    { time: "16:00-19:00", name: "Study block (extended)", locked: false },
    { time: "19:30-21:00", name: "Club training", locked: false, intensity: "LIGHT" },
  ],
  exam_period_Fri: [
    { time: "08:00-15:00", name: "School", locked: true },
    { time: "16:00-19:00", name: "Study block (extended)", locked: false },
  ],
  exam_period_Sat: [
    { time: "10:00-13:00", name: "Study block", locked: false },
    { time: "16:00-17:00", name: "Gym (light)", locked: false, intensity: "LIGHT" },
  ],
  exam_period_Sun: [
    { time: "10:00-13:00", name: "Study block", locked: false },
    { time: "16:00-17:00", name: "Recovery / mobility", locked: false, intensity: "LIGHT" },
  ],

  // ── LEAGUE + EXAM SCENARIO ────────────────
  league_and_exam_Mon: [
    { time: "08:00-15:00", name: "School", locked: true },
    { time: "16:00-19:00", name: "Study block (extended)", locked: false },
    { time: "19:30-21:00", name: "Club training", locked: false, intensity: "MODERATE" },
  ],
  league_and_exam_Tue: [
    { time: "08:00-15:00", name: "School", locked: true },
    { time: "16:00-19:00", name: "Study block (extended)", locked: false },
  ],
  league_and_exam_Wed: [
    { time: "08:00-15:00", name: "School", locked: true },
    { time: "16:00-19:00", name: "Study block (extended)", locked: false },
    { time: "19:30-20:30", name: "Gym (light)", locked: false, intensity: "LIGHT" },
  ],
  league_and_exam_Thu: [
    { time: "08:00-15:00", name: "School", locked: true },
    { time: "16:00-19:00", name: "Study block (extended)", locked: false },
    { time: "19:30-21:00", name: "Club training (tactical)", locked: false, intensity: "LIGHT", note: "Pre-match" },
  ],
  league_and_exam_Fri: [
    { time: "08:00-15:00", name: "School", locked: true },
    { time: "16:00-17:00", name: "Light activation", locked: false, intensity: "LIGHT" },
    { time: "19:00-21:00", name: "MATCH", locked: true, intensity: "HARD" },
  ],
  league_and_exam_Sat: [
    { time: "10:00-11:00", name: "Recovery walk", locked: false, intensity: "REST", note: "Post-match" },
    { time: "14:00-17:00", name: "Study block", locked: false },
  ],
  league_and_exam_Sun: [
    { time: "10:00-13:00", name: "Study block", locked: false },
    { time: "16:00-17:00", name: "Recovery / mobility", locked: false, intensity: "LIGHT" },
  ],
};

// ── Default Preferences ─────────────────────────────────────────

export const DEFAULT_PREFERENCES: PlayerSchedulePreferences = {
  school_days: [0, 1, 2, 3, 4] as DayOfWeek[],  // Sun-Thu (Middle East default)
  school_start: "08:00",
  school_end: "15:00",
  sleep_start: "22:00",
  sleep_end: "06:00",
  day_bounds_start: "06:00",
  day_bounds_end: "22:00",
  study_days: [0, 1, 2, 3] as DayOfWeek[],
  study_start: "16:00",
  study_duration_min: 90,
  gym_days: [0, 1, 2, 3, 4] as DayOfWeek[],
  gym_start: "18:00",
  gym_duration_min: 60,
  personal_dev_days: [4, 6] as DayOfWeek[],
  personal_dev_start: "17:00",
  club_days: [1, 2, 3, 4] as DayOfWeek[],
  club_start: "19:30",
  buffer_default_min: 30,
  buffer_post_match_min: 60,
  buffer_post_high_intensity_min: 45,
  league_is_active: false,
  exam_period_active: false,
  exam_subjects: [],
  exam_start_date: null,
  pre_exam_study_weeks: 3,
  days_per_subject: 3,
  training_categories: [],
  exam_schedule: [],
  study_subjects: [],
};

// ── Core Functions ──────────────────────────────────────────────

/**
 * Detect scenario from player preferences.
 */
export function detectScenario(prefs: PlayerSchedulePreferences): ScenarioId {
  const l = prefs.league_is_active;
  const e = prefs.exam_period_active;
  if (l && e) return "league_and_exam";
  if (l) return "league_active";
  if (e) return "exam_period";
  return "normal";
}

/**
 * Merge master rules + scenario modifiers + player preferences → effective rules.
 * This is what the scheduling engine and AI consume.
 */
export function getEffectiveRules(
  prefs: PlayerSchedulePreferences,
  scenarioOverride?: ScenarioId
): EffectiveRules {
  const scenario = scenarioOverride ?? detectScenario(prefs);
  const modifier = SCENARIO_MODIFIERS[scenario];
  const ov = modifier.overrides;

  // Build the per-activity rules from player prefs
  const rules: ScheduleRule[] = [];

  // School (P1, locked)
  for (const day of prefs.school_days) {
    rules.push({
      id: `school_${day}`,
      category: "school",
      priority: 1,
      name: "School",
      days: [day],
      startTime: prefs.school_start,
      endTime: prefs.school_end,
      intensity: "REST" as IntensityCap,
      locked: true,
      bufferAfter: prefs.buffer_default_min,
      note: "Non-negotiable school hours",
    });
  }

  // Club training (P4)
  for (const day of prefs.club_days) {
    rules.push({
      id: `club_${day}`,
      category: "club",
      priority: 4,
      name: "Club training",
      days: [day],
      startTime: prefs.club_start,
      endTime: addMinutes(prefs.club_start, 90),
      intensity: "HARD" as IntensityCap,
      locked: false,
      bufferAfter: prefs.buffer_post_high_intensity_min,
      note: "Coach-set session",
    });
  }

  // Gym (P5) — respect scenario reduction
  let gymDays = [...prefs.gym_days];
  if (ov.reduceGymDays !== undefined && gymDays.length > ov.reduceGymDays) {
    gymDays = gymDays.slice(0, ov.reduceGymDays);
  }
  for (const day of gymDays) {
    rules.push({
      id: `gym_${day}`,
      category: "gym",
      priority: 5,
      name: "Gym training",
      days: [day],
      startTime: prefs.gym_start,
      endTime: addMinutes(prefs.gym_start, prefs.gym_duration_min),
      intensity: "MODERATE" as IntensityCap,
      locked: false,
      bufferAfter: prefs.buffer_default_min,
      note: "Individual strength & conditioning",
    });
  }

  // Study (P6) — respect scenario duration multiplier
  const studyDuration = Math.round(
    prefs.study_duration_min * (ov.studyDurationMultiplier ?? 1.0)
  );
  for (const day of prefs.study_days) {
    rules.push({
      id: `study_${day}`,
      category: "study",
      priority: 6,
      name: "Study block",
      days: [day],
      startTime: prefs.study_start,
      endTime: addMinutes(prefs.study_start, studyDuration),
      intensity: "REST" as IntensityCap,
      locked: false,
      bufferAfter: prefs.buffer_default_min,
      note: ov.studyDurationMultiplier && ov.studyDurationMultiplier > 1
        ? "Extended study — exam period"
        : "Daily study block",
    });
  }

  // Personal dev (P7) — dropped in some scenarios
  if (!ov.dropPersonalDev) {
    for (const day of prefs.personal_dev_days) {
      rules.push({
        id: `personal_dev_${day}`,
        category: "personal_dev",
        priority: 7,
        name: "Personal development",
        days: [day],
        startTime: prefs.personal_dev_start,
        endTime: addMinutes(prefs.personal_dev_start, 60),
        intensity: "REST" as IntensityCap,
        locked: false,
        bufferAfter: 15,
        note: "Film study, tactical review, mental skills",
      });
    }
  }

  // Sort by priority (highest first)
  rules.sort((a, b) => a.priority - b.priority);

  return {
    rules,
    buffers: {
      default: prefs.buffer_default_min,
      afterHighIntensity: prefs.buffer_post_high_intensity_min,
      afterMatch: prefs.buffer_post_match_min,
      beforeMatch: MASTER_BUFFERS.beforeMatch,
    },
    intensityCaps: {
      maxHardPerWeek: ov.maxHardPerWeek ?? MASTER_INTENSITY_CAPS.maxHardPerWeek,
      maxSessionsPerDay: ov.maxSessionsPerDay ?? MASTER_INTENSITY_CAPS.maxSessionsPerDay,
      noHardBeforeMatch: MASTER_INTENSITY_CAPS.noHardBeforeMatch,
      noHardOnExamDay: MASTER_INTENSITY_CAPS.noHardOnExamDay,
      recoveryDayAfterMatch: ov.addRecoveryAfterMatch ?? MASTER_INTENSITY_CAPS.recoveryDayAfterMatch,
    },
    scenario,
    dayBounds: {
      startHour: parseHour(prefs.day_bounds_start || "06:00"),
      endHour: parseHour(prefs.day_bounds_end || "22:00"),
    },
  };
}

/**
 * Build the AI system prompt text block from player preferences + scenario.
 * Injected into the orchestrator's buildAgentConfig() alongside conversation context.
 */
export function buildRuleContext(
  prefs: PlayerSchedulePreferences,
  scenarioOverride?: ScenarioId
): string {
  const scenario = scenarioOverride ?? detectScenario(prefs);
  const modifier = SCENARIO_MODIFIERS[scenario];
  const effective = getEffectiveRules(prefs, scenario);

  const lines: string[] = [];
  lines.push("━━ SCHEDULING RULES ━━");
  lines.push(`Active scenario: ${modifier.name} — ${modifier.description}`);

  // Priority order
  lines.push("\nPRIORITY ORDER (1=highest, schedule in this order):");
  for (const p of PRIORITY_ORDER) {
    lines.push(`  ${p.priority}. ${p.category.toUpperCase()} — ${p.note}`);
  }

  // Buffer rules
  lines.push("\nBUFFER RULES (enforce ALWAYS):");
  lines.push(`  Default gap: ${effective.buffers.default} min`);
  lines.push(`  After high-intensity (RPE>=7): ${effective.buffers.afterHighIntensity} min`);
  lines.push(`  After match: ${effective.buffers.afterMatch} min`);
  lines.push(`  Before match: NO hard training within ${effective.buffers.beforeMatch} min of kickoff`);

  // Intensity caps
  lines.push("\nINTENSITY CAPS:");
  lines.push(`  Max HARD sessions/week: ${effective.intensityCaps.maxHardPerWeek}`);
  lines.push(`  Max training sessions/day: ${effective.intensityCaps.maxSessionsPerDay}`);
  if (effective.intensityCaps.noHardOnExamDay) {
    lines.push("  No HARD training on exam days");
  }
  if (effective.intensityCaps.noHardBeforeMatch) {
    lines.push("  No HARD training day before match");
  }
  if (effective.intensityCaps.recoveryDayAfterMatch) {
    lines.push("  Recovery/LIGHT only day after match");
  }

  // Player's weekly structure
  lines.push("\nPLAYER'S WEEKLY STRUCTURE:");
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  lines.push(`  School: ${prefs.school_days.map(d => dayNames[d]).join(", ")} ${prefs.school_start}-${prefs.school_end} (LOCKED)`);
  lines.push(`  Club: ${prefs.club_days.map(d => dayNames[d]).join(", ")} at ${prefs.club_start}`);
  const gymDaysStr = effective.rules.filter(r => r.category === "gym").map(r => dayNames[r.days[0]]).join(", ");
  lines.push(`  Gym: ${gymDaysStr || "None"} at ${prefs.gym_start} (${prefs.gym_duration_min}min)`);
  lines.push(`  Study: ${prefs.study_days.map(d => dayNames[d]).join(", ")} at ${prefs.study_start}`);

  // Reference template for today's day-of-week
  const templateKey = `${scenario}_${getDayName(new Date().getDay())}`;
  const template = REFERENCE_TEMPLATES[templateKey];
  if (template) {
    lines.push(`\nREFERENCE — What a correct ${getDayName(new Date().getDay())} looks like:`);
    for (const evt of template) {
      const lockTag = evt.locked ? " [LOCKED]" : "";
      const intTag = evt.intensity ? ` (${evt.intensity})` : "";
      const noteTag = evt.note ? ` — ${evt.note}` : "";
      lines.push(`  ${evt.time}  ${evt.name}${intTag}${lockTag}${noteTag}`);
    }
  }

  // Hard constraints
  lines.push("\nDO NOT schedule:");
  lines.push("  — Any activity inside school hours (LOCKED)");
  lines.push("  — Any activity inside exam time blocks (LOCKED)");
  lines.push("  — HARD training within 2h of a match");
  lines.push("  — HARD training on exam days");
  lines.push("  — Events before 06:00 or after 22:00");
  lines.push("  — More than 2 training sessions on the same day");

  lines.push("━━ END RULES ━━");

  return lines.join("\n");
}

/**
 * Build exam study blocks for pre-exam preparation.
 * Returns study blocks + exam day events.
 *
 * Algorithm:
 *   - N weeks before exam start → begin study blocks
 *   - Each subject gets `daysPerSubject` study days
 *   - Distributes subjects round-robin across available days
 *   - Skips Fridays (traditional rest/match day in Arab league contexts)
 *   - Exam days: 2h per subject, scheduled sequentially from exam start date
 */
export function buildExamStudyBlocks(
  examStartDate: string,
  subjects: string[],
  preStudyWeeks: number = 3,
  daysPerSubject: number = 3,
  skipDays: DayOfWeek[] = [5] // Skip Fridays by default
): ExamSchedule {
  const examStart = new Date(`${examStartDate}T12:00:00`);
  const studyStart = new Date(examStart.getTime() - preStudyWeeks * 7 * 86400000);

  // Generate available study dates (between studyStart and examStart)
  const availableDates: string[] = [];
  const cursor = new Date(studyStart);
  while (cursor < examStart) {
    const dow = cursor.getDay() as DayOfWeek;
    if (!skipDays.includes(dow)) {
      availableDates.push(cursor.toISOString().split("T")[0]);
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  // Distribute subjects round-robin across available dates
  const blocks: ExamStudyBlock[] = subjects.map((s) => ({ subject: s, dates: [] }));
  let dateIdx = 0;
  for (let round = 0; round < daysPerSubject; round++) {
    for (let si = 0; si < subjects.length; si++) {
      if (dateIdx < availableDates.length) {
        blocks[si].dates.push(availableDates[dateIdx]);
        dateIdx++;
      }
    }
  }

  // Exam days: 1 per subject, starting from examStartDate, skip skipDays
  const exams: ExamSchedule["exams"] = [];
  const examCursor = new Date(examStart);
  for (const subject of subjects) {
    // Advance past skip days
    while (skipDays.includes(examCursor.getDay() as DayOfWeek)) {
      examCursor.setDate(examCursor.getDate() + 1);
    }
    exams.push({
      subject,
      date: examCursor.toISOString().split("T")[0],
      startTime: "09:00",
      endTime: "11:00",
    });
    examCursor.setDate(examCursor.getDate() + 1);
  }

  return {
    examStudyBlocks: blocks,
    exams,
    studyStartDate: availableDates[0] ?? examStartDate,
  };
}

// ── Helpers ─────────────────────────────────────────────────────

function parseHour(time: string): number {
  const [h] = time.split(":").map(Number);
  return h;
}

function addMinutes(time: string, mins: number): string {
  const [h, m] = time.split(":").map(Number);
  const total = h * 60 + m + mins;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function getDayName(dow: number): DayName {
  return (["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as DayName[])[dow];
}

// ── Mode-Aware Extensions ──────────────────────────────────────

import type { ModeParams } from './modeConfig';

/**
 * Get effective rules using CMS-managed mode params instead of binary scenario flags.
 *
 * Merges: MASTER_RULES + CMS mode params + player's mode_params_override.
 * This is the mode-aware replacement for the scenario-based getEffectiveRules().
 * Additive — existing getEffectiveRules() continues to work for backwards compatibility.
 *
 * @param prefs - Player schedule preferences (from DB)
 * @param modeParams - Resolved CMS mode params (already merged with player overrides by caller)
 * @param modeId - The active mode ID (for reference template lookup)
 */
export function getEffectiveRulesWithMode(
  prefs: PlayerSchedulePreferences,
  modeParams: ModeParams,
  modeId: string
): EffectiveRules {
  const rules: ScheduleRule[] = [];

  // School (P1, locked)
  for (const day of prefs.school_days) {
    rules.push({
      id: `school_${day}`,
      category: "school",
      priority: 1,
      name: "School",
      days: [day],
      startTime: prefs.school_start,
      endTime: prefs.school_end,
      intensity: "REST" as IntensityCap,
      locked: true,
      bufferAfter: prefs.buffer_default_min,
      note: "Non-negotiable school hours",
    });
  }

  // Club training (P4)
  for (const day of prefs.club_days) {
    rules.push({
      id: `club_${day}`,
      category: "club",
      priority: 4,
      name: "Club training",
      days: [day],
      startTime: prefs.club_start,
      endTime: addMinutes(prefs.club_start, 90),
      intensity: "HARD" as IntensityCap,
      locked: false,
      bufferAfter: prefs.buffer_post_high_intensity_min,
      note: "Coach-set session",
    });
  }

  // Gym (P5) — respect mode reduction
  let gymDays = [...prefs.gym_days];
  if (modeParams.reduceGymDaysTo !== null && gymDays.length > modeParams.reduceGymDaysTo) {
    gymDays = gymDays.slice(0, modeParams.reduceGymDaysTo);
  }
  for (const day of gymDays) {
    rules.push({
      id: `gym_${day}`,
      category: "gym",
      priority: 5,
      name: "Gym training",
      days: [day],
      startTime: prefs.gym_start,
      endTime: addMinutes(prefs.gym_start, prefs.gym_duration_min),
      intensity: "MODERATE" as IntensityCap,
      locked: false,
      bufferAfter: prefs.buffer_default_min,
      note: "Individual strength & conditioning",
    });
  }

  // Study (P6) — respect mode duration multiplier
  const studyDuration = Math.round(
    prefs.study_duration_min * modeParams.studyDurationMultiplier
  );
  for (const day of prefs.study_days) {
    rules.push({
      id: `study_${day}`,
      category: "study",
      priority: 6,
      name: "Study block",
      days: [day],
      startTime: prefs.study_start,
      endTime: addMinutes(prefs.study_start, studyDuration),
      intensity: "REST" as IntensityCap,
      locked: false,
      bufferAfter: prefs.buffer_default_min,
      note: modeParams.studyDurationMultiplier > 1
        ? `Extended study — ${modeId} mode`
        : "Daily study block",
    });
  }

  // Personal dev (P7) — dropped if mode says so
  if (!modeParams.dropPersonalDev) {
    for (const day of prefs.personal_dev_days) {
      rules.push({
        id: `personal_dev_${day}`,
        category: "personal_dev",
        priority: 7,
        name: "Personal development",
        days: [day],
        startTime: prefs.personal_dev_start,
        endTime: addMinutes(prefs.personal_dev_start, 60),
        intensity: "REST" as IntensityCap,
        locked: false,
        bufferAfter: 15,
        note: "Film study, tactical review, mental skills",
      });
    }
  }

  rules.sort((a, b) => a.priority - b.priority);

  // Map scenario from mode for backwards compat
  const scenarioFromMode: ScenarioId = migrateModeLegacyScenario(modeId, prefs);

  return {
    rules,
    buffers: {
      default: prefs.buffer_default_min,
      afterHighIntensity: prefs.buffer_post_high_intensity_min,
      afterMatch: prefs.buffer_post_match_min,
      beforeMatch: MASTER_BUFFERS.beforeMatch,
    },
    intensityCaps: {
      maxHardPerWeek: modeParams.maxHardPerWeek,
      maxSessionsPerDay: modeParams.maxSessionsPerDay,
      noHardBeforeMatch: MASTER_INTENSITY_CAPS.noHardBeforeMatch,
      noHardOnExamDay: modeParams.intensityCapOnExamDays !== null,
      recoveryDayAfterMatch: modeParams.addRecoveryAfterMatch,
    },
    scenario: scenarioFromMode,
    dayBounds: {
      startHour: parseHour(prefs.day_bounds_start || "06:00"),
      endHour: parseHour(prefs.day_bounds_end || "22:00"),
    },
  };
}

/**
 * Build the mode-aware AI system prompt text block.
 * Richer than buildRuleContext() — includes mode name, coaching tone, balance ratio.
 */
export function buildModeRuleContext(
  prefs: PlayerSchedulePreferences,
  modeParams: ModeParams,
  modeId: string
): string {
  const effective = getEffectiveRulesWithMode(prefs, modeParams, modeId);

  const lines: string[] = [];
  lines.push("━━ SCHEDULING RULES ━━");
  lines.push(`Active mode: ${modeId.toUpperCase()}`);
  lines.push(`Coaching tone: ${modeParams.aiCoachingTone}`);
  lines.push(`Study/Training balance: ${Math.round(modeParams.studyTrainingBalanceRatio * 100)}% study / ${Math.round((1 - modeParams.studyTrainingBalanceRatio) * 100)}% training`);
  lines.push(`Load cap multiplier: ${modeParams.loadCapMultiplier}`);

  lines.push("\nPRIORITY ORDER (1=highest, schedule in this order):");
  for (const p of PRIORITY_ORDER) {
    lines.push(`  ${p.priority}. ${p.category.toUpperCase()} — ${p.note}`);
  }

  lines.push(`\nINTENSITY CAPS:`);
  lines.push(`  Max HARD per week: ${effective.intensityCaps.maxHardPerWeek}`);
  lines.push(`  Max sessions per day: ${effective.intensityCaps.maxSessionsPerDay}`);
  lines.push(`  No HARD before match: ${effective.intensityCaps.noHardBeforeMatch}`);
  lines.push(`  Recovery after match: ${effective.intensityCaps.recoveryDayAfterMatch}`);
  if (modeParams.intensityCapOnExamDays) {
    lines.push(`  Exam day intensity cap: ${modeParams.intensityCapOnExamDays}`);
  }

  lines.push(`\nBUFFERS:`);
  lines.push(`  Default: ${effective.buffers.default} min`);
  lines.push(`  After high intensity: ${effective.buffers.afterHighIntensity} min`);
  lines.push(`  After match: ${effective.buffers.afterMatch} min`);
  lines.push(`  Before match: ${effective.buffers.beforeMatch} min`);

  lines.push(`\nPLAYER'S WEEKLY SCHEDULE:`);
  for (const rule of effective.rules) {
    const dayNames = rule.days.map(d => getDayName(d)).join(", ");
    lines.push(`  ${rule.startTime}-${rule.endTime} ${rule.name} [${dayNames}] ${rule.locked ? "(LOCKED)" : ""} ${rule.intensity}`);
  }

  // Priority boosts from mode
  if (modeParams.priorityBoosts.length > 0) {
    lines.push(`\nMODE PRIORITY ADJUSTMENTS:`);
    for (const boost of modeParams.priorityBoosts) {
      lines.push(`  ${boost.category}: ${boost.delta > 0 ? '+' : ''}${boost.delta} priority`);
    }
  }

  return lines.join("\n");
}

/**
 * Map legacy scenario flags to a mode ID for migration.
 * Used during the transition period before all athletes have an explicit mode.
 */
export function migrateScenarioToMode(prefs: PlayerSchedulePreferences): string {
  if (prefs.league_is_active && prefs.exam_period_active) return 'league'; // closest match
  if (prefs.league_is_active) return 'league';
  if (prefs.exam_period_active) return 'study';
  return 'balanced';
}

/**
 * Derive a legacy ScenarioId from mode + prefs (for backwards compat in EffectiveRules).
 */
function migrateModeLegacyScenario(modeId: string, prefs: PlayerSchedulePreferences): ScenarioId {
  // If prefs still have scenario flags set, honour them for backwards compat
  if (prefs.league_is_active && prefs.exam_period_active) return 'league_and_exam';
  if (prefs.league_is_active) return 'league_active';
  if (prefs.exam_period_active) return 'exam_period';
  // Otherwise derive from mode
  if (modeId === 'league') return 'league_active';
  if (modeId === 'study') return 'exam_period';
  if (modeId === 'rest') return 'normal';
  return 'normal';
}
