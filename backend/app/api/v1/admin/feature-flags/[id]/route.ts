import { NextRequest, NextResponse } from "next/server";
import { requireEnterprise } from "@/lib/admin/enterpriseAuth";
import { featureFlagUpdateSchema } from "@/lib/validation/uiConfigSchemas";
import {
  getFlag,
  updateFlag,
  deleteFlag,
} from "@/services/admin/featureFlagAdminService";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireEnterprise(req, "super_admin");
  if ("error" in auth) return auth.error;

  const { id } = await params;
  try {
    const flag = await getFlag(id);
    if (!flag) {
      return NextResponse.json({ error: "Feature flag not found" }, { status: 404 });
    }
    return NextResponse.json(flag);
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to get feature flag", detail: String(err) },
      { status: 500 }
    );
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireEnterprise(req, "super_admin");
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const body = await req.json();
  const parsed = featureFlagUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const flag = await updateFlag(id, parsed.data);
    return NextResponse.json(flag);
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to update feature flag", detail: String(err) },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireEnterprise(req, "super_admin");
  if ("error" in auth) return auth.error;

  const { id } = await params;
  try {
    await deleteFlag(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to delete feature flag", detail: String(err) },
      { status: 500 }
    );
  }
}
