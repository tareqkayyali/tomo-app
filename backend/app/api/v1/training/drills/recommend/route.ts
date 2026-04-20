/**
 * GET /api/v1/training/drills/recommend — AI-recommended drills.
 * Requires auth — uses full PlayerContext for personalization.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { buildPlayerContext } from "@/services/agents/contextBuilder";
import { getRecommendedDrills } from "@/services/drillRecommendationService";

export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  const { searchParams } = req.nextUrl;

  try {
    const context = await buildPlayerContext(
      auth.user.id,
      searchParams.get("tab") ?? "Dashboard",
      undefined,
      searchParams.get("timezone") ?? undefined
    );

    const recommendations = await getRecommendedDrills(context, {
      category: searchParams.get("category") ?? undefined,
      limit: searchParams.get("limit")
        ? parseInt(searchParams.get("limit")!)
        : undefined,
      focus: searchParams.get("focus") ?? undefined,
    });

    return NextResponse.json(
      {
        recommendations,
        readiness: context.readinessScore ?? "Unknown",
      },
      { headers: { "api-version": "v1" } }
    );
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
