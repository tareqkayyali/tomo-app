import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * GET /api/v1/content/training-categories
 * Public (no auth) — returns all enabled training category templates.
 */
export async function GET(_req: NextRequest) {
  try {
    const db = supabaseAdmin();
    const { data, error } = await (db as any)
      .from("training_category_templates")
      .select("*")
      .eq("is_enabled", true)
      .order("sort_order", { ascending: true });

    if (error) {
      return NextResponse.json(
        { error: "Failed to fetch categories", detail: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ categories: data ?? [] }, {
      headers: {
        "Cache-Control": "public, max-age=300, s-maxage=3600",
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to fetch categories", detail: String(err) },
      { status: 500 }
    );
  }
}
