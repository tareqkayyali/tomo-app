import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { listClubs, createClub } from "@/services/cv/cvService";

export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  const athleteId = req.nextUrl.searchParams.get("athleteId") || auth.user.id;
  try {
    const clubs = await listClubs(athleteId);
    return NextResponse.json(clubs);
  } catch (err) {
    return NextResponse.json({ error: "Failed to fetch clubs", detail: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  const body = await req.json();
  try {
    const club = await createClub({ ...body, athlete_id: auth.user.id });
    return NextResponse.json(club, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: "Failed to create club", detail: String(err) }, { status: 500 });
  }
}
