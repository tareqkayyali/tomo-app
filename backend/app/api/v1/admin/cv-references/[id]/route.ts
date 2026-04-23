import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/apiAuth";
import { verifyAndPublishReference, rejectReference } from "@/services/cv/cvService";

/**
 * POST /api/v1/admin/cv-references/[id]
 *
 * Admin action endpoint for the identity-verification queue.
 * Body: { action: "verify" } | { action: "reject", reason: string }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  try {
    if (body.action === "verify") {
      await verifyAndPublishReference(id, auth.user.id);
      return NextResponse.json({ ok: true, status: "published" });
    }
    if (body.action === "reject") {
      if (!body.reason || typeof body.reason !== "string") {
        return NextResponse.json(
          { error: "rejection reason is required" },
          { status: 400 }
        );
      }
      await rejectReference(id, auth.user.id, body.reason);
      return NextResponse.json({ ok: true, status: "rejected" });
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to process action", detail: String(err) },
      { status: 500 }
    );
  }
}
