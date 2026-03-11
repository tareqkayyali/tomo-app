import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

const CONTENT_TABLES = [
  "sports",
  "sport_attributes",
  "sport_skills",
  "sport_positions",
  "sport_rating_levels",
  "sport_test_definitions",
  "sport_normative_data",
  "content_items",
] as const;

/**
 * GET /api/v1/content/manifest
 * Returns per-table latest updated_at timestamps for cache invalidation.
 * Public — no auth required.
 */
export async function GET(_req: NextRequest) {
  const db = supabaseAdmin();

  const results = await Promise.all(
    CONTENT_TABLES.map(async (table) => {
      const { data, error } = await db
        .from(table)
        .select("updated_at")
        .order("updated_at", { ascending: false })
        .limit(1)
        .single();
      return [table, error ? null : data.updated_at] as const;
    })
  );

  const manifest = Object.fromEntries(results);

  return NextResponse.json(manifest, {
    headers: {
      "Cache-Control": "public, max-age=300, s-maxage=3600",
      "api-version": "v1",
    },
  });
}
