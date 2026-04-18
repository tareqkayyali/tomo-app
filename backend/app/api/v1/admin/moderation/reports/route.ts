import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/apiAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type UntypedDb = { from: (table: string) => any };

// GET /api/v1/admin/moderation/reports
// Admin-only. Returns open + triaged reports; overdue items surface
// via slaDueAt in the payload (consumed by the admin page).

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  const db = supabaseAdmin() as unknown as UntypedDb;
  const { data, error } = await db
    .from("ugc_reports")
    .select("id, reporter_id, target_type, target_id, reason, notes, status, opened_at, sla_due_at, resolved_at, resolution")
    .in("status", ["open", "triaged"])
    .order("sla_due_at", { ascending: true })
    .limit(500);

  if (error) {
    return NextResponse.json({ error: error.message, code: "REPORTS_LIST_FAILED" }, { status: 500 });
  }

  const reports = (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.id,
    reporterId: row.reporter_id,
    targetType: row.target_type,
    targetId: row.target_id,
    reason: row.reason,
    notes: row.notes ?? null,
    status: row.status,
    openedAt: row.opened_at,
    slaDueAt: row.sla_due_at,
    resolvedAt: row.resolved_at ?? null,
    resolution: row.resolution ?? null,
  }));

  return NextResponse.json({ reports });
}
