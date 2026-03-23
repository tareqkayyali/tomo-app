import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getPositionNorms } from "@/services/benchmarkService";

export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  try {
    const { searchParams } = new URL(req.url);
    const position = searchParams.get("position") ?? "ALL";
    const ageBand = searchParams.get("ageBand") ?? "SEN";
    const gender = searchParams.get("gender") ?? "male";
    const level = searchParams.get("level") ?? "elite";
    const sportId = searchParams.get("sportId") ?? "football";

    const norms = await getPositionNorms(sportId, position, ageBand, gender, level);
    return NextResponse.json(
      { position, ageBand, gender, level, norms },
      { headers: { "api-version": "v1" } }
    );
  } catch (err) {
    console.error('[GET /api/v1/benchmarks/norms] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
