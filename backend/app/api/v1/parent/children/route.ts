import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireRole, getLinkedPlayers } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  const roleCheck = await requireRole(auth.user.id, ["parent"]);
  if ("error" in roleCheck) return roleCheck.error;

  try {
    const children = await getLinkedPlayers(auth.user.id, "PARENT");

    return NextResponse.json(
      { children },
      { headers: { "api-version": "v1" } }
    );
  } catch (err) {
    console.error('[GET /api/v1/parent/children] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
