import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getRecommendedDrills } from "@/services/drillRecommendationService";
import { buildPlayerContext } from "@/services/agents/contextBuilder";

export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  const context = await buildPlayerContext(auth.user.id, "output");
  const recs = await getRecommendedDrills(context, { limit: 8 });

  // Also query ALL pace drills directly to see what exists
  const { data: allPaceDrills } = await (await import("@/lib/supabase/admin")).supabaseAdmin()
    .from("training_drills")
    .select("name, sport_id, intensity, active, primary_attribute, sort_order")
    .eq("primary_attribute", "pace")
    .eq("active", true)
    .order("sort_order");

  return NextResponse.json({
    contextSport: context.sport,
    allPaceDrillsInDb: allPaceDrills,
    gapAttributes: context.benchmarkProfile?.gapAttributes ?? [],
    gaps: context.benchmarkProfile?.gaps ?? [],
    strengthAttributes: context.benchmarkProfile?.strengthAttributes ?? [],
    readiness: context.readinessScore,
    drillsReturned: recs.map(r => ({
      name: r.drill.name,
      score: r.score,
      reason: r.reason,
      primary: (r.drill as any).primary_attribute,
      category: r.drill.category,
      intensity: r.drill.intensity,
    })),
  });
}
