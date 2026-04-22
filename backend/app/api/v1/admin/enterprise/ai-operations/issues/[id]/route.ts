import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/apiAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * PATCH /api/v1/admin/enterprise/ai-operations/issues/{id}
 *
 * Admin+ can mark an issue resolved / dismissed / rejected_with_justification
 * from the CMS. Replaces the SQL-only issue triage flow.
 *
 * Body: { status: string, rejection_reason?: string }
 *
 * Rules:
 *   - 'rejected_with_justification' requires rejection_reason (non-empty)
 *   - 'resolved' sets resolved_at = NOW()
 *   - Every change writes ai_auto_heal_audit
 *   - institutional_pd and analyst can triage; super_admin reserved for
 *     kill-switch and pattern toggle
 */

const ALLOWED_STATUSES = new Set([
  "open",
  "needs_human",
  "resolved",
  "dismissed",
  "rejected_with_justification",
]);

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;
  const { id } = await params;

  let body: { status?: unknown; rejection_reason?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const status = typeof body.status === "string" ? body.status : null;
  if (!status || !ALLOWED_STATUSES.has(status)) {
    return NextResponse.json(
      {
        error: "Invalid status",
        detail: `Must be one of: ${Array.from(ALLOWED_STATUSES).join(", ")}`,
      },
      { status: 400 },
    );
  }

  const rejectionReason =
    typeof body.rejection_reason === "string"
      ? body.rejection_reason.trim().slice(0, 800)
      : "";

  if (status === "rejected_with_justification" && !rejectionReason) {
    return NextResponse.json(
      { error: "rejected_with_justification requires rejection_reason" },
      { status: 400 },
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabaseAdmin() as any;

  const { data: before, error: loadErr } = await db
    .from("ai_issues")
    .select("id, source, category, status, target_file, target_symbol")
    .eq("id", id)
    .maybeSingle();
  if (loadErr) {
    return NextResponse.json(
      { error: "Failed to load issue", detail: loadErr.message },
      { status: 500 },
    );
  }
  if (!before) {
    return NextResponse.json({ error: "Issue not found" }, { status: 404 });
  }

  if (before.status === status && !(status === "rejected_with_justification" && rejectionReason)) {
    return NextResponse.json({ ok: true, status, noop: true });
  }

  const patch: Record<string, unknown> = { status };
  if (status === "resolved") patch.resolved_at = new Date().toISOString();
  if (status === "rejected_with_justification")
    patch.rejection_reason = rejectionReason;

  const { error: updateErr } = await db
    .from("ai_issues")
    .update(patch)
    .eq("id", id);
  if (updateErr) {
    return NextResponse.json(
      { error: "Failed to update issue", detail: updateErr.message },
      { status: 500 },
    );
  }

  const actorEmail = auth.user.email ?? auth.user.id;
  try {
    await db.from("ai_auto_heal_audit").insert({
      actor: `admin:${actorEmail}`,
      action: "issue_status_change",
      target_table: "ai_issues",
      target_id: id,
      before_state: { status: before.status },
      after_state: { status, ...(rejectionReason ? { rejection_reason: rejectionReason } : {}) },
      reason: rejectionReason || `Manual triage via CMS: ${status}`,
    });
  } catch {
    // Best-effort audit
  }

  return NextResponse.json({
    ok: true,
    status,
    changed_from: before.status,
    category: before.category,
  });
}
