import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import {
  listNotifications,
  getUnreadCount,
} from "@/services/notificationService";
import { parsePagination, paginatedResponse, hasPaginationParams } from "@/lib/pagination";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * GET /api/v1/notifications
 * List notifications for the authenticated user.
 * Query params: ?limit=50
 * Opt-in pagination: ?page=1&limit=20 returns paginated response format.
 */
export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  const paginate = hasPaginationParams(req);

  if (paginate) {
    // Paginated path — query Supabase directly with range + count
    const params = parsePagination(req, 50, 200);
    try {
      const db = supabaseAdmin() as any;
      const [{ data, error, count }, unreadCount] = await Promise.all([
        db
          .from("notifications")
          .select("*", { count: "exact" })
          .eq("user_id", auth.user.id)
          .order("created_at", { ascending: false })
          .range(params.offset, params.offset + params.limit - 1),
        getUnreadCount(auth.user.id),
      ]);

      if (error) {
        return NextResponse.json(
          { error: error.message || "Failed to fetch notifications" },
          { status: 500 }
        );
      }

      return NextResponse.json(
        { ...paginatedResponse(data || [], count ?? 0, params), unreadCount },
        { headers: { "api-version": "v1" } }
      );
    } catch (err: any) {
      return NextResponse.json(
        { error: err.message || "Failed to fetch notifications" },
        { status: 500 }
      );
    }
  }

  // Non-paginated path — existing behavior
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
