import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getPointsSummary } from "@/services/complianceService";

export async function GET(req: NextRequest) {
  try {
    const auth = requireAuth(req);
    if ("error" in auth) return auth.error;

    const url = new URL(req.url);
    const limit = parseInt(url.searchParams.get("limit") || "14", 10);

    const summary = await getPointsSummary(auth.user.id, Math.min(limit, 50));

    return NextResponse.json(summary, { headers: { "api-version": "v1", "Cache-Control": "private, max-age=60" } });
  } catch (err: any) {
    console.error('[points] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
