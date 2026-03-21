import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getCompetitions } from "@/services/cv/cvService";

export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  const athleteId = req.nextUrl.searchParams.get("athleteId") || auth.user.id;
  try {
    const competitions = await getCompetitions(athleteId);
    return NextResponse.json(competitions);
  } catch (err) {
    return NextResponse.json({ error: "Failed to fetch competitions", detail: String(err) }, { status: 500 });
  }
}
