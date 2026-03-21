import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/apiAuth";
import { getDashboardStats } from "@/services/admin/dashboardService";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  try {
    const stats = await getDashboardStats();
    return NextResponse.json(stats);
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to fetch dashboard stats", detail: String(err) },
      { status: 500 }
    );
  }
}
