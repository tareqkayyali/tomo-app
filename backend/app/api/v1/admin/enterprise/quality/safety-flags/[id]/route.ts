import { NextRequest, NextResponse } from "next/server";
import { requireEnterprise } from "@/lib/admin/enterpriseAuth";
import { updateSafetyFlagStatus } from "@/services/admin/chatQualityAdminService";

/**
 * PATCH /api/v1/admin/enterprise/quality/safety-flags/[id]
 * Body: { status: "triaged" | "resolved" | "false_alarm", resolution?: string }
 *
 * Resolve (or re-triage) a safety audit flag.
 */
export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await requireEnterprise(req, "institutional_pd");
  if ("error" in auth) return auth.error;

  const { id } = await ctx.params;
  let body: { status?: string; resolution?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const status = body.status;
  if (!status || !["triaged", "resolved", "false_alarm"].includes(status)) {
    return NextResponse.json(
      { error: "status must be one of triaged|resolved|false_alarm" },
      { status: 400 }
    );
  }

  try {
    await updateSafetyFlagStatus(
      id,
      status as "triaged" | "resolved" | "false_alarm",
      auth.user.id,
      body.resolution ?? null
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Update failed" },
      { status: 500 }
    );
  }
}
