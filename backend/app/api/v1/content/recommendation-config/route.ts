import { NextRequest, NextResponse } from "next/server";
import {
  getRecommendationConfig,
  clearRecommendationConfigCache,
} from "@/services/recommendations/recommendationConfig";

export async function GET(req: NextRequest) {
  try {
    // Allow CMS to clear cache after save
    if (req.nextUrl.searchParams.get("clearCache") === "true") {
      clearRecommendationConfigCache();
    }

    const config = await getRecommendationConfig();
    return NextResponse.json(config);
  } catch (err) {
    console.error('[GET /api/v1/content/recommendation-config] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
