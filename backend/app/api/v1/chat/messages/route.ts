import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  const { searchParams } = req.nextUrl;
  const limit = Math.min(parseInt(searchParams.get("limit") || "20", 10), 100);

  const db = supabaseAdmin();
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
}
