/**
 * Scheduling Engine — Pure-function calendar brain
 *
 * Handles: conflict detection, gap enforcement, auto-positioning,
 * available slot scanning, and smart time suggestions.
 *
 * Zero React deps — runs identically on frontend and backend.
 */

// ── Types ────────────────────────────────────────────────────────

export interface TimeSlot {
  startMin: number; // minutes since midnight
  endMin: number;
}

export interface SchedulingConfig {
  gapMinutes: number;            // 0-120, default 30
  respectSchoolHours: boolean;   // default true
  schoolSchedule: {
    days: number[];              // 0=Sun..6=Sat
    startTime: string;           // HH:MM
    endTime: string;             // HH:MM
  } | null;
  dayStartHour: number;          // default 6
  dayEndHour: number;            // default 22
  preferredTrainingWindow: {
    startMin: number;            // default 930 (3:30 PM)
    endMin: number;              // default 1140 (7:00 PM)
  };
  // Rule-based overrides (from scheduleRuleEngine.getEffectiveRules())
  ruleOverrides?: {
    gapAfterHighIntensity?: number;  // minutes after RPE>=7
    gapAfterMatch?: number;          // minutes after match
    gapBeforeMatch?: number;         // minutes before match kickoff
    maxSessionsPerDay?: number;
    noHardOnExamDay?: boolean;
    intensityCapOnExamDays?: string;  // "LIGHT", "MODERATE", etc.
  };
}

export interface SlotSuggestion {
  startMin: number;
  endMin: number;
  score: number;     // 0-100
  reason: string;
}

export interface ConflictResult {
  hasConflict: boolean;
  conflictingEvents: Array<{ id: string; name: string; startMin: number; endMin: number }>;
  gapViolations: Array<{ id: string; name: string; shortfall: number }>;
}

/** Minimal event shape the engine needs */
export interface ScheduleEvent {
  id: string;
  name: string;
  startTime: string | null; // HH:MM
  endTime: string | null;   // HH:MM
  type: string;
  intensity?: string | null;
}

// ── Default Config ───────────────────────────────────────────────

export const DEFAULT_CONFIG: SchedulingConfig = {
  gapMinutes: 30,
  respectSchoolHours: true,
  schoolSchedule: null,
  dayStartHour: 6,
  dayEndHour: 22,
  preferredTrainingWindow: { startMin: 930, endMin: 1140 }, // 3:30 PM - 7:00 PM
};

// ── Helpers ──────────────────────────────────────────────────────

export function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + (m || 0);
}

export function minutesToTime(mins: number): string {
  const h = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function format12h(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

function slotsOverlap(a: TimeSlot, b: TimeSlot): boolean {
  return a.startMin < b.endMin && b.startMin < a.endMin;
}

// ── Core Functions ───────────────────────────────────────────────

/**
 * Get all blocked time ranges for a day.
 * Includes: existing events (with gap padding) + school hours.
 */
export function getBlockedRanges(
  events: ScheduleEvent[],
  config: SchedulingConfig,
  dayOfWeek?: number
): TimeSlot[] {
  const blocked: TimeSlot[] = [];
  const gap = config.gapMinutes;

  // 1. Events with dynamic gap padding (rule-aware)
  const rules = config.ruleOverrides;
  for (const evt of events) {
    if (!evt.startTime || !evt.endTime) continue;
    const start = timeToMinutes(evt.startTime);
    const end = timeToMinutes(evt.endTime);

    // Dynamic post-event buffer based on event type + intensity
    let postGap = gap;
    if (rules) {
      const isMatch = evt.type === "match";
      const isHighIntensity = evt.intensity === "HARD" ||
        (evt.intensity === "MODERATE" && (evt.type === "training" || evt.type === "match"));

      if (isMatch && rules.gapAfterMatch) {
        postGap = Math.max(postGap, rules.gapAfterMatch);
      } else if (isHighIntensity && rules.gapAfterHighIntensity) {
        postGap = Math.max(postGap, rules.gapAfterHighIntensity);
      }

      // Pre-match buffer: block hard training before match kickoff
      if (isMatch && rules.gapBeforeMatch) {
        blocked.push({
          startMin: Math.max(start - rules.gapBeforeMatch, config.dayStartHour * 60),
          endMin: start,
        });
      }
    }

    blocked.push({
      startMin: Math.max(start - gap, config.dayStartHour * 60),
      endMin: Math.min(end + postGap, config.dayEndHour * 60),
    });
  }

  // 2. School hours (if applicable for this day)
  if (
    config.respectSchoolHours &&
    config.schoolSchedule &&
    dayOfWeek !== undefined &&
    config.schoolSchedule.days.includes(dayOfWeek)
  ) {
    blocked.push({
      startMin: timeToMinutes(config.schoolSchedule.startTime),
      endMin: timeToMinutes(config.schoolSchedule.endTime),
    });
  }

  // 3. Before day start and after day end
  blocked.push({ startMin: 0, endMin: config.dayStartHour * 60 });
  blocked.push({ startMin: config.dayEndHour * 60, endMin: 1440 });

  // Merge overlapping ranges
  return mergeRanges(blocked);
}

function mergeRanges(ranges: TimeSlot[]): TimeSlot[] {
  if (ranges.length === 0) return [];
  const sorted = [...ranges].sort((a, b) => a.startMin - b.startMin);
  const merged: TimeSlot[] = [{ ...sorted[0] }];

  for (let i = 1; i < sorted.length; i++) {
    const last = merged[merged.length - 1];
    if (sorted[i].startMin <= last.endMin) {
      last.endMin = Math.max(last.endMin, sorted[i].endMin);
    } else {
      merged.push({ ...sorted[i] });
    }
  }
  return merged;
}

/**
 * Find all available slots of a given duration on a day.
 * Returns scored suggestions sorted by score (highest first).
 */
export function findAvailableSlots(
  events: ScheduleEvent[],
  durationMin: number,
  config: SchedulingConfig,
  dayOfWeek?: number
): SlotSuggestion[] {
  const blocked = getBlockedRanges(events, config, dayOfWeek);
  const dayStart = config.dayStartHour * 60;
  const dayEnd = config.dayEndHour * 60;
  const suggestions: SlotSuggestion[] = [];

  // Scan in 30-min increments
  for (let start = dayStart; start + durationMin <= dayEnd; start += 30) {
    const candidate: TimeSlot = { startMin: start, endMin: start + durationMin };
    const isBlocked = blocked.some((b) => slotsOverlap(candidate, b));

    if (!isBlocked) {
      const score = scoreSlot(candidate, events, config);
      const reason = buildReason(candidate, events, config);
      suggestions.push({
        startMin: start,
        endMin: start + durationMin,
        score,
        reason,
      });
    }
  }

  suggestions.sort((a, b) => b.score - a.score);
  return suggestions;
}

/**
 * Validate a proposed event against existing events.
 * Returns conflict details including gap violations.
 */
export function validateEvent(
  newStartMin: number,
  newEndMin: number,
  existingEvents: ScheduleEvent[],
  config: SchedulingConfig,
  excludeEventId?: string
): ConflictResult {
  const conflicts: ConflictResult['conflictingEvents'] = [];
  const gapViolations: ConflictResult['gapViolations'] = [];
  const gap = config.gapMinutes;

  for (const evt of existingEvents) {
    if (evt.id === excludeEventId) continue;
    if (!evt.startTime || !evt.endTime) continue;

    const evtStart = timeToMinutes(evt.startTime);
    const evtEnd = timeToMinutes(evt.endTime);

    // Direct overlap
    if (newStartMin < evtEnd && evtStart < newEndMin) {
      conflicts.push({ id: evt.id, name: evt.name, startMin: evtStart, endMin: evtEnd });
      continue;
    }

    // Gap violation — new event too close to existing
    if (gap > 0) {
      const gapBefore = newStartMin - evtEnd;   // gap between existing end and new start
      const gapAfter = evtStart - newEndMin;     // gap between new end and existing start

      if (gapBefore >= 0 && gapBefore < gap) {
        gapViolations.push({ id: evt.id, name: evt.name, shortfall: gap - gapBefore });
      }
      if (gapAfter >= 0 && gapAfter < gap) {
        gapViolations.push({ id: evt.id, name: evt.name, shortfall: gap - gapAfter });
      }
    }
  }

  return {
    hasConflict: conflicts.length > 0 || gapViolations.length > 0,
    conflictingEvents: conflicts,
    gapViolations,
  };
}

/**
 * Auto-position an event to the nearest conflict-free slot.
 * Searches outward from preferredStartMin in 30-min steps.
 * Returns null if no slot fits within the day.
 */
export function autoPosition(
  durationMin: number,
  preferredStartMin: number,
  existingEvents: ScheduleEvent[],
  config: SchedulingConfig,
  excludeEventId?: string
): TimeSlot | null {
  const dayStart = config.dayStartHour * 60;
  const dayEnd = config.dayEndHour * 60;
  const maxSteps = Math.ceil((dayEnd - dayStart) / 30);

  // Search outward: try preferred, then +30, -30, +60, -60, ...
  for (let step = 0; step <= maxSteps; step++) {
    const offsets = step === 0 ? [0] : [step * 30, -step * 30];

    for (const offset of offsets) {
      const candidateStart = preferredStartMin + offset;
      const candidateEnd = candidateStart + durationMin;

      if (candidateStart < dayStart || candidateEnd > dayEnd) continue;

      const result = validateEvent(
        candidateStart,
        candidateEnd,
        existingEvents,
        config,
        excludeEventId
      );

      if (!result.hasConflict) {
        return { startMin: candidateStart, endMin: candidateEnd };
      }
    }
  }

  return null; // Day is full
}

/**
 * Suggest top N best times for an event type.
 * Combines available slots with type-specific scoring.
 */
export function suggestBestTimes(
  eventType: string,
  durationMin: number,
  events: ScheduleEvent[],
  readinessLevel: string | null,
  config: SchedulingConfig,
  dayOfWeek?: number,
  topN: number = 3
): SlotSuggestion[] {
  const slots = findAvailableSlots(events, durationMin, config, dayOfWeek);

  // Apply type-specific scoring adjustments
  for (const slot of slots) {
    // Training: prefer afternoon
    if (eventType === 'training' || eventType === 'match') {
      if (slot.startMin >= 900 && slot.startMin <= 1140) slot.score += 10; // 3-7 PM
      if (readinessLevel === 'RED') slot.score -= 20; // Discourage if red readiness
    }

    // Study: prefer morning or early afternoon
    if (eventType === 'study_block' || eventType === 'exam') {
      if (slot.startMin >= 480 && slot.startMin <= 780) slot.score += 10; // 8 AM - 1 PM
    }

    // Recovery: prefer evening
    if (eventType === 'recovery') {
      if (slot.startMin >= 1080) slot.score += 10; // After 6 PM
    }
  }

  // Re-sort and return top N
  slots.sort((a, b) => b.score - a.score);
  return slots.slice(0, topN);
}

/**
 * Compute gap info between consecutive events for visual display.
 * Returns gap duration and adequacy for each pair of adjacent events.
 */
export function computeGaps(
  events: ScheduleEvent[],
  config: SchedulingConfig
): Array<{
  afterEventId: string;
  beforeEventId: string;
  gapMinutes: number;
  adequate: boolean;
  yStart: number;
  yEnd: number;
}> {
  const timed = events
    .filter((e) => e.startTime && e.endTime)
    .sort((a, b) => timeToMinutes(a.startTime!) - timeToMinutes(b.startTime!));

  const gaps: ReturnType<typeof computeGaps> = [];
  const startHourMin = 6 * 60; // START_HOUR from DayGrid

  for (let i = 0; i < timed.length - 1; i++) {
    const endMin = timeToMinutes(timed[i].endTime!);
    const nextStart = timeToMinutes(timed[i + 1].startTime!);
    const gapMin = nextStart - endMin;

    if (gapMin > 0 && gapMin <= 180) {
      // Only show markers for reasonable gaps (not 8 hour gaps)
      gaps.push({
        afterEventId: timed[i].id,
        beforeEventId: timed[i + 1].id,
        gapMinutes: gapMin,
        adequate: gapMin >= config.gapMinutes,
        yStart: ((endMin - startHourMin) / 30) * 60, // SLOT_HEIGHT=60
        yEnd: ((nextStart - startHourMin) / 30) * 60,
      });
    }
  }

  return gaps;
}

/**
 * Build a SchedulingConfig from the Schedule Rule Engine's effective rules.
 * This bridges the rule engine → scheduling engine.
 */
export function configFromEffectiveRules(
  effectiveRules: {
    buffers: { default: number; afterHighIntensity: number; afterMatch: number; beforeMatch: number };
    intensityCaps: { maxSessionsPerDay: number; noHardOnExamDay: boolean };
    dayBounds: { startHour: number; endHour: number };
  },
  schoolSchedule?: { days: number[]; startTime: string; endTime: string } | null
): SchedulingConfig {
  return {
    gapMinutes: effectiveRules.buffers.default,
    respectSchoolHours: !!schoolSchedule,
    schoolSchedule: schoolSchedule ?? null,
    dayStartHour: effectiveRules.dayBounds.startHour,
    dayEndHour: effectiveRules.dayBounds.endHour,
    preferredTrainingWindow: DEFAULT_CONFIG.preferredTrainingWindow,
    ruleOverrides: {
      gapAfterHighIntensity: effectiveRules.buffers.afterHighIntensity,
      gapAfterMatch: effectiveRules.buffers.afterMatch,
      gapBeforeMatch: effectiveRules.buffers.beforeMatch,
      maxSessionsPerDay: effectiveRules.intensityCaps.maxSessionsPerDay,
      noHardOnExamDay: effectiveRules.intensityCaps.noHardOnExamDay,
    },
  };
}

// ── Scoring Helpers ──────────────────────────────────────────────

function scoreSlot(
  slot: TimeSlot,
  events: ScheduleEvent[],
  config: SchedulingConfig
): number {
  let score = 50; // base

  // Preferred training window bonus (0-30)
  const { preferredTrainingWindow } = config;
  if (
    slot.startMin >= preferredTrainingWindow.startMin &&
    slot.endMin <= preferredTrainingWindow.endMin
  ) {
    score += 30;
  } else if (
    slot.startMin >= preferredTrainingWindow.startMin - 60 &&
    slot.endMin <= preferredTrainingWindow.endMin + 60
  ) {
    score += 15; // Near the window
  }

  // Gap quality — more buffer from neighbors = better (0-25)
  let minGap = Infinity;
  for (const evt of events) {
    if (!evt.startTime || !evt.endTime) continue;
    const evtStart = timeToMinutes(evt.startTime);
    const evtEnd = timeToMinutes(evt.endTime);
    const gapBefore = slot.startMin - evtEnd;
    const gapAfter = evtStart - slot.endMin;
    const nearest = Math.min(
      gapBefore >= 0 ? gapBefore : Infinity,
      gapAfter >= 0 ? gapAfter : Infinity
    );
    if (nearest < minGap) minGap = nearest;
  }
  if (minGap !== Infinity) {
    score += Math.min(25, Math.floor(minGap / 6)); // 150min gap = max 25 pts
  } else {
    score += 25; // No neighbors at all = perfect gap
  }

  // Afternoon bonus for general scheduling (0-10)
  if (slot.startMin >= 840 && slot.startMin <= 1080) {
    score += 10; // 2 PM - 6 PM sweet spot
  }

  return Math.min(100, Math.max(0, score));
}

function buildReason(
  slot: TimeSlot,
  events: ScheduleEvent[],
  config: SchedulingConfig
): string {
  const { preferredTrainingWindow } = config;

  if (
    slot.startMin >= preferredTrainingWindow.startMin &&
    slot.endMin <= preferredTrainingWindow.endMin
  ) {
    return 'In your preferred training window';
  }

  // Find nearest prior event
  let nearestBefore: ScheduleEvent | null = null;
  let nearestGap = Infinity;
  for (const evt of events) {
    if (!evt.endTime) continue;
    const evtEnd = timeToMinutes(evt.endTime);
    const gap = slot.startMin - evtEnd;
    if (gap > 0 && gap < nearestGap) {
      nearestGap = gap;
      nearestBefore = evt;
    }
  }

  if (nearestBefore && nearestGap < 120) {
    return `${nearestGap}min gap after ${nearestBefore.name}`;
  }

  if (slot.startMin < 720) return 'Morning slot';
  if (slot.startMin < 960) return 'Afternoon slot';
  return 'Evening slot';
}
