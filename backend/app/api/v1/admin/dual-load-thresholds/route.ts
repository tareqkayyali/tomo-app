import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/apiAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Admin Dual Load Thresholds API — Read-only from supabaseAdmin
 *
 * GET /api/v1/admin/dual-load-thresholds — List all thresholds
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  try {
    const db = supabaseAdmin();
    const { data, error } = await (db as any)
      .from("dual_load_thresholds")
      .select("*")
      .order("dli_min", { ascending: true });

    if (error) {
      return NextResponse.json(
        { error: "Failed to list dual load thresholds", detail: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ thresholds: data ?? [] });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to list dual load thresholds", detail: String(err) },
      { status: 500 }
    );
  }
}
