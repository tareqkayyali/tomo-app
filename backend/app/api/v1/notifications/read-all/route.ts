import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { markAllAsRead } from "@/services/notificationService";

/**
 * POST /api/v1/notifications/read-all
 * Mark all notifications as read for the authenticated user.
 */
export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  try {
    await markAllAsRead(auth.user.id);
    return NextResponse.json(
      { success: true },
      { headers: { "api-version": "v1" } }
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to mark all as read" },
      { status: 500 }
    );
  }
}
