import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requestReference } from "@/services/cv/cvService";

export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  const athleteId = req.nextUrl.searchParams.get("athleteId") || auth.user.id;
  try {
    const { data, error } = await (supabaseAdmin() as any)
      .from("cv_references")
      .select("*")
      .eq("athlete_id", athleteId)
      .neq("status", "rejected")
      .order("display_order");
    if (error) throw error;
    return NextResponse.json(data ?? []);
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to fetch references", detail: String(err) },
      { status: 500 }
    );
  }
}

/**
 * POST /api/v1/cv/reference
 *
 * Athlete-initiated reference request. Creates a row in 'requested' state
 * with a unique request_token. Phase 5 will wire the outbound email that
 * delivers the token to the referee.
 *
 * Body:
 *   referee_name:     string (required)
 *   referee_role:     string (required)
 *   club_institution: string (required)
 *   email:            string (required — referee's email)
 *   phone:            string | null
 *   relationship:     'current_coach' | 'former_coach' | 'academy_director' | 'teacher' | 'other'
 */
export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  try {
    const body = await req.json();

    if (!body.referee_name || !body.referee_role || !body.club_institution || !body.email) {
      return NextResponse.json(
        { error: "referee_name, referee_role, club_institution, and email are required" },
        { status: 400 }
      );
    }

    const { row, token } = await requestReference({
      athlete_id: auth.user.id,
      referee_name: body.referee_name,
      referee_role: body.referee_role,
      club_institution: body.club_institution,
      email: body.email,
      phone: body.phone ?? null,
      relationship: body.relationship ?? null,
    });

    // Phase 5 hooks the outbound email here. For now, return the token so
    // the mobile client can surface a copy-link fallback.
    const base = process.env.NEXT_PUBLIC_APP_ORIGIN ?? "https://app.my-tomo.com";
    const referee_link = `${base}/ref/${token}`;

    return NextResponse.json({ ok: true, reference: row, referee_link }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to request reference", detail: String(err) },
      { status: 500 }
    );
  }
}
