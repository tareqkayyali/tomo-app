import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getStreakInfo } from "@/services/complianceService";

export async function GET(req: NextRequest) {
  try {
    const auth = requireAuth(req);
    if ("error" in auth) return auth.error;

    const info = await getStreakInfo(auth.user.id);

    return NextResponse.json(info, { headers: { "api-version": "v1", "Cache-Control": "private, max-age=60" } });
  } catch (err: any) {
    console.error('[streak] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
