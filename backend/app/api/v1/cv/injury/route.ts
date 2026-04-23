import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createInjury } from "@/services/cv/cvService";

export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  const athleteId = req.nextUrl.searchParams.get("athleteId") || auth.user.id;
  try {
    const { data, error } = await (supabaseAdmin() as any)
      .from("cv_injury_log")
      .select("*")
      .eq("athlete_id", athleteId)
      .order("date_occurred", { ascending: false });
    if (error) throw error;
    return NextResponse.json(data ?? []);
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to fetch injury log", detail: String(err) },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  try {
    const body = await req.json();

    if (!body.body_part || !body.severity || !body.date_occurred) {
      return NextResponse.json(
        { error: "body_part, severity, and date_occurred are required" },
        { status: 400 }
      );
    }

    const row = await createInjury({
      athlete_id: auth.user.id,
      body_part: body.body_part,
      side: body.side ?? null,
      severity: body.severity,
      status: body.status,
      date_occurred: body.date_occurred,
      cleared_at: body.cleared_at ?? null,
      notes: body.notes ?? null,
    });

    return NextResponse.json(row, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to log injury", detail: String(err) },
      { status: 500 }
    );
  }
}
