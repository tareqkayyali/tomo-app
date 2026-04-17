import { NextRequest, NextResponse } from "next/server";
import { requireEnterprise } from "@/lib/admin/enterpriseAuth";
import { listShadowRuns } from "@/services/admin/chatQualityAdminService";

/**
 * GET /api/v1/admin/enterprise/quality/shadow-runs?limit=50
 */
export async function GET(req: NextRequest) {
  const auth = await requireEnterprise(req, "institutional_pd");
  if ("error" in auth) return auth.error;

  const limit = parseInt(req.nextUrl.searchParams.get("limit") ?? "50", 10);
  try {
    const rows = await listShadowRuns(limit);
    return NextResponse.json({ rows, total: rows.length });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load shadow runs" },
      { status: 500 }
    );
  }
}
