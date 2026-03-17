import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireRole, getLinkedPlayers } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  const roleCheck = await requireRole(auth.user.id, ["coach"]);
  if ("error" in roleCheck) return roleCheck.error;

  try {
    const players = await getLinkedPlayers(auth.user.id, "COACH");

    return NextResponse.json(
      { players },
      { headers: { "api-version": "v1" } }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
