import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import {
  getNotifications,
  getUnreadCount,
} from "@/services/notifications/notificationEngine";
import {
  listNotifications,
  getUnreadCount as getLegacyUnreadCount,
} from "@/services/notificationService";
import { parsePagination, paginatedResponse, hasPaginationParams } from "@/lib/pagination";

const HEADERS = { "api-version": "v1" };

/**
 * GET /api/v1/notifications
 *
 * Query params:
 *   ?source=center   → reads from athlete_notifications (new notification center)
 *   ?status=unread    → filter by status (center only)
 *   ?category=training → filter by category (center only)
 *   ?limit=30&offset=0 → pagination (center only)
 *   ?page=1&limit=20  → legacy paginated format
 *
 * Default (no source param): legacy notifications table for backward compat.
 */
export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(req.url);
  const source = searchParams.get("source");

  // ─── New notification center ───
  if (source === "center") {
    try {
      const result = await getNotifications(auth.user.id, {
        status: searchParams.get("status") ?? undefined,
        category: searchParams.get("category") ?? undefined,
        limit: parseInt(searchParams.get("limit") ?? "30", 10) || 30,
        offset: parseInt(searchParams.get("offset") ?? "0", 10) || 0,
      });

      return NextResponse.json(result, { headers: HEADERS });
    } catch (err: any) {
      return NextResponse.json(
        { error: err.message || "Failed to fetch notifications" },
        { status: 500 }
      );
    }
  }

  // ─── Legacy path (existing behavior) ───
  const paginate = hasPaginationParams(req);

  if (paginate) {
    const params = parsePagination(req, 50, 200);
    try {
      const { supabaseAdmin } = await import("@/lib/supabase/admin");
      const db = supabaseAdmin() as any;
      const [{ data, error, count }, unreadCount] = await Promise.all([
        db
          .from("notifications")
          .select("*", { count: "exact" })
          .eq("user_id", auth.user.id)
          .order("created_at", { ascending: false })
          .range(params.offset, params.offset + params.limit - 1),
        getLegacyUnreadCount(auth.user.id),
      ]);

      if (error) {
        return NextResponse.json(
          { error: error.message || "Failed to fetch notifications" },
          { status: 500 }
        );
      }

      return NextResponse.json(
        { ...paginatedResponse(data || [], count ?? 0, params), unreadCount },
        { headers: HEADERS }
      );
    } catch (err: any) {
      return NextResponse.json(
        { error: err.message || "Failed to fetch notifications" },
        { status: 500 }
      );
    }
  }

  const limit = Math.min(
    parseInt(searchParams.get("limit") || "50", 10) || 50,
    200
  );

  try {
    const [notifications, unreadCount] = await Promise.all([
      listNotifications(auth.user.id, limit),
      getLegacyUnreadCount(auth.user.id),
    ]);

    return NextResponse.json(
      { notifications, unreadCount },
      { headers: HEADERS }
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to fetch notifications" },
      { status: 500 }
    );
  }
}
