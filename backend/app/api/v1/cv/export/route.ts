import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { generateCVHTML, getOrCreateShareToken } from "@/services/cv/cvExport";

/**
 * POST /api/v1/cv/export
 * Body: { cv_type: 'club' | 'university', format: 'pdf_html' | 'share_link' }
 *
 * For 'pdf_html': returns { html } — mobile renders via expo-print
 * For 'share_link': returns { url, token } — shareable public URL
 */
export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  try {
    const body = await req.json();
    const cvType: "club" | "university" = body.cv_type ?? "club";
    const format: string = body.format ?? "pdf_html";

    if (format === "share_link") {
      const token = await getOrCreateShareToken(auth.user.id, cvType);
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.my-tomo.com";
      return NextResponse.json({
        ok: true,
        token,
        url: `${baseUrl}/cv/${token}`,
      });
    }

    // Default: pdf_html
    const html = await generateCVHTML(auth.user.id, cvType);
    return NextResponse.json({ ok: true, html });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to export CV", detail: String(err) },
      { status: 500 }
    );
  }
}
