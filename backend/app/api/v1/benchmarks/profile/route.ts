import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getPlayerBenchmarkProfile } from "@/services/benchmarkService";

export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  const profile = await getPlayerBenchmarkProfile(auth.user.id);
  if (!profile) {
    return NextResponse.json(
      { error: "No benchmark data yet" },
      { status: 404 }
    );
  }

  return NextResponse.json(profile, { headers: { "api-version": "v1" } });
}
