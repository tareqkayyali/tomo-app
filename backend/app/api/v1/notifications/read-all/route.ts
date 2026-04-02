import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { markAllAsRead } from "@/services/notificationService";
import { markAllRead } from "@/services/notifications/notificationEngine";
import type { NotificationCategory } from "@/services/notifications/notificationTemplates";

const VALID_CATEGORIES = [
  "critical",
  "training",
  "coaching",
  "academic",
  "triangle",
  "cv",
  "system",
];

/**
 * POST /api/v1/notifications/read-all
 * Mark all notifications as read for the authenticated user.
 *
 * Body: { source?: 'center', category?: string }
 *   source=center → marks in athlete_notifications (new table)
 *   no source → marks in notifications (legacy table)
 */
export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  try {
    let body: Record<string, unknown> = {};
    try {
      body = await req.json();
    } catch {
      // Empty body is fine
    }

    if (body.source === "center") {
      const category =
        body.category && VALID_CATEGORIES.includes(body.category as string)
          ? (body.category as NotificationCategory)
          : undefined;
      const count = await markAllRead(auth.user.id, category);
      return NextResponse.json(
        { success: true, marked: count },
        { headers: { "api-version": "v1" } }
      );
    }

    // Legacy path
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
