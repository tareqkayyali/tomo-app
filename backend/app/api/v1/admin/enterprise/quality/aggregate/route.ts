import { NextRequest, NextResponse } from "next/server";
import { requireEnterprise } from "@/lib/admin/enterpriseAuth";
import { getQualityAggregates } from "@/services/admin/chatQualityAdminService";

/**
 * GET /api/v1/admin/enterprise/quality/aggregate?days=7
 *
 * Daily rollups from v_quality_scores_aggregated — mean scores + turn
 * counts + total cost by (day, sport, age_band, agent, stratum).
 */
export async function GET(req: NextRequest) {
  const auth = await requireEnterprise(req, "institutional_pd");
  if ("error" in auth) return auth.error;

  const days = Math.min(
    Math.max(parseInt(req.nextUrl.searchParams.get("days") ?? "7", 10), 1),
    90
  );

  try {
    const rows = await getQualityAggregates(days);
    return NextResponse.json({ rows });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load aggregates" },
      { status: 500 }
    );
  }
}
