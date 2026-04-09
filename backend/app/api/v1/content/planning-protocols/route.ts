import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * GET /api/v1/content/planning-protocols
 * Public (no auth) — returns all enabled planning protocols.
 */
export async function GET(_req: NextRequest) {
  try {
    const db = supabaseAdmin();
    const { data, error } = await (db as any)
      .from("planning_protocols")
      .select("*")
      .eq("is_enabled", true)
      .order("severity", { ascending: true })
      .order("name", { ascending: true });

    if (error) {
      return NextResponse.json(
        { error: "Failed to fetch planning protocols", detail: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ protocols: data ?? [] }, {
      headers: {
        "Cache-Control": "public, max-age=300, s-maxage=3600",
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to fetch planning protocols", detail: String(err) },
      { status: 500 }
    );
  }
}
