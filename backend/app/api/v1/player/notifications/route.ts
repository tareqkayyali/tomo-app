/**
 * GET  /api/v1/player/notifications — List player's notifications + unread count
 * POST /api/v1/player/notifications — Register push token OR mark all read
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import {
  listNotifications,
  getUnreadCount,
  markAllAsRead,
  savePushToken,
} from "@/services/notificationService";

export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  const { searchParams } = req.nextUrl;
  const unreadOnly = searchParams.get("unread") === "true";
  const limit = parseInt(searchParams.get("limit") ?? "30");

  try {
    const [rawNotifications, unreadCount] = await Promise.all([
      listNotifications(auth.user.id, limit),
      getUnreadCount(auth.user.id),
    ]);

    // Filter unread if requested
    const notifications = unreadOnly
      ? rawNotifications.filter((n: any) => !n.read)
      : rawNotifications;

    // Map snake_case to camelCase for frontend
    const mapped = notifications.map(mapNotification);

    return NextResponse.json(
      { notifications: mapped, unreadCount },
      { headers: { "api-version": "v1" } }
    );
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  const body = await req.json();

  // Mark all read
  if (body.action === "mark_all_read") {
    await markAllAsRead(auth.user.id);
    return NextResponse.json(
      { success: true },
      { headers: { "api-version": "v1" } }
    );
  }

  // Register push token
  if (body.expoPushToken) {
    await savePushToken(
      auth.user.id,
      body.expoPushToken,
      body.platform ?? "ios"
    );
    return NextResponse.json(
      { saved: true },
      { headers: { "api-version": "v1" } }
    );
  }

  return NextResponse.json(
    { error: "Unknown action" },
    { status: 400 }
  );
}

function mapNotification(row: any) {
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type,
    title: row.title,
    body: row.body,
    data: row.data ?? {},
    read: row.read,
    isActed: row.is_acted ?? false,
    actionLabel: row.action_label,
    actionData: row.action_data ?? {},
    sourceId: row.source_id,
    sourceType: row.source_type,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
}
