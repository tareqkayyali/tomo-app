import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/apiAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";

// PATCH /api/v1/admin/ai-health/fixes/{fixId}/status
//
// Direct-DB replacement of the old Python proxy. Handles the full fix
// lifecycle transition (ai_fixes + parent ai_issues in one transaction).
// The LangSmith feedback write-back on status='verified' is delegated to
// a narrow Python endpoint (Python keeps LangSmith SDK ownership); TS
// fires-and-forgets so the DB transition doesn't block on external API.
//
// Body: { status, applied_by?, before_metric?, after_metric? }
// Response: { ok: true, fix_id, status }

const VALID_STATUSES = new Set([
  "pending",
  "approved",
  "applied",
  "verified",
  "rejected",
  // Phase 5 extended states (allowed for forward compat; CMS does not set these yet):
  "proposed",
  "applying",
  "re_eval_running",
  "re_eval_pass",
  "auto_approved_pr_open",
  "merged",
  "re_eval_fail",
  "reverted",
  "awaiting_human_approval",
  "applied_wrong_location",
]);

function getAIServiceUrl(): string {
  if (process.env.AI_SERVICE_URL) return process.env.AI_SERVICE_URL;
  if (process.env.RAILWAY_ENVIRONMENT)
    return "http://tomo-ai.railway.internal:8000";
  return "http://localhost:8000";
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ fixId: string }> },
) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;
  const { fixId } = await params;

  let body: {
    status?: string;
    applied_by?: string | null;
    before_metric?: number | null;
    after_metric?: number | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const status = body.status;
  if (!status || !VALID_STATUSES.has(status)) {
    return NextResponse.json(
      {
        error: "Invalid status",
        detail: `Must be one of: ${Array.from(VALID_STATUSES).join(", ")}`,
      },
      { status: 400 },
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabaseAdmin() as any; // extended ai_fixes/ai_issues columns not in generated types until regen

  // ── Load the fix to validate existence + get issue_id ──────────────
  const { data: fix, error: fetchError } = await db
    .from("ai_fixes")
    .select("id, issue_id, status, applied_at")
    .eq("id", fixId)
    .maybeSingle();

  if (fetchError) {
    return NextResponse.json(
      { error: "Failed to load fix", detail: fetchError.message },
      { status: 500 },
    );
  }
  if (!fix) {
    return NextResponse.json({ error: "Fix not found" }, { status: 404 });
  }

  // ── Update the fix row ─────────────────────────────────────────────
  const now = new Date().toISOString();
  const updates: Record<string, unknown> = { status };
  if (status === "applied" || status === "verified") {
    updates.applied_at = fix.applied_at ?? now;
  }
  if (status === "verified") {
    updates.verified_at = now;
  }
  if (body.applied_by !== undefined && body.applied_by !== null) {
    updates.applied_by = body.applied_by;
  }
  if (body.before_metric !== undefined && body.before_metric !== null) {
    updates.before_metric = body.before_metric;
  }
  if (body.after_metric !== undefined && body.after_metric !== null) {
    updates.after_metric = body.after_metric;
  }

  const { error: updateError } = await db
    .from("ai_fixes")
    .update(updates)
    .eq("id", fixId);

  if (updateError) {
    return NextResponse.json(
      { error: "Failed to update fix", detail: updateError.message },
      { status: 500 },
    );
  }

  // ── Parent issue cascade ───────────────────────────────────────────
  if (fix.issue_id) {
    if (status === "applied") {
      await db
        .from("ai_issues")
        .update({ status: "fix_applied" })
        .eq("id", fix.issue_id);
    } else if (status === "verified") {
      await db
        .from("ai_issues")
        .update({
          status: "resolved",
          resolved_at: now,
          resolved_by_fix_id: fixId,
        })
        .eq("id", fix.issue_id);
    }
  }

  // ── Audit row ──────────────────────────────────────────────────────
  await db.from("ai_auto_heal_audit").insert({
    actor: `admin:${auth.user.email ?? auth.user.id}`,
    action: "fix_status_change",
    target_table: "ai_fixes",
    target_id: fixId,
    before_state: { status: fix.status },
    after_state: updates,
    reason: `CMS PATCH to ${status}`,
  });

  // ── Fire-and-forget LangSmith feedback on verify ────────────────────
  // Python endpoint owns the SDK call; TS does not block on it so a flaky
  // LangSmith API doesn't stall the CMS response.
  if (status === "verified") {
    void fetch(`${getAIServiceUrl()}/admin/ai-health/fixes/${fixId}/feedback/langsmith`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Service-Key": process.env.TS_BACKEND_SERVICE_KEY ?? "",
      },
      body: JSON.stringify({ score: 1.0 }),
    }).catch(() => {
      // Swallow — LangSmith feedback is best-effort. Failure is logged by Python.
    });
  }

  return NextResponse.json({ ok: true, fix_id: fixId, status });
}
