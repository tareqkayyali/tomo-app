import { NextRequest, NextResponse } from "next/server";
import { requireEnterprise } from "@/lib/admin/enterpriseAuth";
import {
  getMatrixRow,
  updateMatrixRow,
  deleteMatrixRow,
} from "@/services/admin/positionMatrixAdminService";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireEnterprise(req, "institutional_pd");
  if ("error" in auth) return auth.error;

  const { id } = await params;
  try {
    const row = await getMatrixRow(id);
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ row });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireEnterprise(req, "institutional_pd");
  if ("error" in auth) return auth.error;

  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const row = await updateMatrixRow(id, {
      ...(typeof body.sport_id === "string" ? { sport_id: body.sport_id } : {}),
      ...(typeof body.position === "string" ? { position: body.position } : {}),
      ...(body.gps_targets !== undefined
        ? { gps_targets: body.gps_targets as Record<string, unknown> }
        : {}),
      ...(body.strength_targets !== undefined
        ? { strength_targets: body.strength_targets as Record<string, unknown> }
        : {}),
      ...(body.speed_targets !== undefined
        ? { speed_targets: body.speed_targets as Record<string, unknown> }
        : {}),
      ...(Array.isArray(body.mandatory_programs)
        ? { mandatory_programs: body.mandatory_programs as string[] }
        : {}),
      ...(Array.isArray(body.recommended_programs)
        ? { recommended_programs: body.recommended_programs as string[] }
        : {}),
      ...(body.weekly_structure !== undefined
        ? { weekly_structure: body.weekly_structure as Record<string, unknown> }
        : {}),
    });
    return NextResponse.json({ row });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireEnterprise(req, "institutional_pd");
  if ("error" in auth) return auth.error;

  const { id } = await params;
  try {
    await deleteMatrixRow(id);
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
