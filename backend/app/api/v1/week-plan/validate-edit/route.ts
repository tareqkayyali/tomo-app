/**
 * POST /api/v1/week-plan/validate-edit
 *
 * Validate an in-draft single-item edit before it's applied to the plan
 * preview. Takes the current `plan_items[]` plus a proposed change
 * (new date / time / duration) for ONE item, and returns whether the
 * edit fits: no overlap, buffers respected, school hours respected,
 * still inside day bounds.
 *
 * Pure function, no writes. The client applies the edit locally if
 * this returns ok.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { z } from "zod";
import {
  validateEvent,
  timeToMinutes,
  type ScheduleEvent,
} from "@/services/schedulingEngine";
import { loadWeekPlanContext } from "@/services/weekPlan/weekPlanContext";
import { enumerateWeek } from "@/services/weekPlan/weekPlanBuilder";

const planItemSchema = z.object({
  title: z.string(),
  category: z.string(),
  subject: z.string().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  durationMin: z.number().int().min(15).max(240),
  eventType: z.enum(["training", "match", "study", "recovery"]),
  intensity: z.enum(["LIGHT", "MODERATE", "HARD"]),
  placementReason: z.string(),
  predictedLoadAu: z.number(),
});

const bodySchema = z.object({
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  timezone: z.string().optional(),
  planItems: z.array(planItemSchema),
  editIndex: z.number().int().min(0),
  proposed: z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    startTime: z.string().regex(/^\d{2}:\d{2}$/),
    durationMin: z.number().int().min(15).max(240),
    intensity: z.enum(["LIGHT", "MODERATE", "HARD"]).optional(),
    title: z.string().optional(),
  }),
});

export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: "Invalid request", detail: (err as Error).message },
      { status: 400 },
    );
  }

  if (body.editIndex >= body.planItems.length) {
    return NextResponse.json(
      { error: "editIndex out of range" },
      { status: 400 },
    );
  }

  // Must edit into a date inside the committed week.
  const weekDates = new Set(enumerateWeek(body.weekStart));
  if (!weekDates.has(body.proposed.date)) {
    return NextResponse.json({
      ok: false,
      code: "date_outside_week",
      message: "The chosen date is not inside the current week plan.",
    });
  }

  const ctx = await loadWeekPlanContext({
    userId: auth.user.id,
    weekStart: body.weekStart,
    timezone: body.timezone ?? "UTC",
  });

  // Build the "blocked" list for that date: every OTHER plan item on the same
  // date + every existing calendar event on the same date + school hours.
  const targetDate = body.proposed.date;
  const otherPlanBlocks: ScheduleEvent[] = body.planItems
    .filter((_, i) => i !== body.editIndex)
    .filter((it) => it.date === targetDate)
    .map((it, i) => ({
      id: `plan-${i}`,
      name: it.title,
      startTime: it.startTime,
      endTime: it.endTime,
      type: it.eventType,
      intensity: it.intensity,
    }));

  const existingBlocks: ScheduleEvent[] = ctx.existingEvents
    .filter((ev) => ev.date === targetDate)
    .map((ev) => ({
      id: ev.id,
      name: ev.name,
      startTime: ev.startTime,
      endTime: ev.endTime,
      type: ev.eventType,
      intensity: ev.intensity ?? null,
    }));

  const weekday = new Date(`${targetDate}T12:00:00Z`).getUTCDay();
  const schoolBlock: ScheduleEvent[] = ctx.playerPrefs.schoolDays.includes(
    weekday,
  )
    ? [{
        id: "__school__",
        name: "School",
        startTime: ctx.playerPrefs.schoolStart,
        endTime: ctx.playerPrefs.schoolEnd,
        type: "other",
        intensity: null,
      }]
    : [];

  const startMin = timeToMinutes(body.proposed.startTime);
  const endMin = startMin + body.proposed.durationMin;

  // Day-bounds check (weekday vs weekend).
  const isWeekend = weekday === 0 || weekday === 6;
  const boundsStart = isWeekend
    ? (ctx.playerPrefs.weekendBoundsStart ?? ctx.playerPrefs.dayBoundsStart)
    : ctx.playerPrefs.dayBoundsStart;
  const boundsEnd = isWeekend
    ? (ctx.playerPrefs.weekendBoundsEnd ?? ctx.playerPrefs.dayBoundsEnd)
    : ctx.playerPrefs.dayBoundsEnd;
  if (startMin < timeToMinutes(boundsStart) || endMin > timeToMinutes(boundsEnd)) {
    return NextResponse.json({
      ok: false,
      code: "outside_day_bounds",
      message: `That time is outside your available hours (${boundsStart}-${boundsEnd}).`,
    });
  }

  if (ctx.dayLocks.includes(targetDate)) {
    return NextResponse.json({
      ok: false,
      code: "day_locked",
      message: "That day is locked.",
    });
  }

  const conflict = validateEvent(
    startMin,
    endMin,
    [...schoolBlock, ...existingBlocks, ...otherPlanBlocks],
    ctx.config,
  );

  if (conflict.hasConflict) {
    return NextResponse.json({
      ok: false,
      code: "conflict",
      message: describeConflict(conflict),
      conflictingEvents: conflict.conflictingEvents,
      gapViolations: conflict.gapViolations,
    });
  }

  const endHH = String(Math.floor(endMin / 60)).padStart(2, "0");
  const endMM = String(endMin % 60).padStart(2, "0");

  return NextResponse.json({
    ok: true,
    endTime: `${endHH}:${endMM}`,
  });
}

function describeConflict(
  c: { conflictingEvents: Array<{ name: string }>; gapViolations: Array<{ name: string; shortfall: number }> },
): string {
  if (c.conflictingEvents.length > 0) {
    return `Overlaps ${c.conflictingEvents[0].name}.`;
  }
  if (c.gapViolations.length > 0) {
    const v = c.gapViolations[0];
    return `Too close to ${v.name} — need ${v.shortfall} more minutes of buffer.`;
  }
  return "That slot has a conflict.";
}
