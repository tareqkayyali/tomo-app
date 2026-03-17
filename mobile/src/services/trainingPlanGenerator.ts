/**
 * Training Plan Generator — Scheduling Engine–Powered
 *
 * Pure TypeScript function that generates training blocks using
 * the Smart Calendar scheduling engine for conflict-free placement.
 *
 * Respects: existing calendar events, school hours, gap enforcement,
 * preferred time windows per category.
 */

import {
  autoPosition,
  timeToMinutes,
  minutesToTime,
  DEFAULT_CONFIG,
  configFromEffectiveRules,
} from './schedulingEngine';
import type { ScheduleEvent, SchedulingConfig } from './schedulingEngine';
import type { EffectiveRules } from '../hooks/useScheduleRules';
import type {
  TrainingPlanConfig,
  TrainingBlock,
  TrainingGeneratorResult,
  TrainingCategoryConfig,
  CalendarEvent,
  SchoolSchedule,
} from '../types';

// ── Helpers ──────────────────────────────────────────────────────────

function toDateStr(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function addDays(d: Date, n: number): Date {
  const result = new Date(d);
  result.setDate(result.getDate() + n);
  return result;
}

/** Map preferred time to a start minute target */
function preferredTimeToMin(pref: 'morning' | 'afternoon' | 'evening'): number {
  switch (pref) {
    case 'morning': return 480;    // 8:00 AM
    case 'afternoon': return 900;  // 3:00 PM
    case 'evening': return 1080;   // 6:00 PM
  }
}

/**
 * For 'days_per_week' mode, distribute N sessions evenly across available weekdays.
 * Returns array of day-of-week numbers (0=Sun..6=Sat).
 */
function distributeDays(
  daysPerWeek: number,
  schoolDays: number[],
): number[] {
  // Available days = all 7 minus school days for training
  // But we want to place training on non-school days or after school
  // So we don't exclude school days — scheduling engine handles time conflicts
  const allDays = [1, 2, 3, 4, 5, 6, 0]; // Mon-Sun
  if (daysPerWeek >= 7) return allDays;

  // Spread evenly
  const step = allDays.length / daysPerWeek;
  const selected: number[] = [];
  for (let i = 0; i < daysPerWeek; i++) {
    const idx = Math.floor(i * step) % allDays.length;
    selected.push(allDays[idx]);
  }
  return selected;
}

// ── Generator ────────────────────────────────────────────────────────

export function generateTrainingPlan(
  config: TrainingPlanConfig,
  existingEvents: CalendarEvent[] = [],
  schoolSchedule?: SchoolSchedule,
  schedulingConfig?: SchedulingConfig,
  effectiveRules?: EffectiveRules,
): TrainingGeneratorResult {
  // If EffectiveRules provided, derive scheduling config from them (rule engine → engine bridge)
  let sConfig: SchedulingConfig;
  if (effectiveRules) {
    sConfig = configFromEffectiveRules(
      effectiveRules,
      schoolSchedule ? { days: schoolSchedule.days, startTime: schoolSchedule.startTime, endTime: schoolSchedule.endTime } : null,
    );
  } else {
    sConfig = schedulingConfig || { ...DEFAULT_CONFIG };
    // Add school schedule to scheduling config
    if (schoolSchedule && !sConfig.schoolSchedule) {
      sConfig.respectSchoolHours = true;
      sConfig.schoolSchedule = {
        days: schoolSchedule.days,
        startTime: schoolSchedule.startTime,
        endTime: schoolSchedule.endTime,
      };
    }
  }

  const enabledCategories = config.categories.filter((c) => c.enabled);
  if (enabledCategories.length === 0) {
    return { blocks: [], warnings: ['No training categories enabled.'] };
  }

  // Date range: tomorrow → planWeeks ahead
  const tomorrow = addDays(new Date(), 1);
  tomorrow.setHours(0, 0, 0, 0);
  const endDate = addDays(tomorrow, config.planWeeks * 7);

  // Build all dates in range
  const allDates: { date: Date; dateStr: string; dow: number }[] = [];
  let cursor = new Date(tomorrow);
  while (cursor < endDate) {
    allDates.push({
      date: new Date(cursor),
      dateStr: toDateStr(cursor),
      dow: cursor.getDay(),
    });
    cursor = addDays(cursor, 1);
  }

  // Build per-day existing events (ScheduleEvent[])
  const dayEventsMap = new Map<string, ScheduleEvent[]>();

  function getDayEvents(dateStr: string): ScheduleEvent[] {
    if (!dayEventsMap.has(dateStr)) {
      dayEventsMap.set(dateStr, []);
    }
    return dayEventsMap.get(dateStr)!;
  }

  // Populate with existing calendar events
  for (const evt of existingEvents) {
    if (!evt.startTime || !evt.endTime) continue;
    getDayEvents(evt.date).push({
      id: evt.id,
      name: evt.name,
      startTime: evt.startTime,
      endTime: evt.endTime,
      type: evt.type,
      intensity: evt.intensity,
    });
  }

  const blocks: TrainingBlock[] = [];
  const warnings: string[] = [];
  let blockId = 0;

  // Sort categories: prioritize fixed-day categories (club typically fixed)
  const sortedCategories = [...enabledCategories].sort((a, b) => {
    if (a.mode === 'fixed_days' && b.mode !== 'fixed_days') return -1;
    if (a.mode !== 'fixed_days' && b.mode === 'fixed_days') return 1;
    return 0;
  });

  for (const category of sortedCategories) {
    // Determine which days of week this category targets
    let targetDows: number[];
    if (category.mode === 'fixed_days') {
      targetDows = category.fixedDays;
    } else {
      targetDows = distributeDays(
        category.daysPerWeek,
        schoolSchedule?.days || [],
      );
    }

    if (targetDows.length === 0) {
      warnings.push(`${category.label}: No days selected.`);
      continue;
    }

    const preferredStart = preferredTimeToMin(category.preferredTime);
    let totalPlaced = 0;
    let totalFailed = 0;

    // For each date in range, check if it matches a target day
    for (const { dateStr, dow } of allDates) {
      if (!targetDows.includes(dow)) continue;

      const dayEvents = getDayEvents(dateStr);

      // Use scheduling engine to find conflict-free slot
      const slot = autoPosition(
        category.sessionDuration,
        preferredStart,
        dayEvents,
        sConfig,
      );

      if (slot) {
        const startTime = minutesToTime(slot.startMin);
        const endTime = minutesToTime(slot.endMin);

        blocks.push({
          id: `tp_${++blockId}`,
          categoryId: category.id,
          categoryLabel: category.label,
          categoryColor: category.color,
          date: dateStr,
          startTime,
          endTime,
        });

        // Add to day events so subsequent categories/days see this block
        dayEvents.push({
          id: `tp_${blockId}`,
          name: category.label,
          startTime,
          endTime,
          type: 'training',
        });

        totalPlaced++;
      } else {
        totalFailed++;
      }
    }

    if (totalFailed > 0) {
      warnings.push(
        `Could not place ${totalFailed} ${category.label} session${totalFailed > 1 ? 's' : ''} — not enough free slots.`,
      );
    }
  }

  // Sort by date then start time
  blocks.sort((a, b) => {
    const dateCmp = a.date.localeCompare(b.date);
    if (dateCmp !== 0) return dateCmp;
    return a.startTime.localeCompare(b.startTime);
  });

  return { blocks, warnings };
}
