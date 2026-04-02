import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { markActed } from "@/services/notifications/notificationEngine";

/**
 * PATCH /api/v1/notifications/[id]/act
 * Mark a notification as acted upon.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  const { id } = await params;

  const ok = await markActed(id);
  if (!ok) {
    return NextResponse.json(
      { error: "Notification not found or already resolved" },
      { status: 404, headers: { "api-version": "v1" } }
    );
  }

  return NextResponse.json(
    { success: true },
    { headers: { "api-version": "v1" } }
  );
}
