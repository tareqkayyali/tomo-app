import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { generateCVNarratives } from "@/services/cv/cvAIGeneration";

/**
 * POST /api/v1/cv/regenerate-statement
 * Body: { cv_type?: 'club' | 'university' | 'both', force?: boolean }
 *
 * Triggers AI regeneration of personal statements and narratives.
 * Respects change detection unless force=true.
 */
export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  try {
    const body = await req.json().catch(() => ({}));
    const cvType = body.cv_type ?? "both";
    const force = body.force ?? false;

    const results = await generateCVNarratives(auth.user.id, { cvType, force });

    return NextResponse.json({
      ok: true,
      generated: results,
      message: Object.values(results).some(Boolean)
        ? "Narratives generated successfully"
        : "No regeneration needed — data hasn't changed significantly",
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to regenerate statements", detail: String(err) },
      { status: 500 }
    );
  }
}
