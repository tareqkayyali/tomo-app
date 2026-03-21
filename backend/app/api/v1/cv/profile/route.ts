import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getCVBundle } from "@/services/cv/cvService";

export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  const athleteId = req.nextUrl.searchParams.get("athleteId") || auth.user.id;

  try {
    const bundle = await getCVBundle(athleteId);
    return NextResponse.json(bundle);
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to fetch CV profile", detail: String(err) },
      { status: 500 }
    );
  }
}
