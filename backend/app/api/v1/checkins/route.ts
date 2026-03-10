import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  const { searchParams } = req.nextUrl;
  const limit = Math.min(
    Math.max(parseInt(searchParams.get("limit") || "30", 10), 1),
    90
  );

  const db = supabaseAdmin();
  const { data: checkins, error } = await db
    .from("checkins")
    .select("*")
    .eq("user_id", auth.user.id)
    .order("date", { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(
    { count: checkins?.length || 0, checkins: checkins || [] },
    { headers: { "api-version": "v1" } }
  );
}
