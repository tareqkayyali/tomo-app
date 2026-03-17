/**
 * PATCH /api/v1/player/notifications/[id] — Mark read, acted, or add to schedule
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { markAsRead, markNotificationActed } from "@/services/notificationService";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const body = await req.json();

  // Mark as read
  if (body.action === "read") {
    await markAsRead(id, auth.user.id);
    return NextResponse.json(
      { success: true },
      { headers: { "api-version": "v1" } }
    );
  }

  // Add all drills from notification to calendar
  if (body.action === "add_to_schedule") {
    const db = supabaseAdmin() as any;

    const { data: notif } = await db
      .from("notifications")
      .select("data")
      .eq("id", id)
      .eq("user_id", auth.user.id)
      .single();

    if (!notif?.data?.drills) {
      return NextResponse.json(
        { error: "No drill data found" },
        { status: 404 }
      );
    }

    // Insert all drills as calendar events with source='coach'
    const events = notif.data.drills.map((drill: any) => ({
      user_id: auth.user.id,
      name: drill.drillName,
      type: "training",
      date: drill.scheduledDate,
      intensity: drill.rpeTarget ?? 7,
      notes: drill.coachNotes ?? null,
      source: "coach",
    }));

    const { data: inserted, error } = await db
      .from("calendar_events")
      .insert(events)
      .select("id");

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    await markNotificationActed(id, auth.user.id);

    return NextResponse.json(
      {
        success: true,
        eventsAdded: inserted?.length ?? 0,
        refreshTargets: ["calendar"],
      },
      { headers: { "api-version": "v1" } }
    );
  }

  return NextResponse.json(
    { error: "Unknown action" },
    { status: 400 }
  );
}
