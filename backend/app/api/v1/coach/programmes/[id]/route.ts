/**
 * GET    /api/v1/coach/programmes/[id] — Get programme with drills
 * POST   /api/v1/coach/programmes/[id] — Add drill to programme
 * PATCH  /api/v1/coach/programmes/[id] — Update a programme drill
 * DELETE /api/v1/coach/programmes/[id] — Delete a programme drill
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireRole } from "@/lib/auth";
import {
  getProgrammeWithDrills,
  addDrillToProgramme,
  updateProgrammeDrill,
  deleteProgrammeDrill,
} from "@/services/coachProgrammeService";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  const roleCheck = await requireRole(auth.user.id, ["coach"]);
  if ("error" in roleCheck) return roleCheck.error;

  const { id } = await params;

  try {
    const programme = await getProgrammeWithDrills(id, auth.user.id);
    return NextResponse.json(
      { programme },
      { headers: { "api-version": "v1" } }
    );
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  const roleCheck = await requireRole(auth.user.id, ["coach"]);
  if ("error" in roleCheck) return roleCheck.error;

  const { id } = await params;
  const body = await req.json();

  try {
    const drills = await addDrillToProgramme(id, auth.user.id, {
      drillId: body.drillId,
      weekNumber: body.weekNumber,
      dayOfWeek: body.dayOfWeek,
      sets: body.sets ?? 3,
      reps: body.reps ?? "8",
      intensity: body.intensity ?? "",
      restSeconds: body.restSeconds ?? 90,
      rpeTarget: body.rpeTarget ?? 7,
      durationMin: body.durationMin,
      tempoNote: body.tempoNote,
      coachNotes: body.coachNotes,
      repeatWeeks: body.repeatWeeks ?? 1,
      progression: body.progression ?? "none",
      isMandatory: body.isMandatory ?? false,
      orderInDay: body.orderInDay ?? 0,
      targetOverride: body.targetOverride,
      targetPosition: body.targetPosition,
      targetPlayerIds: body.targetPlayerIds ?? [],
    });
    return NextResponse.json(
      { drills },
      { headers: { "api-version": "v1" } }
    );
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  const roleCheck = await requireRole(auth.user.id, ["coach"]);
  if ("error" in roleCheck) return roleCheck.error;

  await params; // consume params (programme id context)
  const { drillRecordId, ...updates } = await req.json();

  if (!drillRecordId) {
    return NextResponse.json(
      { error: "drillRecordId required" },
      { status: 400 }
    );
  }

  try {
    await updateProgrammeDrill(drillRecordId, auth.user.id, updates);
    return NextResponse.json(
      { updated: true },
      { headers: { "api-version": "v1" } }
    );
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  const roleCheck = await requireRole(auth.user.id, ["coach"]);
  if ("error" in roleCheck) return roleCheck.error;

  await params;
  const { searchParams } = req.nextUrl;
  const drillRecordId = searchParams.get("drillRecordId");

  if (!drillRecordId) {
    return NextResponse.json(
      { error: "drillRecordId required" },
      { status: 400 }
    );
  }

  try {
    await deleteProgrammeDrill(drillRecordId, auth.user.id);
    return NextResponse.json(
      { deleted: true },
      { headers: { "api-version": "v1" } }
    );
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
