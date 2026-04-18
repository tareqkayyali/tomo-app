/**
 * POST /api/v1/week-plan/commit
 *
 * Persist a confirmed week plan:
 *   1. Batch-insert calendar_events for every plan item.
 *   2. Insert athlete_week_plans row linking the created events.
 *   3. Emit WEEK_PLAN_CREATED → triggers snapshot + rec refresh.
 *
 * If any step fails after events are created, the plan row is still
 * written so the events remain tied to an auditable plan. The caller
 * receives the created IDs so the mobile timeline can refresh.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { z } from "zod";
import { estimateLoad } from "@/services/events/computations/loadEstimator";
import { emitEventSafe } from "@/services/events/eventEmitter";
import { EVENT_TYPES, SOURCE_TYPES } from "@/services/events/constants";
import type { WeekPlanCreatedPayload } from "@/services/events/types";

const adjustmentSchema = z.object({
  move: z.enum(["time_shift", "day_shift", "swap"]),
  from: z.object({ date: z.string(), startTime: z.string() }),
  to: z.object({ date: z.string(), startTime: z.string() }),
  reason: z.string(),
});

const planItemSchema = z.object({
  title: z.string().min(1).max(200),
  category: z.string().min(1).max(60),
  subject: z.string().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  durationMin: z.number().int().min(15).max(240),
  eventType: z.enum(["training", "match", "study", "recovery"]),
  intensity: z.enum(["LIGHT", "MODERATE", "HARD"]),
  placementReason: z.string().optional(),
  predictedLoadAu: z.number().optional(),
  // From the repair engine — used to stamp calendar_events.metadata so
  // the Timeline can narrate moves on tap. Both optional: clean
  // placements come through with status='clean' and no adjustments.
  status: z.enum(["clean", "adjusted", "dropped"]).optional(),
  adjustments: z.array(adjustmentSchema).optional(),
});

const bodySchema = z.object({
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  timezone: z.string().min(1),
  planItems: z.array(planItemSchema).min(1).max(50),
  // Echoed from /draft — stored on the plan row so we can replay or diff.
  inputs: z.object({
    trainingMix: z.array(z.any()),
    studyMix: z.array(z.any()),
    modeId: z.string().optional(),
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

  const db = supabaseAdmin();

  // ── 1. Build calendar_events rows (UTC from local HH:MM + timezone) ──
  const eventsToInsert = body.planItems.map((item) => {
    const startUtc = localHhmmToUtc(item.date, item.startTime, body.timezone);
    const endUtc = localHhmmToUtc(item.date, item.endTime, body.timezone);
    return {
      user_id: auth.user.id,
      title: item.title,
      event_type: item.eventType,
      start_at: startUtc,
      end_at: endUtc,
      notes: item.category === "study"
        ? `Subject: ${item.subject ?? item.title}`
        : `Category: ${item.category}`,
      intensity: item.intensity,
    };
  });

  const { data: createdEvents, error: insertErr } = await db
    .from("calendar_events")
    .insert(eventsToInsert)
    .select("id, title, event_type, start_at, end_at, intensity");

  if (insertErr) {
    return NextResponse.json(
      { error: "Failed to create events", detail: insertErr.message },
      { status: 500 },
    );
  }

  const calendarEventIds = (createdEvents ?? []).map((r) => String(r.id));

  // ── 2. Summary (mirrors weekPlanBuilder.buildSummary) ──
  let trainingSessions = 0;
  let studySessions = 0;
  let totalMinutes = 0;
  let hardSessions = 0;
  let predictedLoadAu = 0;
  for (const it of body.planItems) {
    totalMinutes += it.durationMin;
    if (it.eventType === "study") studySessions++;
    else trainingSessions++;
    if (it.intensity === "HARD") hardSessions++;
    if (typeof it.predictedLoadAu === "number") {
      predictedLoadAu += it.predictedLoadAu;
    } else {
      const est = estimateLoad({
        event_type: it.eventType,
        intensity: it.eventType === "study" ? null : it.intensity,
        duration_min: it.durationMin,
      });
      predictedLoadAu += est.training_load_au + est.academic_load_au;
    }
  }
  const summary = {
    trainingSessions,
    studySessions,
    totalMinutes,
    hardSessions,
    predictedLoadAu: Math.round(predictedLoadAu),
  };

  // ── 3. Supersede any prior active plan for this week ──
  // If the athlete re-runs the planner mid-week, the previous row is
  // marked `superseded` rather than overwritten — trend analysis needs
  // both attempts.
  await (db as any)
    .from("athlete_week_plans")
    .update({ status: "superseded" })
    .eq("user_id", auth.user.id)
    .eq("week_start", body.weekStart)
    .eq("status", "active");

  // ── 4. Insert plan row ──
  const { data: planRow, error: planErr } = await (db as any)
    .from("athlete_week_plans")
    .insert({
      user_id: auth.user.id,
      week_start: body.weekStart,
      inputs: body.inputs,
      plan_items: body.planItems,
      summary,
      calendar_event_ids: calendarEventIds,
      status: "active",
    })
    .select("id")
    .single();

  if (planErr) {
    return NextResponse.json(
      {
        error: "Events created, plan row failed",
        detail: planErr.message,
        calendarEventIds,
      },
      { status: 500 },
    );
  }

  // ── 4b. Stamp metadata on each created event so the Timeline can
  //     narrate "moved from Tue because Tue was full" on tap, and so
  //     downstream analytics can link an event back to its plan.
  //     Metadata shape is stable for consumers:
  //       { week_plan: { week_plan_id, status, adjustments } }
  //     We update in a single loop — each event gets a separate PATCH
  //     rather than a noisy join. Adjustments + status are echoes from
  //     the builder's output; clean placements get status='clean' and
  //     no adjustments, so the narration path is silent for them.
  await Promise.all(
    (createdEvents ?? []).map(async (row, idx) => {
      const source = body.planItems[idx];
      if (!source) return;
      const adjustments = Array.isArray(source.adjustments) && source.adjustments.length > 0
        ? source.adjustments
        : null;
      const weekPlanMeta = {
        week_plan_id: String(planRow.id),
        status: source.status ?? "clean",
        ...(adjustments ? { adjustments } : {}),
      };
      const { error: metaErr } = await (db as any)
        .from("calendar_events")
        .update({ metadata: { week_plan: weekPlanMeta } })
        .eq("id", row.id);
      if (metaErr) {
        // Non-fatal — the event is still created and linked via
        // athlete_week_plans.calendar_event_ids; only the Timeline's
        // "why this moved" narration is lost.
        console.error("[week-plan/commit] metadata stamp failed", {
          eventId: row.id,
          error: metaErr.message,
        });
      }
    }),
  );

  // ── 5. Emit WEEK_PLAN_CREATED ──
  const payload: WeekPlanCreatedPayload = {
    week_plan_id: String(planRow.id),
    week_start: body.weekStart,
    calendar_event_ids: calendarEventIds,
    training_sessions: summary.trainingSessions,
    study_sessions: summary.studySessions,
    total_minutes: summary.totalMinutes,
    hard_sessions: summary.hardSessions,
    predicted_load_au: summary.predictedLoadAu,
  };
  await emitEventSafe({
    athleteId: auth.user.id,
    eventType: EVENT_TYPES.WEEK_PLAN_CREATED,
    source: SOURCE_TYPES.MANUAL,
    occurredAt: new Date().toISOString(),
    payload: payload as any,
    createdBy: auth.user.id,
  });

  return NextResponse.json({
    ok: true,
    weekPlanId: String(planRow.id),
    weekStart: body.weekStart,
    calendarEventIds,
    summary,
  });
}

/** Convert local HH:MM + YYYY-MM-DD + IANA tz → UTC ISO string. */
function localHhmmToUtc(dateISO: string, hhmm: string, tz: string): string {
  // Build a wall-clock string, compute the offset for that tz on that date,
  // and subtract to get UTC. Intl gives us the offset in minutes.
  const local = new Date(`${dateISO}T${hhmm}:00`);
  const offsetMin = tzOffsetMinutes(local, tz);
  const utc = new Date(local.getTime() - offsetMin * 60_000);
  return utc.toISOString();
}

function tzOffsetMinutes(d: Date, tz: string): number {
  // Compute the offset = (wall time in tz) − UTC, in minutes.
  const local = new Date(
    d.toLocaleString("en-US", { timeZone: tz }),
  );
  const utc = new Date(
    d.toLocaleString("en-US", { timeZone: "UTC" }),
  );
  return Math.round((local.getTime() - utc.getTime()) / 60_000);
}
