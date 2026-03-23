import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  try {
    const { searchParams } = req.nextUrl;
    const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 100);
    const shotType = searchParams.get("shotType");

    const db = supabaseAdmin();
    let query = db
      .from("padel_shot_results")
      .select("*")
      .eq("user_id", auth.user.id)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (shotType) {
      query = query.eq("shot_type", shotType);
    }

    const { data: results, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(
      { results: results || [], count: results?.length || 0 },
      { headers: { "api-version": "v1" } }
    );
  } catch (err) {
    console.error('[GET /api/v1/padel-shots/history] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
