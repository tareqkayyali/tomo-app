import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * GET /api/v1/content/modes
 * Public (no auth) — returns all enabled athlete modes for mobile mode selector.
 */
export async function GET(_req: NextRequest) {
  try {
    const db = supabaseAdmin();
    const { data, error } = await (db as any)
      .from("athlete_modes")
      .select("id, label, description, icon, color, params, sport_filter, sort_order")
      .eq("is_enabled", true)
      .order("sort_order", { ascending: true });

    if (error) {
      return NextResponse.json(
        { error: "Failed to fetch modes", detail: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ modes: data ?? [] }, {
      headers: {
        "Cache-Control": "public, max-age=300, s-maxage=3600",
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to fetch modes", detail: String(err) },
      { status: 500 }
    );
  }
}
