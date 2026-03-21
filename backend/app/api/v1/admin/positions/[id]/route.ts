import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/apiAuth";
import { getPosition, updatePosition, deletePosition } from "@/services/admin/positionAdminService";
import { z } from "zod";

const positionUpdateSchema = z.object({
  key: z.string().min(1).max(20).optional(),
  label: z.string().min(1).max(200).optional(),
  sort_order: z.number().int().optional(),
  attribute_weights: z.record(z.string(), z.number().min(0).max(1)).optional(),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  const { id } = await params;
  try {
    const position = await getPosition(id);
    if (!position) {
      return NextResponse.json({ error: "Position not found" }, { status: 404 });
    }
    return NextResponse.json(position);
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to get position", detail: String(err) },
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
  const parsed = positionUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const position = await updatePosition(id, parsed.data);
    return NextResponse.json(position);
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to update position", detail: String(err) },
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
    await deletePosition(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to delete position", detail: String(err) },
      { status: 500 }
    );
  }
}
