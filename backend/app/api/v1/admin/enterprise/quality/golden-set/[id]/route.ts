import { NextRequest, NextResponse } from "next/server";
import { requireEnterprise } from "@/lib/admin/enterpriseAuth";
import {
  deleteGoldenScenario,
  updateGoldenScenarioStatus,
} from "@/services/admin/chatQualityAdminService";

/**
 * PATCH /api/v1/admin/enterprise/quality/golden-set/[id]
 * Body: { is_frozen?: boolean, source?: string, scheduled_removal_at?: string|null }
 *
 * DELETE /api/v1/admin/enterprise/quality/golden-set/[id]
 * Hard-delete. Admin must ensure the scenario isn't a frozen regression canary.
 */
export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await requireEnterprise(req, "institutional_pd");
  if ("error" in auth) return auth.error;

  const { id } = await ctx.params;
  let body: {
    is_frozen?: boolean;
    source?: string;
    scheduled_removal_at?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    await updateGoldenScenarioStatus(id, body);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Update failed" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await requireEnterprise(req, "super_admin");
  if ("error" in auth) return auth.error;

  const { id } = await ctx.params;
  try {
    await deleteGoldenScenario(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Delete failed" },
      { status: 500 }
    );
  }
}
