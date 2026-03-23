/**
 * GET /api/v1/programs — List/filter training programs from hardcoded catalog
 *
 * Query params:
 *   category — filter by category (sprint, strength, etc.)
 *   type — filter by type (physical, technical)
 *   position — filter by position emphasis
 *   q — search name/description/tags
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { FOOTBALL_PROGRAMS } from "@/services/programs/footballPrograms";

export async function GET(req: NextRequest) {
  try {
    const auth = requireAuth(req);
    if ("error" in auth) return auth.error;

    const url = new URL(req.url);
    const category = url.searchParams.get("category");
    const type = url.searchParams.get("type");
    const position = url.searchParams.get("position");
    const q = url.searchParams.get("q")?.toLowerCase();

    let results = [...FOOTBALL_PROGRAMS];

    if (category) {
      results = results.filter((p) => p.category === category);
    }
    if (type) {
      results = results.filter((p) => p.type === type);
    }
    if (position) {
      results = results.filter(
        (p) => p.position_emphasis.includes("ALL") || p.position_emphasis.includes(position)
      );
    }
    if (q) {
      results = results.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q) ||
          p.tags.some((t) => t.toLowerCase().includes(q)) ||
          p.category.toLowerCase().includes(q)
      );
    }

    const programs = results.map((p) => ({
      id: p.id,
      name: p.name,
      category: p.category,
      type: p.type,
      description: p.description,
      equipment: p.equipment,
      duration_minutes: p.duration_minutes,
      duration_weeks: p.duration_weeks,
      position_emphasis: p.position_emphasis,
      difficulty: p.difficulty,
      tags: p.tags,
    }));

    return NextResponse.json({ programs });
  } catch (err: any) {
    console.error("[programs] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
