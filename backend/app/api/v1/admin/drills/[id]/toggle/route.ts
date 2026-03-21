import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/apiAuth";
import { toggleDrillActive } from "@/services/admin/drillAdminService";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  const { id } = await params;
  try {
    const result = await toggleDrillActive(id);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to toggle drill", detail: String(err) },
      { status: 500 }
    );
  }
}
