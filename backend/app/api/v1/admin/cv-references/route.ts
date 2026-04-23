import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/apiAuth";
import { listPendingReferenceReviews } from "@/services/cv/cvService";

/**
 * GET /api/v1/admin/cv-references
 *
 * Identity-verification queue — all cv_references rows currently in
 * 'submitted' status, oldest first (FIFO). Powers the CMS review screen.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  try {
    const rows = await listPendingReferenceReviews(100);
    return NextResponse.json({ references: rows });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to list pending references", detail: String(err) },
      { status: 500 }
    );
  }
}
