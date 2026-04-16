/**
 * PUT /api/v1/calendar/events/:id/load-override
 *
 * Override the load/intensity of a specific calendar event.
 * Used when the Training Program Agent needs to adjust a session
 * outside normal scheduling (e.g., deload, phase transition, coach override).
 *
 * Called by Training Program Agent via Python bridge.
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

const VALID_INTENSITIES = ["REST", "LIGHT", "MODERATE", "HARD"] as const;
type Intensity = (typeof VALID_INTENSITIES)[number];

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = req.headers.get("x-tomo-user-id");
  if (!userId) {
    return NextResponse.json({ error: "Missing user ID" }, { status: 401 });
  }

  const { id: eventId } = await params;
  const body = await req.json();
  const { intensity, reason, load_au } = body;

  if (!intensity || !VALID_INTENSITIES.includes(intensity as Intensity)) {
    return NextResponse.json(
      { error: `intensity must be one of: ${VALID_INTENSITIES.join(", ")}` },
      { status: 400 },
    );
  }

  const db = supabaseAdmin();

  // Verify the event exists and belongs to this user
  const { data: existing, error: fetchError } = await db
    .from("calendar_events")
    .select("id, title, intensity, notes, user_id")
    .eq("id", eventId)
    .single();

  if (fetchError || !existing) {
    return NextResponse.json(
      { error: "Calendar event not found" },
      { status: 404 },
    );
  }

  if ((existing as any).user_id !== userId) {
    return NextResponse.json(
      { error: "Event does not belong to this user" },
      { status: 403 },
    );
  }

  const previousIntensity = (existing as any).intensity;

  // Build update payload
  // calendar_events columns: intensity, estimated_load_au, notes
  // No: updated_at, load_au, metadata (these do not exist on the table)
  const updatePayload: Record<string, any> = {
    intensity,
  };

  // Column is estimated_load_au (not load_au)
  if (typeof load_au === "number" && load_au >= 0) {
    updatePayload.estimated_load_au = load_au;
  }

  // Store override context in notes since calendar_events has no metadata column
  const overrideNote = `Override: ${previousIntensity} -> ${intensity} (${reason || "agent_override"})`;
  const existingNotes = (existing as any).notes || "";
  updatePayload.notes = existingNotes
    ? `${existingNotes}\n${overrideNote}`
    : overrideNote;

  const { data: updated, error: updateError } = await db
    .from("calendar_events")
    .update(updatePayload)
    .eq("id", eventId)
    .select("id, title, intensity, start_at")
    .single();

  if (updateError) {
    return NextResponse.json(
      { error: "Failed to override load", detail: updateError.message },
      { status: 500 },
    );
  }

  return NextResponse.json({
    success: true,
    override: {
      event_id: eventId,
      title: (updated as any)?.title,
      previous_intensity: previousIntensity,
      new_intensity: intensity,
      reason: reason || "agent_override",
      start_at: (updated as any)?.start_at,
    },
  });
}
