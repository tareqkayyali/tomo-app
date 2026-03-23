import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * GET /api/v1/content/bundle
 * Returns ALL content in a single response (~200KB).
 * Public — no auth required.
 */
export async function GET(_req: NextRequest) {
  try {
    const db = supabaseAdmin();

    const [
      sportsRes,
      attributesRes,
      skillsRes,
      positionsRes,
      ratingLevelsRes,
      testDefsRes,
      normativeRes,
      contentItemsRes,
    ] = await Promise.all([
      db.from("sports").select("*").order("sort_order"),
      db.from("sport_attributes").select("*").order("sort_order"),
      db.from("sport_skills").select("*").order("sort_order"),
      db.from("sport_positions").select("*").order("sort_order"),
      db.from("sport_rating_levels").select("*").order("sort_order"),
      db.from("sport_test_definitions").select("*").order("sort_order"),
      db.from("sport_normative_data").select("*").order("metric_name"),
      db.from("content_items").select("*").eq("active", true).order("sort_order"),
    ]);

    // Check for errors
    const firstError = [
      sportsRes, attributesRes, skillsRes, positionsRes,
      ratingLevelsRes, testDefsRes, normativeRes, contentItemsRes,
    ].find((r) => r.error);

    if (firstError?.error) {
      return NextResponse.json(
        { error: firstError.error.message },
        { status: 500 }
      );
    }

    const bundle = {
      sports: sportsRes.data || [],
      sport_attributes: attributesRes.data || [],
      sport_skills: skillsRes.data || [],
      sport_positions: positionsRes.data || [],
      sport_rating_levels: ratingLevelsRes.data || [],
      sport_test_definitions: testDefsRes.data || [],
      sport_normative_data: normativeRes.data || [],
      content_items: contentItemsRes.data || [],
      fetched_at: new Date().toISOString(),
    };

    return NextResponse.json(bundle, {
      headers: {
        "Cache-Control": "public, max-age=300, s-maxage=3600",
        "api-version": "v1",
      },
    });
  } catch (err) {
    console.error('[GET /api/v1/content/bundle] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
