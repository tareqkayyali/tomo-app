import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { publishCV, unpublishCV } from "@/services/cv/cvService";

/**
 * POST /api/v1/cv/publish
 *
 * Publish the athlete's CV. Generates a share_slug if none exists, sets
 * is_published=true, and returns the public URL. Idempotent.
 */
export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  try {
    const { slug, url } = await publishCV(auth.user.id);
    return NextResponse.json({ ok: true, slug, public_url: url });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to publish CV", detail: String(err) },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/v1/cv/publish
 *
 * Unpublish the athlete's CV. Slug is retained so a future republish
 * keeps the same URL (scouts who already have it can come back).
 */
export async function DELETE(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  try {
    await unpublishCV(auth.user.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to unpublish CV", detail: String(err) },
      { status: 500 }
    );
  }
}
