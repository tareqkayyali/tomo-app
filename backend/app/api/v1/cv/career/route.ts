import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

const db = () => supabaseAdmin();

export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  const athleteId = req.nextUrl.searchParams.get("athleteId") || auth.user.id;
  try {
    const { data, error } = await (db() as any)
      .from("cv_career_entries")
      .select("*")
      .eq("athlete_id", athleteId)
      .order("display_order");
    if (error) throw error;
    return NextResponse.json(data ?? []);
  } catch (err) {
    return NextResponse.json({ error: "Failed to fetch career entries", detail: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  const body = await req.json();
  try {
    const { data, error } = await (db() as any)
      .from("cv_career_entries")
      .insert({
        athlete_id: auth.user.id,
        entry_type: body.entry_type ?? "club",
        club_name: body.club_name,
        league_level: body.league_level ?? null,
        country: body.country ?? null,
        position: body.position ?? null,
        started_month: body.started_month ?? null,
        ended_month: body.ended_month ?? null,
        is_current: body.is_current ?? false,
        appearances: body.appearances ?? null,
        goals: body.goals ?? null,
        assists: body.assists ?? null,
        clean_sheets: body.clean_sheets ?? null,
        achievements: body.achievements ?? [],
        injury_note: body.injury_note ?? null,
        display_order: body.display_order ?? 0,
      })
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: "Failed to create career entry", detail: String(err) }, { status: 500 });
  }
}
