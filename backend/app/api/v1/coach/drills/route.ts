/**
 * GET /api/v1/coach/drills — Browse drill catalog for programme builder.
 * Requires coach role. Returns drills filtered by category/search.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireRole } from "@/lib/auth";
import { listDrills, searchDrills } from "@/services/drillRecommendationService";

export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  const roleCheck = await requireRole(auth.user.id, ["coach"]);
  if ("error" in roleCheck) return roleCheck.error;

  const { searchParams } = req.nextUrl;
  const q = searchParams.get("q");
  const sport = searchParams.get("sport") ?? "football";
  const category = searchParams.get("category") ?? undefined;
  const intensity = searchParams.get("intensity") ?? undefined;

  try {
    let drills;
    if (q) {
      drills = await searchDrills(q, sport, { category, intensity });
    } else {
      drills = await listDrills(sport, { category, intensity });
    }

    return NextResponse.json(
      { drills, total: drills.length },
      { headers: { "api-version": "v1" } }
    );
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
