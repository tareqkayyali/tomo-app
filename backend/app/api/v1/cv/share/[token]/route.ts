import { NextRequest, NextResponse } from "next/server";
import { resolveShareToken, recordShareView } from "@/services/cv/cvExport";
import { assembleCVBundle } from "@/services/cv/cvAssembler";
import { buildCVHTML } from "@/services/cv/cvExport";

/**
 * GET /api/v1/cv/share/[token]
 *
 * Public endpoint — no auth required. Renders the shared CV as HTML.
 * Scouts/recruiters open this link to view the player's CV.
 *
 * Query params:
 *   ?format=json — returns JSON instead of HTML (for API consumers)
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  // Resolve token to athlete + CV type
  const resolved = await resolveShareToken(token);
  if (!resolved) {
    return new NextResponse(
      "<html><body style='font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh'>" +
      "<div style='text-align:center'><h2>CV not found</h2><p>This link may have been revoked or is invalid.</p></div>" +
      "</body></html>",
      { status: 404, headers: { "Content-Type": "text/html" } }
    );
  }

  // Record the view (fire-and-forget)
  const ip = req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? undefined;
  const ua = req.headers.get("user-agent") ?? undefined;
  recordShareView(resolved.athleteId, resolved.cvType, token, ip, ua).catch(() => {});

  // Check if JSON format requested
  const format = req.nextUrl.searchParams.get("format");
  if (format === "json") {
    const cv = await assembleCVBundle(resolved.athleteId);
    // Strip sensitive fields for public view
    const publicCV = {
      identity: {
        ...cv.identity,
        email: undefined,
        phone: undefined,
        guardian_name: undefined,
        guardian_email: undefined,
        guardian_phone: undefined,
      },
      physical: cv.physical,
      positions: cv.positions,
      statements: cv.statements,
      trajectory: cv.trajectory,
      performance: {
        ...cv.performance,
        benchmark_profile: undefined, // Too detailed for public
      },
      career: cv.career,
      academic: cv.academic,
      media: cv.media,
      references: cv.references.filter(r => r.consent_given).map(r => ({
        ...r,
        email: undefined,
        phone: undefined,
      })),
      character_traits: cv.character_traits,
      injury_status: cv.injury_status,
      completeness: cv.completeness,
      cv_type: resolved.cvType,
    };
    return NextResponse.json(publicCV);
  }

  // Default: render HTML
  const cv = await assembleCVBundle(resolved.athleteId);
  const html = buildCVHTML(cv, resolved.cvType);
  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
