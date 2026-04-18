import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/apiAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type UntypedDb = { from: (table: string) => any };

// GET /api/v1/admin/moderation/queue
// Admin-only. Returns pending/auto_hidden/human_review queue rows
// ordered by severity desc then created_at desc.

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  const db = supabaseAdmin() as unknown as UntypedDb;
  const { data, error } = await db
    .from("ugc_moderation_queue")
    .select("id, target_type, target_id, trigger, severity, state, created_at, classifier_score, reviewer_id, reviewed_at")
    .in("state", ["pending", "auto_hidden", "human_review"])
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    return NextResponse.json({ error: error.message, code: "QUEUE_LIST_FAILED" }, { status: 500 });
  }

  const queue = (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.id,
    targetType: row.target_type,
    targetId: row.target_id,
    trigger: row.trigger,
    severity: row.severity,
    state: row.state,
    createdAt: row.created_at,
    classifierScore: row.classifier_score ?? null,
    reviewerId: row.reviewer_id ?? null,
    reviewedAt: row.reviewed_at ?? null,
  }));

  return NextResponse.json({ queue });
}
