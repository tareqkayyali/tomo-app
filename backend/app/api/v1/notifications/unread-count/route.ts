import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getUnreadCount } from "@/services/notifications/notificationEngine";

/**
 * GET /api/v1/notifications/unread-count
 * Returns { total, by_category } for notification center badge.
 */
export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  try {
    const result = await getUnreadCount(auth.user.id);
    return NextResponse.json(result, { headers: { "api-version": "v1" } });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to fetch unread count" },
      { status: 500 }
    );
  }
}
