import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { generateAISummary } from "@/services/cv/cvAIGeneration";

/**
 * POST /api/v1/cv/ai-summary/regenerate
 *
 * Generate (or regenerate) the athlete's player profile AI summary.
 * Writes a new version row to cv_ai_summary_versions and updates the head
 * pointer on cv_profiles. Status resets to 'draft' (or 'needs_update' if a
 * prior version was already approved).
 *
 * Body: { force?: boolean } — skip change detection and always regenerate.
 */
export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  try {
    const body = await req.json().catch(() => ({}));
    const result = await generateAISummary(auth.user.id, !!body.force);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to regenerate AI summary", detail: String(err) },
      { status: 500 }
    );
  }
}
