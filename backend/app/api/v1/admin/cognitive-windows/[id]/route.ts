import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/apiAuth";
import { cognitiveWindowSchema } from "@/lib/validation/planningSchemas";
import {
  getWindowById,
  updateWindow,
  deleteWindow,
} from "@/services/admin/cognitiveWindowAdminService";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  const { id } = await params;

  try {
    const window = await getWindowById(id);
    if (!window) {
      return NextResponse.json(
        { error: "Cognitive window not found" },
        { status: 404 }
      );
    }
    return NextResponse.json(window);
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to get cognitive window", detail: String(err) },
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
  const parsed = cognitiveWindowSchema.partial().safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const window = await updateWindow(id, parsed.data);
    return NextResponse.json(window);
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to update cognitive window", detail: String(err) },
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
    await deleteWindow(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to delete cognitive window", detail: String(err) },
      { status: 500 }
    );
  }
}
