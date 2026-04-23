import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { approveAISummary } from "@/services/cv/cvAIGeneration";

/**
 * POST /api/v1/cv/ai-summary/approve
 *
 * Approve the current head AI summary. Flips ai_summary_status to 'approved'
 * on cv_profiles and marks the latest version in cv_ai_summary_versions as
 * approved. Required before the summary is shown on the public share page.
 */
export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  try {
    await approveAISummary(auth.user.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to approve AI summary", detail: String(err) },
      { status: 500 }
    );
  }
}
