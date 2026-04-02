import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { dismiss } from "@/services/notifications/notificationEngine";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * PATCH /api/v1/notifications/[id]/dismiss
 * Dismiss a notification and log for fatigue guard.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  const { id } = await params;

  // Look up the notification to get its type
  const db = supabaseAdmin() as any;
  const { data: notif } = await db
    .from("athlete_notifications")
    .select("type, category")
    .eq("id", id)
    .eq("athlete_id", auth.user.id)
    .single();

  if (!notif) {
    return NextResponse.json(
      { error: "Notification not found" },
      { status: 404, headers: { "api-version": "v1" } }
    );
  }

  // Critical notifications cannot be dismissed
  if (notif.category === "critical") {
    return NextResponse.json(
      { error: "Critical notifications cannot be dismissed" },
      { status: 403, headers: { "api-version": "v1" } }
    );
  }

  const ok = await dismiss(id, auth.user.id, notif.type);
  if (!ok) {
    return NextResponse.json(
      { error: "Failed to dismiss notification" },
      { status: 500, headers: { "api-version": "v1" } }
    );
  }

  return NextResponse.json(
    { success: true },
    { headers: { "api-version": "v1" } }
  );
}
