/**
 * POST /api/v1/calendar/events/[id]/complete
 *
 * Athlete (or tool) confirms that a scheduled session actually happened.
 * Captures optional post-session RPE + duration and emits a SESSION_LOG
 * so ATL/CTL/ACWR downstream reflects the real (not just planned) load.
 *
 * State machine transition: scheduled → completed.
 *
 * Body (all optional — the endpoint supports "quick done" with no fields):
 *   { rpe?: number (1–10), duration?: number (minutes), notes?: string }
 *
 * On success:
 *   - Updates calendar_events with status='completed', completed=true,
 *     completed_at=NOW(), completion_source='manual', confidence_score=1.0.
 *   - Resolves effective_intensity: RPE (if given, via intensity catalog's
 *     rpe_to_intensity ladder) > scheduled intensity > catalog default.
 *   - Resolves effective duration: reported > scheduled.
 *   - Emits SESSION_LOG with the resolved intensity + duration so the
 *     handler writes the correct AU to athlete_daily_load.
 *     No duplicate emission: if the daily bridge already emitted a
 *     scheduled SESSION_LOG for this calendar event, the new emission
 *     carries `correction_of` so the event store supersedes.
 *
 * Auth: requireAuth (athlete themselves).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { emitEventSafe } from "@/services/events/eventEmitter";
import { EVENT_TYPES, SOURCE_TYPES } from "@/services/events/constants";
import { getIntensityCatalog } from "@/services/events/intensityCatalogConfig";
import { estimateLoad } from "@/services/events/computations/loadEstimator";
import {
  resolveEffectiveIntensity,
  resolveEffectiveDuration,
} from "@/services/calendar/resolveCompletion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  rpe:      z.number().int().min(1).max(10).optional(),
  duration: z.number().int().min(1).max(600).optional(),
  notes:    z.string().max(500).optional(),
});

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  const { id } = await ctx.params;

  let parsed;
  try {
    parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", detail: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { rpe, duration, notes } = parsed.data;

  const db = supabaseAdmin();

  // Load the event + ensure ownership.
  const { data: event, error: loadErr } = await (db as any)
    .from("calendar_events")
    .select("id, user_id, title, event_type, start_at, end_at, intensity, status, metadata")
    .eq("id", id)
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (loadErr) {
    return NextResponse.json({ error: "Failed to load event", detail: loadErr.message }, { status: 500 });
  }
  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }
  if (event.status === "completed") {
    // Idempotent: already done is a no-op, return the event as-is.
    return NextResponse.json({ event, already_completed: true });
  }
  if (event.status === "deleted") {
    return NextResponse.json({ error: "Cannot complete a deleted event" }, { status: 409 });
  }

  const catalog = await getIntensityCatalog({ athleteId: auth.user.id });
  const effectiveIntensity = resolveEffectiveIntensity({
    catalog,
    rpe,
    scheduledIntensity: event.intensity,
  });
  const effectiveDuration = resolveEffectiveDuration({
    reported:       duration,
    scheduledStart: event.start_at,
    scheduledEnd:   event.end_at,
  });

  // ── Compute training_load_au for the SESSION_LOG ──
  const { training_load_au } = estimateLoad(
    { event_type: event.event_type, intensity: effectiveIntensity, duration_min: effectiveDuration },
    catalog,
  );

  const now = new Date().toISOString();

  // ── Update the calendar_events row ──
  const metadataPatch = {
    ...(event.metadata ?? {}),
    completion: {
      rpe:      rpe ?? null,
      duration: duration ?? null,
      notes:    notes ?? null,
      completed_at: now,
    },
  };

  const { error: updateErr, data: updated } = await (db as any)
    .from("calendar_events")
    .update({
      status:              "completed",
      completed:           true,
      completed_at:        now,
      completion_source:   "manual",
      confidence_score:    1.00,
      reported_rpe:        rpe ?? null,
      reported_duration:   duration ?? null,
      effective_intensity: effectiveIntensity,
      metadata:            metadataPatch,
    })
    .eq("id", id)
    .eq("user_id", auth.user.id)
    .select()
    .single();

  if (updateErr) {
    return NextResponse.json(
      { error: "Failed to mark event complete", detail: updateErr.message },
      { status: 500 },
    );
  }

  // ── Emit SESSION_LOG event so downstream ATL/CTL/ACWR reflect actual load ──
  // The payload carries the resolved intensity + duration + AU. The handler
  // defense (PR 4) would fall back to computing AU from intensity+duration
  // if training_load_au were missing, but we compute it here explicitly so
  // the event store has the canonical value.
  await emitEventSafe({
    athleteId: auth.user.id,
    eventType: EVENT_TYPES.SESSION_LOG,
    occurredAt: event.start_at ?? now,
    source: SOURCE_TYPES.MANUAL,
    createdBy: "calendar-event-complete-endpoint",
    payload: {
      calendar_event_id: event.id,
      title:             event.title,
      event_type:        event.event_type,
      intensity:         effectiveIntensity,
      duration_min:      effectiveDuration,
      training_load_au:  training_load_au,
      completion_source: "manual",
      reported_rpe:      rpe ?? null,
      reported_duration: duration ?? null,
    },
  });

  return NextResponse.json({ event: updated });
}
