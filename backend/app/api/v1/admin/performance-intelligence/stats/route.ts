import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/apiAuth";
import { getFlowOverviewStats } from "@/services/admin/performanceIntelligenceService";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  try {
    const stats = await getFlowOverviewStats();
    return NextResponse.json(stats);
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to load stats", detail: String(err) },
      { status: 500 }
    );
  }
}
