/**
 * GET /api/v1/training/drills/search — Text search on drills.
 * Public endpoint (no auth required).
 */

import { NextRequest, NextResponse } from "next/server";
import { searchDrills } from "@/services/drillRecommendationService";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const q = searchParams.get("q");
  const sport = searchParams.get("sport");

  if (!q || !sport) {
    return NextResponse.json(
      { error: "q and sport query parameters are required" },
      { status: 400 }
    );
  }

  try {
    const drills = await searchDrills(q, sport, {
      category: searchParams.get("category") ?? undefined,
      intensity: searchParams.get("intensity") ?? undefined,
      attributeKey: searchParams.get("attribute") ?? undefined,
    });

    return NextResponse.json(
      { drills, total: drills.length },
      {
        headers: {
          "api-version": "v1",
          "Cache-Control": "public, max-age=300, s-maxage=3600",
        },
      }
    );
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
