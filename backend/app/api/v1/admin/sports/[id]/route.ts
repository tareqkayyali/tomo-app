import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/apiAuth";
import { sportUpdateSchema } from "@/lib/validation/sportSchemas";
import {
  getSport,
  updateSport,
  deleteSport,
} from "@/services/admin/sportAdminService";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  const { id } = await params;

  try {
    const sport = await getSport(id);
    if (!sport) {
      return NextResponse.json({ error: "Sport not found" }, { status: 404 });
    }
    return NextResponse.json(sport);
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to get sport", detail: String(err) },
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
  const parsed = sportUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const sport = await updateSport(id, parsed.data);
    return NextResponse.json(sport);
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to update sport", detail: String(err) },
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
    await deleteSport(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to delete sport", detail: String(err) },
      { status: 500 }
    );
  }
}
