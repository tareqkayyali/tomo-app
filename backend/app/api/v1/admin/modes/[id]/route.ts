import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/apiAuth";
import { updateModeSchema } from "@/lib/validation/modeSchemas";
import {
  getModeById,
  updateMode,
  deleteMode,
} from "@/services/admin/modeAdminService";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  const { id } = await params;

  try {
    const mode = await getModeById(id);
    if (!mode) {
      return NextResponse.json({ error: "Mode not found" }, { status: 404 });
    }
    return NextResponse.json(mode);
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to get mode", detail: String(err) },
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
  const parsed = updateModeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const mode = await updateMode(id, parsed.data);
    return NextResponse.json(mode);
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to update mode", detail: String(err) },
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
    await deleteMode(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to delete mode", detail: String(err) },
      { status: 500 }
    );
  }
}
