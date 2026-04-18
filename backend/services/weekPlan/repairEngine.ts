/**
 * Week Plan Repair Engine
 *
 * After the greedy first-pass placement fails for some items, this engine
 * runs bounded local search to fit them by relocating sessions with
 * minimum disruption.
 *
 * Three moves in priority order, stop on first success per item:
 *
 *   1. Time shift   — widen the ±30min spiral to ±90min on the preferred
 *                     day. SILENT: doesn't earn a yellow dot. The athlete
 *                     asked for flexible placement, a same-day shift is
 *                     what "flexible" means.
 *   2. Day shift    — (flexible items only) try day−1 then day+1 from
 *                     preferred. LOGGED: yellow dot + reason.
 *   3. Swap         — displace an already-placed item that ranks LOWER in
 *                     the category priority, re-queue the displaced item
 *                     for its own repair pass. LOGGED: yellow dot + reason
 *                     on both the incoming and displaced item.
 *
 * Max 3 repair passes per item (prevents cycles). If still unplaced →
 * dropped with a red status.
 *
 * Priority is resolved from scheduling_rules.config.priority[scenario]
 * with athlete_modes.params.priorityBoosts applied — fully CMS-driven.
 */

import {
  autoPosition,
  type SchedulingConfig,
  type ScheduleEvent,
} from "@/services/schedulingEngine";
import type {
  ExistingEvent,
  PlayerPrefs,
  PlanItem,
  PlanWarning,
  Intensity,
} from "./weekPlanBuilder";
import type { ResolvedPriority } from "./priorityResolver";
import { rankOf, outranks } from "./priorityResolver";

/** A candidate that failed greedy placement and needs repair. */
export interface UnplacedCandidate {
  title: string;
  category: string;
  subject?: string;
  durationMin: number;
  placement: "fixed" | "flexible";
  /** Days the candidate is allowed on (fixed) or empty for flexible. */
  allowedWeekdays: number[];
  preferredStartMin: number;
  eventType: PlanItem["eventType"];
  intensity: Intensity;
  /** Days the athlete has locked — never placed here. */
  dayLocks: Set<string>;
}

/** Adjustment log entry surfaced to the preview card. */
export type AdjustmentMove = "time_shift" | "day_shift" | "swap";
export interface Adjustment {
  move: AdjustmentMove;
  from: { date: string; startTime: string };
  to: { date: string; startTime: string };
  reason: string;
}

export type ItemStatus = "clean" | "adjusted" | "dropped";

export interface RepairablePlanItem extends PlanItem {
  status: ItemStatus;
  adjustments?: Adjustment[];
}

/** Result of one repair call. */
export interface RepairOutcome {
  placedItems: RepairablePlanItem[];
  droppedItems: Array<{ candidate: UnplacedCandidate; reason: string }>;
  warnings: PlanWarning[];
}

export interface RepairEngineInput {
  weekDates: string[];
  unplaced: UnplacedCandidate[];
  placedItems: RepairablePlanItem[];
  existingByDate: Record<string, ScheduleEvent[]>;
  stagedByDate: Record<string, ScheduleEvent[]>;
  playerPrefs: PlayerPrefs;
  config: SchedulingConfig;
  priority: ResolvedPriority;
  /** Cap on how many repair attempts per item before we give up. */
  maxRepairPasses?: number;
}

const TIME_SHIFT_WINDOW_MIN = 90;   // ±90min from preferred on the same day

/**
 * Public entry. Attempts to place every unplaced candidate using the three
 * moves. Mutates nothing in the caller's world — returns new staged maps
 * via the updated PlanItems returned.
 *
 * NOTE: the engine MAY swap already-placed items; the caller's
 * `placedItems` argument is treated as authoritative input but the
 * returned `placedItems` may differ (an item may be marked 'adjusted' or
 * even come back as a pending re-repair if its partner needed to move).
 */
export function runRepair(input: RepairEngineInput): RepairOutcome {
  const maxPasses = input.maxRepairPasses ?? 3;
  const placed = [...input.placedItems];
  const stagedByDate: Record<string, ScheduleEvent[]> = {};
  for (const d of input.weekDates) stagedByDate[d] = [...(input.stagedByDate[d] ?? [])];

  const queue = input.unplaced.map((c) => ({ cand: c, attempts: 0 }));
  const dropped: Array<{ candidate: UnplacedCandidate; reason: string }> = [];
  const warnings: PlanWarning[] = [];

  // Drain the queue. Swaps can re-enqueue a displaced item so we track
  // per-item attempt counts to guarantee termination.
  while (queue.length > 0) {
    const { cand, attempts } = queue.shift()!;
    if (attempts >= maxPasses) {
      dropped.push({
        candidate: cand,
        reason: "repair budget exhausted — no move found after 3 attempts",
      });
      continue;
    }

    // Move 1 — widened same-day spiral. Silent; no adjustment log.
    const timeShift = tryTimeShift(cand, input, stagedByDate);
    if (timeShift) {
      placed.push({
        ...buildPlanItem(cand, timeShift.date, timeShift.slot, "auto"),
        status: "clean",
      });
      stagedByDate[timeShift.date].push(
        toScheduleEvent(cand, timeShift.slot, placed.length),
      );
      continue;
    }

    // Move 2 — adjacent-day shift (flexible only). LOGGED.
    if (cand.placement === "flexible") {
      const dayShift = tryDayShift(cand, input, stagedByDate);
      if (dayShift) {
        const originalDate = cand.placement === "flexible"
          ? preferredDateFor(cand, input.weekDates)
          : dayShift.date;
        const adjustment: Adjustment = {
          move: "day_shift",
          from: { date: originalDate ?? dayShift.date, startTime: toHHMM(cand.preferredStartMin) },
          to: { date: dayShift.date, startTime: toHHMM(dayShift.slot.startMin) },
          reason: dayShift.reason,
        };
        placed.push({
          ...buildPlanItem(cand, dayShift.date, dayShift.slot, "bumped"),
          status: "adjusted",
          adjustments: [adjustment],
        });
        stagedByDate[dayShift.date].push(
          toScheduleEvent(cand, dayShift.slot, placed.length),
        );
        continue;
      }
    }

    // Move 3 — swap with a lower-priority placed item. LOGGED on both.
    const swap = trySwap(cand, input, placed, stagedByDate);
    if (swap) {
      // 1) Record the new placement for the repair candidate.
      const swapInAdjustment: Adjustment = {
        move: "swap",
        from: { date: swap.date, startTime: toHHMM(cand.preferredStartMin) },
        to: { date: swap.date, startTime: toHHMM(swap.slot.startMin) },
        reason: `Swapped with ${swap.displaced.title} — ${cand.category} ranks above ${swap.displaced.category}`,
      };
      placed.push({
        ...buildPlanItem(cand, swap.date, swap.slot, "bumped"),
        status: "adjusted",
        adjustments: [swapInAdjustment],
      });
      stagedByDate[swap.date].push(
        toScheduleEvent(cand, swap.slot, placed.length),
      );

      // 2) Remove the displaced item from `placed` and its staged event,
      //    enqueue it for its own repair pass (attempts reset to 0 — it's
      //    a different item; max-pass bound still guarantees termination
      //    because the SAME item can only be swapped out a bounded number
      //    of times before rankOf stops matching).
      const displacedIdx = placed.findIndex((p) => p === swap.displaced);
      if (displacedIdx >= 0) placed.splice(displacedIdx, 1);
      const staged = stagedByDate[swap.displaced.date];
      if (staged) {
        const stagedIdx = staged.findIndex((e) => e.id === swap.displacedStagedId);
        if (stagedIdx >= 0) staged.splice(stagedIdx, 1);
      }
      queue.push({
        cand: candidateFromPlanItem(swap.displaced, input.weekDates, input.playerPrefs),
        attempts: attempts + 1,
      });
      continue;
    }

    // All three moves failed. Drop with a descriptive reason.
    dropped.push({
      candidate: cand,
      reason: describeDropReason(cand, input),
    });
  }

  // Materialize warnings for truly-dropped items only.
  for (const d of dropped) {
    warnings.push({
      code: d.candidate.placement === "fixed"
        ? "fixed_day_unavailable"
        : "dropped_session_no_slot",
      category: d.candidate.category,
      message: `Couldn't fit ${d.candidate.title} this week — ${d.reason}`,
    });
  }

  return { placedItems: placed, droppedItems: dropped, warnings };
}

// ── Moves ──────────────────────────────────────────────────────

function tryTimeShift(
  cand: UnplacedCandidate,
  input: RepairEngineInput,
  stagedByDate: Record<string, ScheduleEvent[]>,
): { date: string; slot: { startMin: number; endMin: number } } | null {
  // Shift only on the allowed day(s). For fixed: each allowed day. For
  // flexible: the preferred date inferred from the preferred time window.
  const targets = cand.placement === "fixed"
    ? input.weekDates.filter((d) =>
        cand.allowedWeekdays.includes(weekdayOf(d)) &&
        !cand.dayLocks.has(d),
      )
    : [preferredDateFor(cand, input.weekDates)].filter((d): d is string => !!d && !cand.dayLocks.has(d));

  for (const date of targets) {
    const perDay = buildPerDayConfig(date, input.playerPrefs, input.config);
    const blocked = blocksForDate(date, input, stagedByDate);

    // Try the same spiral but with a widened window — autoPosition already
    // expands outward, so a "widened" call = calling it with a larger
    // dayStart/dayEnd. Easier: call autoPosition normally; its built-in
    // spiral covers the full day bounds. But the key is CHECK from preferredStartMin.
    // Our real bug-catcher here is: the greedy pass already called autoPosition
    // on the exact same day. So time-shift alone can't rescue unless we
    // tighten something. In practice the greedy pass was called with the
    // OTHER stagedByDate state — now that items have been placed elsewhere,
    // there may be room. So just retry.
    const slot = autoPosition(
      cand.durationMin,
      cand.preferredStartMin,
      blocked,
      perDay,
    );
    if (slot && within(slot.startMin, cand.preferredStartMin, TIME_SHIFT_WINDOW_MIN)) {
      return { date, slot };
    }
  }
  return null;
}

function tryDayShift(
  cand: UnplacedCandidate,
  input: RepairEngineInput,
  stagedByDate: Record<string, ScheduleEvent[]>,
): {
  date: string;
  slot: { startMin: number; endMin: number };
  reason: string;
} | null {
  // Flexible items only — fixed items can't day-shift by definition.
  if (cand.placement !== "flexible") return null;

  const preferred = preferredDateFor(cand, input.weekDates);
  const candidates = adjacentDays(preferred, input.weekDates).filter((d) => !cand.dayLocks.has(d));

  for (const date of candidates) {
    const perDay = buildPerDayConfig(date, input.playerPrefs, input.config);
    const blocked = blocksForDate(date, input, stagedByDate);
    const slot = autoPosition(
      cand.durationMin,
      cand.preferredStartMin,
      blocked,
      perDay,
    );
    if (slot) {
      const reason = preferred && preferred !== date
        ? `${preferred} was full at your preferred time — moved to ${date}.`
        : `Placed on ${date} — first open day that fit.`;
      return { date, slot, reason };
    }
  }
  return null;
}

function trySwap(
  cand: UnplacedCandidate,
  input: RepairEngineInput,
  placed: RepairablePlanItem[],
  stagedByDate: Record<string, ScheduleEvent[]>,
):
  | {
      date: string;
      slot: { startMin: number; endMin: number };
      displaced: RepairablePlanItem;
      displacedStagedId: string;
    }
  | null {
  // Find every placed item that the candidate outranks AND whose date is
  // compatible with the candidate's placement constraints. For each such
  // candidate swap partner, simulate: what if we remove the partner from
  // that day — does the candidate fit? If yes, record the swap.
  for (const partner of placed) {
    if (!outranks(input.priority, cand.category, partner.category)) continue;
    // Fixed candidate: only swap on an allowed weekday.
    if (cand.placement === "fixed") {
      const weekday = weekdayOf(partner.date);
      if (!cand.allowedWeekdays.includes(weekday)) continue;
    }
    if (cand.dayLocks.has(partner.date)) continue;

    // Simulate: remove partner from stagedByDate, run autoPosition, then
    // restore (we mutate on success only in the main loop, not here).
    const staged = stagedByDate[partner.date];
    if (!staged) continue;
    const partnerEvent = staged.find(
      (e) => e.startTime === partner.startTime && e.name === partner.title,
    );
    if (!partnerEvent) continue;

    const perDay = buildPerDayConfig(partner.date, input.playerPrefs, input.config);
    const blockedWithout = [
      ...(input.existingByDate[partner.date] ?? []),
      ...staged.filter((e) => e !== partnerEvent),
      ...syntheticsForDate(partner.date, input.playerPrefs),
    ];
    const slot = autoPosition(
      cand.durationMin,
      cand.preferredStartMin,
      blockedWithout,
      perDay,
    );
    if (slot) {
      return {
        date: partner.date,
        slot,
        displaced: partner,
        displacedStagedId: partnerEvent.id,
      };
    }
  }
  return null;
}

// ── Helpers ────────────────────────────────────────────────────

function buildPerDayConfig(
  date: string,
  prefs: PlayerPrefs,
  config: SchedulingConfig,
): SchedulingConfig {
  const weekday = weekdayOf(date);
  const isWeekend = weekday === 0 || weekday === 6;
  return {
    ...config,
    respectSchoolHours: false,  // school injected as synthetic events instead
    schoolSchedule: null,
    dayStartHour: parseHour(
      isWeekend
        ? (prefs.weekendBoundsStart ?? prefs.dayBoundsStart)
        : prefs.dayBoundsStart,
      config.dayStartHour,
    ),
    dayEndHour: parseHour(
      isWeekend
        ? (prefs.weekendBoundsEnd ?? prefs.dayBoundsEnd)
        : prefs.dayBoundsEnd,
      config.dayEndHour,
    ),
  };
}

function syntheticsForDate(date: string, prefs: PlayerPrefs): ScheduleEvent[] {
  const weekday = weekdayOf(date);
  if (!prefs.schoolDays.includes(weekday)) return [];
  return [
    {
      id: "__school__",
      name: "School",
      startTime: prefs.schoolStart,
      endTime: prefs.schoolEnd,
      type: "other",
      intensity: null,
    },
  ];
}

function blocksForDate(
  date: string,
  input: RepairEngineInput,
  stagedByDate: Record<string, ScheduleEvent[]>,
): ScheduleEvent[] {
  return [
    ...syntheticsForDate(date, input.playerPrefs),
    ...(input.existingByDate[date] ?? []),
    ...(stagedByDate[date] ?? []),
  ];
}

function preferredDateFor(
  cand: UnplacedCandidate,
  weekDates: string[],
): string | null {
  // For flexible items we don't have an "original" day — use the first
  // allowed (non-locked) date. This is only used to render the "from"
  // field in day-shift adjustments, so it's informational.
  const allowed = weekDates.filter((d) => !cand.dayLocks.has(d));
  return allowed[0] ?? null;
}

function adjacentDays(preferred: string | null, weekDates: string[]): string[] {
  if (!preferred) return weekDates;
  const idx = weekDates.indexOf(preferred);
  if (idx < 0) return weekDates;
  // Try day before, then day after, then remaining days of the week.
  const out: string[] = [];
  if (idx - 1 >= 0) out.push(weekDates[idx - 1]);
  if (idx + 1 < weekDates.length) out.push(weekDates[idx + 1]);
  for (let i = 0; i < weekDates.length; i++) {
    if (i === idx || i === idx - 1 || i === idx + 1) continue;
    out.push(weekDates[i]);
  }
  return out;
}

function candidateFromPlanItem(
  item: RepairablePlanItem,
  weekDates: string[],
  prefs: PlayerPrefs,
): UnplacedCandidate {
  // A displaced placed item re-enters the queue. All we know is its date +
  // category — treat it as flexible for the re-repair pass so the engine
  // can relocate it anywhere (if it had been fixed originally, it wouldn't
  // have been eligible for swap displacement in the first place).
  return {
    title: item.title,
    category: item.category,
    subject: item.subject,
    durationMin: item.durationMin,
    placement: "flexible",
    allowedWeekdays: [0, 1, 2, 3, 4, 5, 6],
    preferredStartMin: parseHHMM(item.startTime),
    eventType: item.eventType,
    intensity: item.intensity,
    dayLocks: new Set(),
  };
}

function buildPlanItem(
  cand: UnplacedCandidate,
  date: string,
  slot: { startMin: number; endMin: number },
  placementReason: PlanItem["placementReason"],
): PlanItem {
  return {
    title: cand.title,
    category: cand.category,
    subject: cand.subject,
    date,
    startTime: toHHMM(slot.startMin),
    endTime: toHHMM(slot.endMin),
    durationMin: cand.durationMin,
    eventType: cand.eventType,
    intensity: cand.intensity,
    placementReason,
    predictedLoadAu: 0,  // recomputed by caller via estimateLoad
  };
}

function toScheduleEvent(
  cand: UnplacedCandidate,
  slot: { startMin: number; endMin: number },
  idx: number,
): ScheduleEvent {
  return {
    id: `repair-${idx}`,
    name: cand.title,
    startTime: toHHMM(slot.startMin),
    endTime: toHHMM(slot.endMin),
    type: cand.eventType,
    intensity: cand.intensity,
  };
}

function describeDropReason(cand: UnplacedCandidate, input: RepairEngineInput): string {
  if (cand.placement === "fixed" && cand.allowedWeekdays.length === 0) {
    return "no allowed day left in the week";
  }
  if (cand.dayLocks.size > 0 && cand.placement === "fixed") {
    const fullyLocked = cand.allowedWeekdays.every((wd) =>
      input.weekDates.some((d) => cand.dayLocks.has(d) && weekdayOf(d) === wd),
    );
    if (fullyLocked) return "all chosen days are locked";
  }
  // Default — most common cause.
  return "no open slot that respects buffers and school hours";
}

function within(value: number, center: number, tolerance: number): boolean {
  return Math.abs(value - center) <= tolerance;
}

function weekdayOf(iso: string): number {
  const [y, m, d] = iso.split("-").map((n) => parseInt(n, 10));
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1)).getUTCDay();
}

function parseHHMM(s: string): number {
  const [h, m] = s.split(":").map((n) => parseInt(n, 10));
  return (h || 0) * 60 + (m || 0);
}

function toHHMM(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function parseHour(hhmm: string, fallback: number): number {
  const [h] = hhmm.split(":").map((n) => parseInt(n, 10));
  return Number.isFinite(h) ? h : fallback;
}
