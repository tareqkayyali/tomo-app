import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { parsePagination, paginatedResponse, hasPaginationParams } from "@/lib/pagination";

export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  try {
    const db = supabaseAdmin();
    const paginate = hasPaginationParams(req);

    if (paginate) {
      // Paginated path
      const params = parsePagination(req, 20, 100);
      const { data: messages, error, count } = await db
        .from("chat_messages")
        .select("id, role, content, metadata, created_at", { count: "exact" })
        .eq("user_id", auth.user.id)
        .order("created_at", { ascending: false })
        .range(params.offset, params.offset + params.limit - 1);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      // Return in chronological order (oldest first) for display
      const sorted = (messages || []).reverse();

      return NextResponse.json(
        paginatedResponse(sorted, count ?? 0, params),
        { headers: { "api-version": "v1" } }
      );
    }

    // Non-paginated path — existing behavior
    const { searchParams } = req.nextUrl;
    const limit = Math.min(parseInt(searchParams.get("limit") || "20", 10), 100);

    const { data: messages, error } = await db
      .from("chat_messages")
      .select("id, role, content, metadata, created_at")
      .eq("user_id", auth.user.id)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Return in chronological order (oldest first) for display
    const sorted = (messages || []).reverse();

    return NextResponse.json(
      { messages: sorted, count: sorted.length },
      { headers: { "api-version": "v1" } }
    );
  } catch (err) {
    console.error('[GET /api/v1/chat/messages] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
