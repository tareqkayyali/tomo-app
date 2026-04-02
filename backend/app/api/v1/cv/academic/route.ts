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
      .from("cv_academic_entries")
      .select("*")
      .eq("athlete_id", athleteId)
      .order("year_start", { ascending: false });
    if (error) throw error;
    return NextResponse.json(data ?? []);
  } catch (err) {
    return NextResponse.json({ error: "Failed to fetch academic entries", detail: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  const body = await req.json();
  try {
    const { data, error } = await (db() as any)
      .from("cv_academic_entries")
      .insert({
        athlete_id: auth.user.id,
        institution: body.institution,
        country: body.country ?? null,
        qualification: body.qualification ?? null,
        year_start: body.year_start ?? null,
        year_end: body.year_end ?? null,
        gpa: body.gpa ?? null,
        gpa_scale: body.gpa_scale ?? "4.0",
        predicted_grade: body.predicted_grade ?? null,
        honours: body.honours ?? [],
        ncaa_eligibility_id: body.ncaa_eligibility_id ?? null,
        is_current: body.is_current ?? false,
      })
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: "Failed to create academic entry", detail: String(err) }, { status: 500 });
  }
}
