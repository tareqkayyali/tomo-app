import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/apiAuth";
import { pageConfigUpdateSchema } from "@/lib/validation/uiConfigSchemas";
import {
  getPageConfig,
  updatePageConfig,
  deletePageConfig,
} from "@/services/admin/pageConfigAdminService";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  const { id } = await params;
  try {
    const config = await getPageConfig(id);
    if (!config) {
      return NextResponse.json({ error: "Page config not found" }, { status: 404 });
    }
    return NextResponse.json(config);
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to get page config", detail: String(err) },
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
  const parsed = pageConfigUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const config = await updatePageConfig(id, parsed.data);
    return NextResponse.json(config);
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to update page config", detail: String(err) },
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
    await deletePageConfig(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to delete page config", detail: String(err) },
      { status: 500 }
    );
  }
}
