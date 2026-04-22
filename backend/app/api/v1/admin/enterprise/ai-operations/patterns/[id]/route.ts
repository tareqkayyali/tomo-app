import { NextRequest, NextResponse } from "next/server";
import { requireEnterprise } from "@/lib/admin/enterpriseAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * PATCH /api/v1/admin/enterprise/ai-operations/patterns/{id}
 *
 * Super_admin-only toggle for auto_repair_patterns.status.
 * Accepts { status: 'active' | 'disabled' | 'archived', reason?: string }.
 *
 * Every flip writes an ai_auto_heal_audit row with the actor's email.
 * This is the second CMS knob (after the kill-switch) that replaced a
 * SQL-only operation.
 */

const ALLOWED_STATUSES = new Set(["active", "disabled", "archived"]);

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireEnterprise(req, "super_admin");
  if ("error" in auth) return auth.error;
  const { id } = await params;

  let body: { status?: unknown; reason?: unknown };
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
  const reason =
    typeof body.reason === "string" && body.reason.trim().length > 0
      ? body.reason.trim().slice(0, 500)
      : `Manual pattern status change via CMS: ${status}`;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabaseAdmin() as any;

  const { data: before, error: loadErr } = await db
    .from("auto_repair_patterns")
    .select("id, pattern_name, status")
    .eq("id", id)
    .maybeSingle();
  if (loadErr) {
    return NextResponse.json(
      { error: "Failed to load pattern", detail: loadErr.message },
      { status: 500 },
    );
  }
  if (!before) {
    return NextResponse.json({ error: "Pattern not found" }, { status: 404 });
  }

  if (before.status === status) {
    return NextResponse.json({
      ok: true,
      status,
      noop: true,
      reason: "already in requested state",
    });
  }

  const { error: updateErr } = await db
    .from("auto_repair_patterns")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (updateErr) {
    return NextResponse.json(
      { error: "Failed to update pattern", detail: updateErr.message },
      { status: 500 },
    );
  }

  const actorEmail = auth.user.email ?? auth.user.id;
  try {
    await db.from("ai_auto_heal_audit").insert({
      actor: `admin:${actorEmail}`,
      action:
        status === "active"
          ? "pattern_activated"
          : status === "disabled"
            ? "pattern_deactivated"
            : "pattern_archived",
      target_table: "auto_repair_patterns",
      target_id: id,
      before_state: { status: before.status, pattern_name: before.pattern_name },
      after_state: { status },
      reason,
    });
  } catch {
    // Audit failure is best-effort; the flip already landed
  }

  return NextResponse.json({
    ok: true,
    status,
    changed_from: before.status,
    pattern_name: before.pattern_name,
    reason,
  });
}
