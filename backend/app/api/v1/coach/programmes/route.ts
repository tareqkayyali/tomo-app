/**
 * GET  /api/v1/coach/programmes — List coach's programmes
 * POST /api/v1/coach/programmes — Create a new programme
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireRole } from "@/lib/auth";
import {
  createProgramme,
  listCoachProgrammes,
} from "@/services/coachProgrammeService";
import { createNotification } from "@/services/notificationService";

export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  const roleCheck = await requireRole(auth.user.id, ["coach"]);
  if ("error" in roleCheck) return roleCheck.error;

  try {
    const programmes = await listCoachProgrammes(auth.user.id);
    return NextResponse.json(
      { programmes },
      { headers: { "api-version": "v1" } }
    );
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  const roleCheck = await requireRole(auth.user.id, ["coach"]);
  if ("error" in roleCheck) return roleCheck.error;

  const body = await req.json();
  if (!body.name || !body.startDate || !body.weeks) {
    return NextResponse.json(
      { error: "name, startDate, weeks required" },
      { status: 400 }
    );
  }

  try {
    const programme = await createProgramme(auth.user.id, {
      name: body.name,
      description: body.description,
      seasonCycle: body.seasonCycle ?? "in_season",
      startDate: body.startDate,
      weeks: parseInt(body.weeks),
      targetType: body.targetType ?? "all",
      targetPositions: body.targetPositions ?? [],
      targetPlayerIds: body.targetPlayerIds ?? [],
    });

    // Notify target players
    const playerIds: string[] = body.targetPlayerIds ?? [];
    for (const pid of playerIds) {
      await createNotification({
        userId: pid,
        type: "suggestion_received",
        title: "New training program assigned",
        body: `Your coach assigned "${body.name}" — a ${body.weeks}-week ${body.category || 'training'} program`,
        data: { programmeId: programme.id, coachId: auth.user.id },
      }).catch(() => {}); // non-fatal
    }

    return NextResponse.json(
      { programme },
      { headers: { "api-version": "v1" } }
    );
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
