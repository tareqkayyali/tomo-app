import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/apiAuth";
import { normativeUpdateSchema } from "@/lib/validation/normativeSchemas";
import {
  updateNormativeRow,
  deleteNormativeRow,
} from "@/services/admin/normativeDataAdminService";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const body = await req.json();
  const parsed = normativeUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const row = await updateNormativeRow(id, parsed.data);
    return NextResponse.json(row);
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to update normative row", detail: String(err) },
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
    await deleteNormativeRow(id);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to delete normative row", detail: String(err) },
      { status: 500 }
    );
  }
}
