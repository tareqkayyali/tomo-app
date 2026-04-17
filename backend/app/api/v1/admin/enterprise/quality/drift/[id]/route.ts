import { NextRequest, NextResponse } from "next/server";
import { requireEnterprise } from "@/lib/admin/enterpriseAuth";
import { updateDriftAlertStatus } from "@/services/admin/chatQualityAdminService";

const ALLOWED_STATUSES = ["patch_proposed", "patch_merged", "resolved", "false_alarm"] as const;
type AllowedStatus = (typeof ALLOWED_STATUSES)[number];

/**
 * PATCH /api/v1/admin/enterprise/quality/drift/[id]
 * Body: { status: "patch_proposed" | "patch_merged" | "resolved" | "false_alarm", notes?: string }
 */
export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await requireEnterprise(req, "institutional_pd");
  if ("error" in auth) return auth.error;

  const { id } = await ctx.params;
  let body: { status?: string; notes?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.status || !(ALLOWED_STATUSES as readonly string[]).includes(body.status)) {
    return NextResponse.json(
      { error: `status must be one of ${ALLOWED_STATUSES.join("|")}` },
      { status: 400 }
    );
  }

  try {
    await updateDriftAlertStatus(id, body.status as AllowedStatus, body.notes ?? null);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Update failed" },
      { status: 500 }
    );
  }
}
