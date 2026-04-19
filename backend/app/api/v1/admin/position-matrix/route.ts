import { NextRequest, NextResponse } from "next/server";
import { requireEnterprise } from "@/lib/admin/enterpriseAuth";
import {
  listMatrixRows,
  createMatrixRow,
} from "@/services/admin/positionMatrixAdminService";

/** List & create rows in position_training_matrix. */

export async function GET(req: NextRequest) {
  const auth = await requireEnterprise(req, "institutional_pd");
  if ("error" in auth) return auth.error;

  const sport_id = req.nextUrl.searchParams.get("sport_id") || undefined;

  try {
    const rows = await listMatrixRows(sport_id ? { sport_id } : undefined);
    return NextResponse.json({ rows });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireEnterprise(req, "institutional_pd");
  if ("error" in auth) return auth.error;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const sport_id = typeof body.sport_id === "string" ? body.sport_id : "";
  const position = typeof body.position === "string" ? body.position : "";
  if (!sport_id || !position) {
    return NextResponse.json(
      { error: "sport_id and position are required" },
      { status: 400 }
    );
  }

  try {
    const row = await createMatrixRow({
      sport_id,
      position,
      gps_targets: asJsonObj(body.gps_targets),
      strength_targets: asJsonObj(body.strength_targets),
      speed_targets: asJsonObj(body.speed_targets),
      mandatory_programs: asStrArr(body.mandatory_programs),
      recommended_programs: asStrArr(body.recommended_programs),
      weekly_structure: asJsonObj(body.weekly_structure),
    });
    return NextResponse.json({ row }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function asJsonObj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}

function asStrArr(v: unknown): string[] {
  return Array.isArray(v) ? (v.filter((x) => typeof x === "string") as string[]) : [];
}
