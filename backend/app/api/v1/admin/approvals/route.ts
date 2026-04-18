import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/apiAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";

// GET /api/v1/admin/approvals?filter=all|stuck|pending
// Admin-only. Lists approval_request suggestions with their decision
// chain + age. 'stuck' filter returns pending rows older than 48h —
// the action surface.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type UntypedDb = { from: (table: string) => any };

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  const url = new URL(req.url);
  const filter = url.searchParams.get("filter") ?? "stuck";

  const db = supabaseAdmin() as unknown as UntypedDb;

  let query = db
    .from("suggestions")
    .select(
      "id, player_id, author_id, author_role, suggestion_type, title, mode, blocking, required_approver_role, status, supersede_rule, approval_chain, resolved_at, resolved_by, resolved_by_role, resolution_rationale, target_ref_type, target_ref_id, created_at"
    )
    .eq("mode", "approval_request")
    .order("created_at", { ascending: false })
    .limit(500);

  if (filter === "pending" || filter === "stuck") {
    query = query.eq("status", "pending");
  }
  if (filter === "stuck") {
    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    query = query.lt("created_at", cutoff);
  }

  const { data: rows, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message, code: "LIST_FAILED" }, { status: 500 });
  }

  const suggestions = (rows ?? []) as Array<{
    id: string;
    player_id: string;
    author_id: string;
    author_role: string;
    suggestion_type: string;
    title: string;
    mode: string;
    blocking: boolean;
    required_approver_role: string | null;
    status: string;
    supersede_rule: string;
    approval_chain: unknown;
    resolved_at: string | null;
    resolved_by: string | null;
    resolved_by_role: string | null;
    resolution_rationale: string | null;
    target_ref_type: string | null;
    target_ref_id: string | null;
    created_at: string;
  }>;

  const userIds = Array.from(
    new Set(
      suggestions.flatMap((s) => [s.player_id, s.author_id]).filter(Boolean)
    )
  );
  const { data: users } = await db
    .from("users")
    .select("id, name, email, date_of_birth")
    .in("id", userIds.length ? userIds : ["00000000-0000-0000-0000-000000000000"]);

  const userMap = new Map(
    ((users ?? []) as Array<{ id: string; name: string | null; email: string | null; date_of_birth: string | null }>)
      .map((u) => [u.id, u])
  );

  const now = Date.now();
  const ageHours = (iso: string): number =>
    Math.round((now - new Date(iso).getTime()) / 3_600_000);

  return NextResponse.json({
    filter,
    rows: suggestions.map((s) => ({
      id: s.id,
      title: s.title,
      suggestionType: s.suggestion_type,
      status: s.status,
      mode: s.mode,
      blocking: s.blocking,
      requiredApproverRole: s.required_approver_role,
      supersedeRule: s.supersede_rule,
      approvalChain: s.approval_chain,
      resolvedAt: s.resolved_at,
      resolvedByRole: s.resolved_by_role,
      resolutionRationale: s.resolution_rationale,
      targetRefType: s.target_ref_type,
      targetRefId: s.target_ref_id,
      createdAt: s.created_at,
      ageHours: ageHours(s.created_at),
      isStuck: s.status === "pending" && ageHours(s.created_at) >= 48,
      author: userMap.get(s.author_id) ?? { id: s.author_id, name: null, email: null },
      authorRole: s.author_role,
      player: userMap.get(s.player_id) ?? { id: s.player_id, name: null, email: null, date_of_birth: null },
    })),
  });
}
