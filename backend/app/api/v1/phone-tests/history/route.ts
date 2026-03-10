import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  const { searchParams } = req.nextUrl;
  const limit = Math.min(parseInt(searchParams.get("limit") || "20", 10), 50);
  const testId = searchParams.get("testId");

  const db = supabaseAdmin();
  let query = db
    .from("phone_test_sessions")
    .select("*")
    .eq("user_id", auth.user.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (testId) {
    query = query.eq("test_type", testId);
  }

  const { data: sessions, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(
    { sessions: sessions || [], count: sessions?.length || 0 },
    { headers: { "api-version": "v1" } }
  );
}
