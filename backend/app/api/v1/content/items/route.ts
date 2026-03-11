import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * GET /api/v1/content/items?category=quotes&subcategory=high_energy&sport=padel
 * Returns filtered content_items.
 * Public — no auth required.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const category = searchParams.get("category");
  const subcategory = searchParams.get("subcategory");
  const sport = searchParams.get("sport");

  const db = supabaseAdmin();
  let query = db
    .from("content_items")
    .select("*")
    .eq("active", true)
    .order("sort_order");

  if (category) query = query.eq("category", category);
  if (subcategory) query = query.eq("subcategory", subcategory);
  if (sport) query = query.eq("sport_id", sport);

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(
    { count: data?.length || 0, items: data || [] },
    {
      headers: {
        "Cache-Control": "public, max-age=300, s-maxage=3600",
        "api-version": "v1",
      },
    }
  );
}
