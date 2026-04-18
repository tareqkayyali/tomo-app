/**
 * Week Plan Builder — pure function that turns athlete-provided mix
 * choices into a concrete week of events, respecting every constraint
 * the scheduling engine already enforces.
 *
 * Inputs → { trainingMix, studyMix, existing events, prefs, config }
 * Output → { planItems, summary, warnings }
 *
 * Reuses `autoPosition` from schedulingEngine for placement. Does NOT
 * reinvent conflict detection or school-hour blocking — trust the engine.
 *
 * Intensity rule (v1): every session starts at MODERATE. Match_competition
 * is the only exception → HARD. Recovery → LIGHT. Intensity caps from the
 * scenario (league/exam) are honored by downgrading or dropping excess.
 */

import {
  DEFAULT_CONFIG,
  autoPosition,
  type SchedulingConfig,
  type ScheduleEvent,
} from "@/services/schedulingEngine";
import { estimateLoad } from "@/services/events/computations/loadEstimator";

// ── Types ────────────────────────────────────────────────────────

export type TrainingCategoryId =
  | "club"
  | "gym"
  | "personal"
  | "recovery"
  | "individual_technical"
  | "tactical"
  | "match_competition"
  | "mental_performance";

export type Placement = "fixed" | "flexible";
export type PreferredTimeOfDay = "morning" | "afternoon" | "evening";

export interface TrainingMixItem {
  category: TrainingCategoryId;
  sessionsPerWeek: number;      // 0–5
  durationMin: number;          // derived default from template, athlete can edit
  placement: Placement;
  fixedDays?: number[];         // 0=Sun..6=Sat, required when placement=fixed
  preferredTime?: PreferredTimeOfDay;
}

export interface StudyMixItem {
  subject: string;
  sessionsPerWeek: number;
  durationMin: number;
  placement: Placement;
  fixedDays?: number[];
  preferredTime?: PreferredTimeOfDay;
  isExamSubject?: boolean;
}

/** Existing event shape (subset of calendar_events we care about). */
export interface ExistingEvent {
  id: string;
  name: string;
  date: string;                 // YYYY-MM-DD (local)
  startTime: string | null;     // HH:MM
  endTime: string | null;       // HH:MM
  eventType: string;
  intensity?: string | null;
}

export interface PlayerPrefs {
  timezone: string;
  schoolDays: number[];         // 0=Sun..6=Sat
  schoolStart: string;          // HH:MM
  schoolEnd: string;            // HH:MM
  dayBoundsStart: string;       // HH:MM
  dayBoundsEnd: string;
  weekendBoundsStart?: string;
  weekendBoundsEnd?: string;
  examPeriodActive: boolean;
  leagueActive: boolean;
}

export interface WeekPlanBuilderInput {
  weekStart: string;            // YYYY-MM-DD, Monday
  trainingMix: TrainingMixItem[];
  studyMix: StudyMixItem[];
  existingEvents: ExistingEvent[];
  playerPrefs: PlayerPrefs;
  readinessRag: "GREEN" | "AMBER" | "RED" | null;
  acwr: number | null;
  dayLocks: string[];           // YYYY-MM-DD locked
  config?: SchedulingConfig;    // overrides default (injected from CMS in prod)
  // Mode id selected in the week-scope capsule (balanced | league | study
  // | rest). When set, overrides scenarioMaxHard — rest→0, study→1,
  // league→2, balanced→existing scenario logic. Doesn't persist as
  // the athlete's global mode.
  modeId?: string;
}

export type EventType = "training" | "match" | "study" | "recovery";
export type Intensity = "LIGHT" | "MODERATE" | "HARD";
export type PlacementReason = "fixed" | "auto" | "bumped" | "dropped";

export interface PlanItem {
  title: string;
  category: string;             // training category id OR "study"
  subject?: string;             // study only
  date: string;                 // YYYY-MM-DD
  startTime: string;            // HH:MM
  endTime: string;              // HH:MM
  durationMin: number;
  eventType: EventType;
  intensity: Intensity;
  placementReason: PlacementReason;
  predictedLoadAu: number;
}

export interface PlanWarning {
  code:
    | "dropped_session_intensity_cap"
    | "dropped_session_no_slot"
    | "fixed_day_unavailable"
    | "day_lock_skipped"
    | "downgraded_hard_to_moderate";
  category: string;
  message: string;
  date?: string;
}

export interface WeekPlanSummary {
  trainingSessions: number;
  studySessions: number;
  totalMinutes: number;
  hardSessions: number;
  predictedLoadAu: number;      // sum across the week
}

export interface WeekPlanBuilderOutput {
  planItems: PlanItem[];
  summary: WeekPlanSummary;
  warnings: PlanWarning[];
}

// ── Category metadata ────────────────────────────────────────────
// Kept local so the builder stays a pure function. CMS values flow in
// via TrainingMixItem.durationMin etc., so defaults only matter when
// synthesising labels or picking a default intensity.

const CATEGORY_LABEL: Record<TrainingCategoryId, string> = {
  club: "Club Training",
  gym: "Gym",
  personal: "Personal",
  recovery: "Recovery",
  individual_technical: "Technical",
  tactical: "Tactical",
  match_competition: "Match",
  mental_performance: "Mental",
};

const CATEGORY_DEFAULT_INTENSITY: Record<TrainingCategoryId, Intensity> = {
  club: "MODERATE",
  gym: "MODERATE",
  personal: "MODERATE",
  recovery: "LIGHT",
  individual_technical: "MODERATE",
  tactical: "MODERATE",
  match_competition: "HARD",
  mental_performance: "LIGHT",
};

const CATEGORY_EVENT_TYPE: Record<TrainingCategoryId, EventType> = {
  club: "training",
  gym: "training",
  personal: "training",
  recovery: "recovery",
  individual_technical: "training",
  tactical: "training",
  match_competition: "match",
  mental_performance: "training",
};

// ── Time-of-day anchors (minutes since midnight) ─────────────────
const PREFERRED_START_MIN: Record<PreferredTimeOfDay, number> = {
  morning: 420,    // 7:00 AM
  afternoon: 990,  // 4:30 PM — inside preferred training window (3:30–7)
  evening: 1140,   // 7:00 PM
};

// ── Public entry point ───────────────────────────────────────────

export function buildWeekPlan(input: WeekPlanBuilderInput): WeekPlanBuilderOutput {
  const config = input.config ?? DEFAULT_CONFIG;
  const warnings: PlanWarning[] = [];
  const weekDates = enumerateWeek(input.weekStart); // 7 ISO dates, Monday-first

  // Day-level staging. As we place items, we append them to
  // `placedByDate` so subsequent placements see the in-progress plan
  // as "blocked" just like existing events.
  const placedByDate: Record<string, ScheduleEvent[]> = {};
  for (const d of weekDates) placedByDate[d] = [];

  // Index existing events by date for fast lookup.
  const existingByDate = indexExistingByDate(input.existingEvents, weekDates);

  // Scenario-derived hard-session cap for the week. Mode (if picked in
  // the week-scope capsule) takes precedence over scenario flags.
  const maxHardPerWeek = scenarioMaxHard(
    input.modeId,
    input.playerPrefs.leagueActive,
    input.playerPrefs.examPeriodActive,
  );
  let hardPlaced = 0;

  // Expand mix into candidate items. Fixed-day items first (they have
  // the tighter constraints; if they can't fit, we warn early). Then
  // flexible items fill whatever's left.
  const trainingCandidates = expandTrainingMix(input.trainingMix);
  const studyCandidates = expandStudyMix(input.studyMix, input.playerPrefs.examPeriodActive);

  const candidates = [...trainingCandidates, ...studyCandidates].sort(
    byPlacementPriority,
  );

  const planItems: PlanItem[] = [];

  for (const cand of candidates) {
    // 1. Determine target days.
    const targetDates = resolveTargetDates(cand, weekDates, input.dayLocks, warnings);
    if (targetDates.length === 0) continue;

    // 2. Intensity gate (may downgrade or drop).
    let intensity = cand.intensity;
    if (intensity === "HARD") {
      if (hardPlaced >= maxHardPerWeek) {
        if (cand.category === "match_competition") {
          // Matches are the week's anchor; never drop silently.
          // Leave as HARD and let the scheduling engine warn via scenario.
        } else {
          intensity = "MODERATE";
          warnings.push({
            code: "downgraded_hard_to_moderate",
            category: cand.category,
            message: `Downgraded ${CATEGORY_LABEL[cand.category as TrainingCategoryId] ?? cand.category} to MODERATE — weekly HARD cap (${maxHardPerWeek}) reached.`,
          });
        }
      }
    }

    // 3. Try each target day until one works.
    let placed = false;
    for (const date of targetDates) {
      const result = tryPlaceOnDate({
        date,
        cand,
        intensity,
        config,
        playerPrefs: input.playerPrefs,
        existingOnDate: existingByDate[date] ?? [],
        stagedOnDate: placedByDate[date],
      });

      if (result.ok) {
        const duration = cand.durationMin;
        const predictedLoadAu = estimateLoad({
          event_type: cand.eventType,
          intensity: cand.eventType === "study" ? null : intensity,
          duration_min: duration,
        });
        const loadAu = (predictedLoadAu.training_load_au ?? 0) +
                       (predictedLoadAu.academic_load_au ?? 0);

        const item: PlanItem = {
          title: cand.title,
          category: cand.category,
          subject: cand.subject,
          date,
          startTime: minutesToHHMM(result.slot!.startMin),
          endTime: minutesToHHMM(result.slot!.endMin),
          durationMin: duration,
          eventType: cand.eventType,
          intensity,
          placementReason: cand.placement === "fixed" ? "fixed" : "auto",
          predictedLoadAu: loadAu,
        };
        planItems.push(item);
        placedByDate[date].push({
          id: `plan-${planItems.length}`,
          name: cand.title,
          startTime: item.startTime,
          endTime: item.endTime,
          type: cand.eventType,
          intensity,
        });
        if (intensity === "HARD") hardPlaced++;
        placed = true;
        break;
      }
    }

    if (!placed) {
      warnings.push({
        code: cand.placement === "fixed"
          ? "fixed_day_unavailable"
          : "dropped_session_no_slot",
        category: cand.category,
        message: cand.placement === "fixed"
          ? `Couldn't fit ${cand.title} on its chosen day(s) — too many conflicts.`
          : `Couldn't fit ${cand.title} this week — no open slot that respects buffers and school hours.`,
      });
    }
  }

  // Sort plan items chronologically for display.
  planItems.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return a.startTime.localeCompare(b.startTime);
  });

  const summary = buildSummary(planItems);

  return { planItems, summary, warnings };
}

// ── Candidate expansion ──────────────────────────────────────────

interface Candidate {
  title: string;
  category: string;             // training category id OR "study"
  subject?: string;
  durationMin: number;
  placement: Placement;
  fixedDays: number[];          // empty array for flexible
  preferredStartMin: number;
  eventType: EventType;
  intensity: Intensity;
  priority: number;             // lower = placed earlier
}

function expandTrainingMix(mix: TrainingMixItem[]): Candidate[] {
  const out: Candidate[] = [];
  for (const item of mix) {
    if (item.sessionsPerWeek <= 0) continue;
    const pref = item.preferredTime ?? defaultPreferredTime(item.category);
    const preferredStartMin = PREFERRED_START_MIN[pref];
    const eventType = CATEGORY_EVENT_TYPE[item.category];
    const intensity = CATEGORY_DEFAULT_INTENSITY[item.category];
    const title = CATEGORY_LABEL[item.category] + " Session";

    const allFixedDays = item.placement === "fixed" ? (item.fixedDays ?? []) : [];

    for (let i = 0; i < item.sessionsPerWeek; i++) {
      // Fixed-day distribution: when the athlete picked N specific days
      // for N sessions, each session locks to one day — not all of them.
      // With fewer days than sessions, round-robin across the days.
      // With more days than sessions, expose all days so the placer picks
      // whichever has a free slot.
      const perSessionDays =
        item.placement === "fixed" && allFixedDays.length >= item.sessionsPerWeek
          ? [allFixedDays[i % allFixedDays.length]]
          : allFixedDays;

      out.push({
        title,
        category: item.category,
        durationMin: item.durationMin,
        placement: item.placement,
        fixedDays: [...perSessionDays],
        preferredStartMin,
        eventType,
        intensity,
        priority: priorityForCategory(item.category, item.placement),
      });
    }
  }
  return out;
}

function expandStudyMix(mix: StudyMixItem[], examActive: boolean): Candidate[] {
  const out: Candidate[] = [];
  for (const item of mix) {
    if (item.sessionsPerWeek <= 0) continue;
    const pref = item.preferredTime ?? "afternoon";
    // Study prefers a morning slot when exam period is on;
    // otherwise it uses whatever the athlete picked.
    const anchorPref: PreferredTimeOfDay =
      examActive && item.isExamSubject ? "morning" : pref;
    const preferredStartMin = PREFERRED_START_MIN[anchorPref];
    const allFixedDays = item.placement === "fixed" ? (item.fixedDays ?? []) : [];

    for (let i = 0; i < item.sessionsPerWeek; i++) {
      const perSessionDays =
        item.placement === "fixed" && allFixedDays.length >= item.sessionsPerWeek
          ? [allFixedDays[i % allFixedDays.length]]
          : allFixedDays;

      out.push({
        title: item.subject,
        category: "study",
        subject: item.subject,
        durationMin: item.durationMin,
        placement: item.placement,
        fixedDays: [...perSessionDays],
        preferredStartMin,
        eventType: "study",
        intensity: "LIGHT",
        priority: item.isExamSubject ? 25 : 55,
      });
    }
  }
  return out;
}

function defaultPreferredTime(cat: TrainingCategoryId): PreferredTimeOfDay {
  switch (cat) {
    case "gym":
    case "recovery":
      return "morning";
    case "personal":
    case "mental_performance":
      return "evening";
    default:
      return "afternoon";
  }
}

function priorityForCategory(cat: string, placement: Placement): number {
  // Fixed always before flexible. Matches highest. Recovery lowest.
  const base = placement === "fixed" ? 0 : 50;
  const bonus: Record<string, number> = {
    match_competition: 0,
    club: 5,
    tactical: 10,
    individual_technical: 15,
    gym: 20,
    personal: 30,
    mental_performance: 40,
    recovery: 45,
  };
  return base + (bonus[cat] ?? 35);
}

function byPlacementPriority(a: Candidate, b: Candidate): number {
  return a.priority - b.priority;
}

// ── Placement ────────────────────────────────────────────────────

interface PlaceArgs {
  date: string;
  cand: Candidate;
  intensity: Intensity;
  config: SchedulingConfig;
  playerPrefs: PlayerPrefs;
  existingOnDate: ScheduleEvent[];
  stagedOnDate: ScheduleEvent[];
}

function tryPlaceOnDate(args: PlaceArgs):
  { ok: true; slot: { startMin: number; endMin: number } } |
  { ok: false } {
  const { date, cand, config, playerPrefs, existingOnDate, stagedOnDate } = args;

  const weekday = isoWeekdayFromDate(date); // 0=Sun..6=Sat
  const isWeekend = weekday === 0 || weekday === 6;

  // `autoPosition` does not take `dayOfWeek`, so school hours only become
  // mechanical blocks if we inject them as a synthetic ScheduleEvent. This
  // matches how `validateEvent` treats any other event — gap rules apply.
  const synthetic: ScheduleEvent[] = [];
  if (playerPrefs.schoolDays.includes(weekday)) {
    synthetic.push({
      id: "__school__",
      name: "School",
      startTime: playerPrefs.schoolStart,
      endTime: playerPrefs.schoolEnd,
      type: "other",
      intensity: null,
    });
  }

  const perDayConfig: SchedulingConfig = {
    ...config,
    // Already injected via synthetic — disable the engine's school path.
    respectSchoolHours: false,
    schoolSchedule: null,
    // Weekday vs weekend bounds.
    dayStartHour: hhmmToHour(
      isWeekend
        ? (playerPrefs.weekendBoundsStart ?? playerPrefs.dayBoundsStart)
        : playerPrefs.dayBoundsStart,
      config.dayStartHour,
    ),
    dayEndHour: hhmmToHour(
      isWeekend
        ? (playerPrefs.weekendBoundsEnd ?? playerPrefs.dayBoundsEnd)
        : playerPrefs.dayBoundsEnd,
      config.dayEndHour,
    ),
  };

  const blocked = [...synthetic, ...existingOnDate, ...stagedOnDate];
  const slot = autoPosition(
    cand.durationMin,
    cand.preferredStartMin,
    blocked,
    perDayConfig,
  );
  if (!slot) return { ok: false };
  return { ok: true, slot };
}

// ── Utility ──────────────────────────────────────────────────────

/** Enumerate 7 YYYY-MM-DD dates starting from Monday `weekStart`. */
export function enumerateWeek(weekStart: string): string[] {
  const [y, m, d] = weekStart.split("-").map((n) => parseInt(n, 10));
  const start = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
  const out: string[] = [];
  for (let i = 0; i < 7; i++) {
    const cur = new Date(start);
    cur.setUTCDate(start.getUTCDate() + i);
    out.push(toISODate(cur));
  }
  return out;
}

function toISODate(d: Date): string {
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${mo}-${dd}`;
}

function isoWeekdayFromDate(iso: string): number {
  const [y, m, d] = iso.split("-").map((n) => parseInt(n, 10));
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1)).getUTCDay();
}

function minutesToHHMM(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function hhmmToHour(hhmm: string, fallback: number): number {
  const [h] = hhmm.split(":").map((n) => parseInt(n, 10));
  return Number.isFinite(h) ? h : fallback;
}

function indexExistingByDate(
  events: ExistingEvent[],
  weekDates: string[],
): Record<string, ScheduleEvent[]> {
  const index: Record<string, ScheduleEvent[]> = {};
  for (const d of weekDates) index[d] = [];
  for (const ev of events) {
    if (!index[ev.date]) continue;
    index[ev.date].push({
      id: ev.id,
      name: ev.name,
      startTime: ev.startTime,
      endTime: ev.endTime,
      type: ev.eventType,
      intensity: ev.intensity ?? null,
    });
  }
  return index;
}

function resolveTargetDates(
  cand: Candidate,
  weekDates: string[],
  dayLocks: string[],
  warnings: PlanWarning[],
): string[] {
  const locks = new Set(dayLocks);

  // Fixed-day items only try their explicit weekdays.
  if (cand.placement === "fixed" && cand.fixedDays.length > 0) {
    const dates = weekDates.filter((d) => cand.fixedDays.includes(isoWeekdayFromDate(d)));
    const unlocked = dates.filter((d) => !locks.has(d));
    const dropped = dates.length - unlocked.length;
    if (dropped > 0) {
      warnings.push({
        code: "day_lock_skipped",
        category: cand.category,
        message: `Skipped ${dropped} locked day(s) for ${cand.title}.`,
      });
    }
    return unlocked;
  }

  // Flexible items: try every day in the week that isn't locked.
  // Afternoon preferences are already baked into the preferredStartMin,
  // so `autoPosition` spiral-searches around it per day.
  return weekDates.filter((d) => !locks.has(d));
}

function scenarioMaxHard(
  modeId: string | undefined,
  leagueActive: boolean,
  examActive: boolean,
): number {
  // Mode-driven caps match the CMS athlete_modes.params.maxHardPerWeek:
  //   balanced: 3, league: 2, study: 1, rest: 0.
  // If no mode (legacy callers), fall back to the scenario flag logic.
  switch (modeId) {
    case "rest":
      return 0;
    case "study":
      return 1;
    case "league":
      return 2;
    case "balanced":
      return 3;
  }
  if (leagueActive && examActive) return 1;
  if (leagueActive || examActive) return 2;
  return 3;
}

function buildSummary(items: PlanItem[]): WeekPlanSummary {
  let trainingSessions = 0;
  let studySessions = 0;
  let totalMinutes = 0;
  let hardSessions = 0;
  let predictedLoadAu = 0;
  for (const it of items) {
    totalMinutes += it.durationMin;
    predictedLoadAu += it.predictedLoadAu;
    if (it.eventType === "study") studySessions++;
    else trainingSessions++;
    if (it.intensity === "HARD") hardSessions++;
  }
  return {
    trainingSessions,
    studySessions,
    totalMinutes,
    hardSessions,
    predictedLoadAu: Math.round(predictedLoadAu),
  };
}
