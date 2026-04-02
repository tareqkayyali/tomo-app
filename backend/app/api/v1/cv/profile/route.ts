import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { assembleCVBundle } from "@/services/cv/cvAssembler";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  const athleteId = req.nextUrl.searchParams.get("athleteId") || auth.user.id;

  try {
    const bundle = await assembleCVBundle(athleteId);
    return NextResponse.json(bundle);
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to fetch CV profile", detail: String(err) },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/v1/cv/profile — Update CV profile fields
 * (formation_preference, dominant_zone, visibility settings, approve statement)
 */
export async function PUT(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  try {
    const body = await req.json();
    const db = supabaseAdmin();

    const ALLOWED_FIELDS: Record<string, string> = {
      formation_preference: "formation_preference",
      dominant_zone: "dominant_zone",
      cv_club_discoverable: "cv_club_discoverable",
      cv_uni_discoverable: "cv_uni_discoverable",
      show_performance_data: "show_performance_data",
      show_coachability: "show_coachability",
      show_load_data: "show_load_data",
      statement_status: "statement_status",
      personal_statement_club: "personal_statement_club",
      personal_statement_uni: "personal_statement_uni",
    };

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const [key, col] of Object.entries(ALLOWED_FIELDS)) {
      if (body[key] !== undefined) updates[col] = body[key];
    }

    // Upsert — create cv_profiles row if it doesn't exist
    const { data, error } = await (db as any)
      .from("cv_profiles")
      .upsert({ athlete_id: auth.user.id, ...updates }, { onConflict: "athlete_id" })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ ok: true, cv_profile: data });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to update CV profile", detail: String(err) },
      { status: 500 }
    );
  }
}
