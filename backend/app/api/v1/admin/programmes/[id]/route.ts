import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/apiAuth";
import { programmeUpdateSchema } from "@/lib/validation/programmeSchemas";
import {
  getProgrammeFull,
  updateProgramme,
  deleteProgramme,
} from "@/services/admin/programmeAdminService";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  const { id } = await params;
  try {
    const programme = await getProgrammeFull(id);
    if (!programme) {
      return NextResponse.json({ error: "Programme not found" }, { status: 404 });
    }
    return NextResponse.json(programme);
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to get programme", detail: String(err) },
      { status: 500 }
    );
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const body = await req.json();
  const parsed = programmeUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const programme = await updateProgramme(id, parsed.data);
    return NextResponse.json(programme);
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to update programme", detail: String(err) },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  const { id } = await params;
  try {
    await deleteProgramme(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to delete programme", detail: String(err) },
      { status: 500 }
    );
  }
}
