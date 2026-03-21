import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/apiAuth";
import { drillUpdateSchema } from "@/lib/validation/drillSchemas";
import {
  getDrillFull,
  updateDrill,
  deleteDrill,
} from "@/services/admin/drillAdminService";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  const { id } = await params;
  try {
    const drill = await getDrillFull(id);
    if (!drill) {
      return NextResponse.json({ error: "Drill not found" }, { status: 404 });
    }
    return NextResponse.json(drill);
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to get drill", detail: String(err) },
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
  const parsed = drillUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const drill = await updateDrill(id, parsed.data);
    return NextResponse.json(drill);
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to update drill", detail: String(err) },
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
  const hard = req.nextUrl.searchParams.get("hard") === "true";

  try {
    await deleteDrill(id, hard);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to delete drill", detail: String(err) },
      { status: 500 }
    );
  }
}
