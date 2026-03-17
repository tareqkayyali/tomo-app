/**
 * POST /api/v1/coach/programmes/[id]/publish — Publish programme.
 * Creates calendar events for all target players and sends notifications.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireRole } from "@/lib/auth";
import { publishProgramme } from "@/services/coachProgrammeService";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  const roleCheck = await requireRole(auth.user.id, ["coach"]);
  if ("error" in roleCheck) return roleCheck.error;

  const { id } = await params;

  try {
    const result = await publishProgramme(id, auth.user.id);
    return NextResponse.json(
      {
        ...result,
        message: `Programme published. ${result.eventsCreated} events created, ${result.notificationsSent} players notified.`,
      },
      { headers: { "api-version": "v1" } }
    );
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
