import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { listSummaryVersions } from "@/services/cv/cvService";

/**
 * GET /api/v1/cv/ai-summary/versions
 *
 * Returns the full generation log for the athlete's AI summary. Drives the
 * "3 versions with approval dot" component on the Player Profile screen.
 */
export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  try {
    const versions = await listSummaryVersions(auth.user.id);
    return NextResponse.json(versions);
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to fetch AI summary versions", detail: String(err) },
      { status: 500 }
    );
  }
}
