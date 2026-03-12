import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import {
  listNotifications,
  getUnreadCount,
} from "@/services/notificationService";

/**
 * GET /api/v1/notifications
 * List notifications for the authenticated user.
 * Query params: ?limit=50
 */
export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(req.url);
  const limit = Math.min(
    parseInt(searchParams.get("limit") || "50", 10) || 50,
    200
  );

  try {
    const [notifications, unreadCount] = await Promise.all([
      listNotifications(auth.user.id, limit),
      getUnreadCount(auth.user.id),
    ]);

    return NextResponse.json(
      { notifications, unreadCount },
      { headers: { "api-version": "v1" } }
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to fetch notifications" },
      { status: 500 }
    );
  }
}
