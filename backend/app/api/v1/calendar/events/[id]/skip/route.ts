/**
 * POST /api/v1/calendar/events/[id]/skip
 *
 * Athlete confirms they did NOT do a scheduled session. Sets status to
 * 'skipped' without emitting SESSION_LOG — the event stops contributing
 * to planned load and will never contribute to actual load.
 *
 * If the daily bridge had already emitted a scheduled SESSION_LOG for
 * this calendar event (because it was past-dated when the bridge ran),
 * that row stays on the event ledger but downstream consumers that
 * respect load_attribution_v1.atl_ctl_includes_scheduled=false will
 * filter it out once the flag flips.
 *
 * Body (optional): { reason?: string }
 *
 * Auth: requireAuth.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  reason: z.string().max(300).optional(),
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

  const db = supabaseAdmin();

  const { data: event, error: loadErr } = await (db as any)
    .from("calendar_events")
    .select("id, user_id, status, metadata")
    .eq("id", id)
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (loadErr) {
    return NextResponse.json({ error: "Failed to load event", detail: loadErr.message }, { status: 500 });
  }
  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }
  if (event.status === "skipped") {
    return NextResponse.json({ event, already_skipped: true });
  }
  if (event.status === "deleted") {
    return NextResponse.json({ error: "Cannot skip a deleted event" }, { status: 409 });
  }

  const metadataPatch = {
    ...(event.metadata ?? {}),
    skip: {
      reason:     parsed.data.reason ?? null,
      skipped_at: new Date().toISOString(),
    },
  };

  const { error: updateErr, data: updated } = await (db as any)
    .from("calendar_events")
    .update({
      status:             "skipped",
      completed:          false,
      completed_at:       null,
      completion_source:  "manual",
      confidence_score:   1.00,
      metadata:           metadataPatch,
    })
    .eq("id", id)
    .eq("user_id", auth.user.id)
    .select()
    .single();

  if (updateErr) {
    return NextResponse.json(
      { error: "Failed to mark event skipped", detail: updateErr.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ event: updated });
}
