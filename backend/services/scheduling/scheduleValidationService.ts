/**
 * Schedule Validation Service — Shared pre-insert validation for all event generation flows.
 *
 * Used by: auto-fill week, drill scheduling, ghost suggestions confirm, chat agent.
 * Validates proposed events against the rule engine + existing calendar, returns
 * a preview with violations and alternative time suggestions.
 *
 * Flow: generateEvents → validateBatch(dryRun) → user reviews → confirmBatch(insert)
 */

import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  DEFAULT_PREFERENCES,
  detectScenario,
  getEffectiveRules,
  getEffectiveRulesWithMode,
  type EffectiveRules,
  type PlayerSchedulePreferences,
} from "@/services/scheduling/scheduleRuleEngine";
import { getModeDefinition } from "@/services/scheduling/modeConfig";
import {
  findAvailableSlots,
  timeToMinutes,
  minutesToTime,
  configFromEffectiveRules,
  type ScheduleEvent,
  type SchedulingConfig,
} from "@/services/schedulingEngine";
import { getDayBoundsISO } from "@/services/agents/contextBuilder";
import { readSnapshot } from "@/services/events/snapshot/snapshotReader";
import { estimateLoad } from "@/services/events/computations/loadEstimator";

// ── Types ────────────────────────────────────────────────────────

export interface ProposedEvent {
  title: string;
  event_type: string;
  date: string;          // YYYY-MM-DD (player local)
  startTime: string;     // HH:MM
  endTime: string;       // HH:MM
  intensity?: string;    // LIGHT | MODERATE | HARD
  notes?: string;
}

export interface EventViolation {
  type: "overlap" | "gap" | "intensity_cap" | "outside_bounds" | "exam_day_restriction" | "max_sessions" | "acwr_spike";
  message: string;
  severity: "error" | "warning";
}

export interface AlternativeSlot {
  startTime: string;
  endTime: string;
}

export interface ValidatedEvent extends ProposedEvent {
  violations: EventViolation[];
  alternatives: AlternativeSlot[];
  accepted: boolean;  // true by default, user can toggle off in preview
}

export interface SchedulePreviewResponse {
  events: ValidatedEvent[];
  summary: {
    total: number;
    withViolations: number;
    blocked: number;  // events with "error" severity violations
  };
  scenario: string;
}

// ── Main validation function ─────────────────────────────────────

/**
 * Validate a batch of proposed events against the rule engine + existing calendar.
 * Does NOT insert anything — purely read-only.
 */
export async function validateBatch(
  userId: string,
  proposed: ProposedEvent[],
  timezone: string
): Promise<SchedulePreviewResponse> {
  if (proposed.length === 0) {
    return { events: [], summary: { total: 0, withViolations: 0, blocked: 0 }, scenario: "normal" };
  }

  const db = supabaseAdmin();

  // Load player preferences + effective rules
  const { data: prefsRow } = await (db as any)
    .from("player_schedule_preferences")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  const prefs: PlayerSchedulePreferences = { ...DEFAULT_PREFERENCES, ...(prefsRow ?? {}) };
  const scenario = detectScenario(prefs);

  // Use CMS mode-aware rules when mode params are available
  const athleteMode = (prefs as any).athlete_mode ?? "balanced";
  let effective: EffectiveRules;
  try {
    const modeDef = await getModeDefinition(athleteMode);
    if (modeDef?.params) {
      effective = getEffectiveRulesWithMode(prefs, modeDef.params, athleteMode);
    } else {
      effective = getEffectiveRules(prefs, scenario);
    }
  } catch {
    effective = getEffectiveRules(prefs, scenario);
  }
  const schedulingConfig = configFromEffectiveRules(effective, {
    days: prefs.school_days as number[],
    startTime: prefs.school_start,
    endTime: prefs.school_end,
  });

  // Collect unique dates from proposed events
  const dates = [...new Set(proposed.map((e) => e.date))];

  // Fetch existing events for those dates
  const existingByDate = new Map<string, ScheduleEvent[]>();

  for (const date of dates) {
    const [dayStart, dayEnd] = getDayBoundsISO(date, timezone);
    const { data } = await db
      .from("calendar_events")
      .select("id, title, event_type, start_at, end_at, intensity")
      .eq("user_id", userId)
      .gte("start_at", dayStart)
      .lte("start_at", dayEnd);

    const events: ScheduleEvent[] = (data ?? []).map((row: any) => {
      const startLocal = new Date(row.start_at).toLocaleString("en-GB", {
        timeZone: timezone, hour: "2-digit", minute: "2-digit", hour12: false,
      });
      let endLocal = startLocal;
      if (row.end_at) {
        endLocal = new Date(row.end_at).toLocaleString("en-GB", {
          timeZone: timezone, hour: "2-digit", minute: "2-digit", hour12: false,
        });
      }
      return {
        id: row.id,
        name: row.title,
        startTime: startLocal,
        endTime: endLocal || addMinutesStr(startLocal, 60),
        type: row.event_type,
        intensity: row.intensity,
      };
    });

    existingByDate.set(date, events);
  }

  // Check for exam days (for intensity cap checks)
  const examDates = new Set<string>();
  if (effective.intensityCaps.noHardOnExamDay) {
    const allDates = dates;
    for (const date of allDates) {
      const [dayStart, dayEnd] = getDayBoundsISO(date, timezone);
      const { data: examData } = await db
        .from("calendar_events")
        .select("id")
        .eq("user_id", userId)
        .eq("event_type", "exam")
        .gte("start_at", dayStart)
        .lte("start_at", dayEnd)
        .limit(1);

      if (examData && examData.length > 0) {
        examDates.add(date);
      }
    }
  }

  // Read athlete snapshot once for ACWR spike check
  let snapshotATL: number | null = null;
  let snapshotCTL: number | null = null;
  try {
    const snapshot = await readSnapshot(userId, "ATHLETE");
    if (snapshot) {
      snapshotATL = (snapshot.atl_7day as number) ?? null;
      snapshotCTL = (snapshot.ctl_28day as number) ?? null;
    }
  } catch {
    // Graceful — validation still works without snapshot
  }

  // Validate each proposed event
  const validatedEvents: ValidatedEvent[] = [];

  // Track proposed events per date for intra-batch conflict detection
  const proposedByDate = new Map<string, Array<{ title: string; startMin: number; endMin: number; intensity?: string }>>();

  for (const event of proposed) {
    const violations: EventViolation[] = [];
    const startMin = timeToMinutes(event.startTime);
    const endMin = timeToMinutes(event.endTime);
    const existing = existingByDate.get(event.date) ?? [];
    const priorProposed = proposedByDate.get(event.date) ?? [];

    // 1. Day bounds check
    const dayStartMin = effective.dayBounds.startHour * 60;
    const dayEndMin = effective.dayBounds.endHour * 60;
    if (startMin < dayStartMin || endMin > dayEndMin) {
      violations.push({
        type: "outside_bounds",
        message: `Outside allowed hours (${minutesToTime(dayStartMin)}-${minutesToTime(dayEndMin)})`,
        severity: "error",
      });
    }

    // 2. Overlap with existing events
    for (const ex of existing) {
      if (!ex.startTime || !ex.endTime) continue;
      const exStart = timeToMinutes(ex.startTime);
      const exEnd = timeToMinutes(ex.endTime);

      if (startMin < exEnd && exStart < endMin) {
        violations.push({
          type: "overlap",
          message: `Overlaps with "${ex.name}" (${ex.startTime}-${ex.endTime})`,
          severity: "error",
        });
      }
    }

    // 3. Overlap with other proposed events in the same batch
    for (const pp of priorProposed) {
      if (startMin < pp.endMin && pp.startMin < endMin) {
        violations.push({
          type: "overlap",
          message: `Overlaps with "${pp.title}" in the same batch`,
          severity: "error",
        });
      }
    }

    // 4. Gap violations (using rule engine buffers)
    for (const ex of existing) {
      if (!ex.startTime || !ex.endTime) continue;
      const exStart = timeToMinutes(ex.startTime);
      const exEnd = timeToMinutes(ex.endTime);

      // Skip if overlapping (already caught above)
      if (startMin < exEnd && exStart < endMin) continue;

      // Determine required gap based on event type/intensity
      let requiredGap = effective.buffers.default;
      if (ex.type === "match") {
        requiredGap = Math.max(requiredGap, effective.buffers.afterMatch);
      } else if (ex.intensity === "HARD") {
        requiredGap = Math.max(requiredGap, effective.buffers.afterHighIntensity);
      }

      // Also check pre-match buffer: don't place hard training before a match
      if (ex.type === "match" && event.intensity === "HARD") {
        const gapBefore = exStart - endMin;
        if (gapBefore >= 0 && gapBefore < effective.buffers.beforeMatch) {
          violations.push({
            type: "gap",
            message: `Only ${gapBefore}min before match "${ex.name}" — need ${effective.buffers.beforeMatch}min buffer`,
            severity: "error",
          });
        }
      }

      // Post-event gap check
      const gapAfterExisting = startMin - exEnd;
      if (gapAfterExisting >= 0 && gapAfterExisting < requiredGap) {
        violations.push({
          type: "gap",
          message: `Only ${gapAfterExisting}min gap after "${ex.name}" — need ${requiredGap}min`,
          severity: "warning",
        });
      }

      // Gap before existing event
      const gapBeforeExisting = exStart - endMin;
      if (gapBeforeExisting >= 0 && gapBeforeExisting < requiredGap) {
        violations.push({
          type: "gap",
          message: `Only ${gapBeforeExisting}min gap before "${ex.name}" — need ${requiredGap}min`,
          severity: "warning",
        });
      }
    }

    // 5. Intensity cap: no HARD on exam day
    if (
      examDates.has(event.date) &&
      effective.intensityCaps.noHardOnExamDay &&
      event.intensity === "HARD"
    ) {
      violations.push({
        type: "intensity_cap",
        message: "HARD training not allowed on exam day — cap at LIGHT",
        severity: "error",
      });
    }

    // 6. Max sessions per day
    const trainingTypesOnDay = existing.filter(
      (e) => e.type === "training" || e.type === "gym" || e.type === "club"
    ).length + priorProposed.filter(
      (p) => p.intensity !== undefined // rough check for training events
    ).length;

    if (
      (event.event_type === "training" || event.event_type === "gym" || event.event_type === "club") &&
      trainingTypesOnDay >= effective.intensityCaps.maxSessionsPerDay
    ) {
      violations.push({
        type: "max_sessions",
        message: `Already ${trainingTypesOnDay} training session(s) on ${event.date} — max ${effective.intensityCaps.maxSessionsPerDay}`,
        severity: "warning",
      });
    }

    // 7. ACWR spike check: would this event push ACWR > 1.5?
    if (
      snapshotCTL !== null &&
      snapshotCTL > 0 &&
      snapshotATL !== null &&
      (event.event_type === "training" || event.event_type === "match")
    ) {
      const durationMin = endMin - startMin;
      const eventLoad = estimateLoad({
        event_type: event.event_type,
        intensity: event.intensity ?? null,
        duration_min: durationMin,
      });
      const projectedATL = snapshotATL + eventLoad.training_load_au / 7;
      const projectedACWR = projectedATL / snapshotCTL;
      if (projectedACWR > 1.5) {
        violations.push({
          type: "acwr_spike",
          message: `Adding this session would push ACWR to ${projectedACWR.toFixed(2)} (>1.5) — elevated injury risk`,
          severity: "warning",
        });
      }
    }

    // Generate alternative slots if there are violations
    let alternatives: AlternativeSlot[] = [];
    if (violations.length > 0) {
      const durationMin = endMin - startMin;
      const dayOfWeek = new Date(`${event.date}T12:00:00`).getDay();

      // Build combined existing + prior proposed for slot finding
      const allExisting: ScheduleEvent[] = [
        ...existing,
        ...priorProposed.map((p, i) => ({
          id: `proposed_${i}`,
          name: p.title,
          startTime: minutesToTime(p.startMin),
          endTime: minutesToTime(p.endMin),
          type: "training",
          intensity: p.intensity,
        })),
      ];

      const slots = findAvailableSlots(allExisting, durationMin, schedulingConfig, dayOfWeek);
      alternatives = slots.slice(0, 3).map((s) => ({
        startTime: minutesToTime(s.startMin),
        endTime: minutesToTime(s.endMin),
      }));
    }

    validatedEvents.push({
      ...event,
      violations,
      alternatives,
      accepted: violations.filter((v) => v.severity === "error").length === 0,
    });

    // Track this proposed event for intra-batch conflict detection
    if (!proposedByDate.has(event.date)) {
      proposedByDate.set(event.date, []);
    }
    proposedByDate.get(event.date)!.push({
      title: event.title,
      startMin,
      endMin,
      intensity: event.intensity,
    });
  }

  const withViolations = validatedEvents.filter((e) => e.violations.length > 0).length;
  const blocked = validatedEvents.filter(
    (e) => e.violations.some((v) => v.severity === "error")
  ).length;

  return {
    events: validatedEvents,
    summary: {
      total: validatedEvents.length,
      withViolations,
      blocked,
    },
    scenario,
  };
}

// ── Helpers ──────────────────────────────────────────────────────

function addMinutesStr(time: string, mins: number): string {
  const [h, m] = time.split(":").map(Number);
  const total = h * 60 + m + mins;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}
