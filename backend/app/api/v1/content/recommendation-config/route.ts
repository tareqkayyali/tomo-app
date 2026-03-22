import { NextRequest, NextResponse } from "next/server";
import {
  getRecommendationConfig,
  clearRecommendationConfigCache,
} from "@/services/recommendations/recommendationConfig";

export async function GET(req: NextRequest) {
  // Allow CMS to clear cache after save
  if (req.nextUrl.searchParams.get("clearCache") === "true") {
    clearRecommendationConfigCache();
  }

  const config = await getRecommendationConfig();
  return NextResponse.json(config);
}
