/**
 * GET /api/v1/training/drills — List/filter drills from the catalog.
 * Public endpoint (no auth required).
 */

import { NextRequest, NextResponse } from "next/server";
import { listDrills } from "@/services/drillRecommendationService";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const sport = searchParams.get("sport");

  if (!sport) {
    return NextResponse.json(
      { error: "sport query parameter is required" },
      { status: 400 }
    );
  }

  try {
    const drills = await listDrills(sport, {
      category: searchParams.get("category") ?? undefined,
      intensity: searchParams.get("intensity") ?? undefined,
      ageBand: searchParams.get("ageBand") ?? undefined,
      limit: searchParams.get("limit")
        ? parseInt(searchParams.get("limit")!)
        : undefined,
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
