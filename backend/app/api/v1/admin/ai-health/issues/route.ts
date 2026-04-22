import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/apiAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";

// GET /api/v1/admin/ai-health/issues
//
// Active fix queue. Replaces the previous Python proxy; response shape is a
// strict superset of the old endpoint so the existing CMS page at
// `backend/app/admin/(app)/(ops)/(monitoring)/ai-health/page.tsx` keeps
// working without modification.
//
// Legacy fields preserved (trace-source vocabulary):
//   id, week_start, issue_type, severity, affected_count, pattern_summary,
//   metadata, trend_data, recurrence_count, last_seen_at, status, created_at
//
// New fields (eval-source + Phase 0 extensions):
//   source, source_ref, category, severity_class, target_file,
//   target_symbol, description, evidence, escalation_level, revert_history,
//   resolved_by_fix_id, rejection_reason, first_seen_at, occurrence_count
//
// Each issue embeds `fixes: [...]` — all ai_fixes linked to it (any status).
// Default filter: active queue = NOT IN (resolved, dismissed,
// rejected_with_justification). Override via ?status=<value> or ?status=all.
//
// Query params:
//   ?status=<single>|all   (default: active queue)
//   ?severity=<legacy vocab: critical|high|medium|low>
//   ?severity_class=<new vocab: p1_safety|p2_quality|p3_cost|p4_ux>
//   ?source=<eval|langsmith_trace|manual>
//   ?category=<any>
//   ?limit=<1-200> (default 100 — legacy was unlimited; cap added)
//   ?offset=<int> (default 0)
//
// Ordering: severity rank (critical > high > medium > low) then
// last_seen_at DESC. Severity rank is sorted client-side after fetch because
// Supabase .order() doesn't support CASE expressions.

const SEVERITY_RANK: Record<string, number> = {
  critical: 1,
  high: 2,
  medium: 3,
  low: 4,
};

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  const url = new URL(req.url);
  const statusParam = url.searchParams.get("status");
  const severity = url.searchParams.get("severity");
  const severityClass = url.searchParams.get("severity_class");
  const source = url.searchParams.get("source");
  const category = url.searchParams.get("category");
  const limit = Math.min(
    parseInt(url.searchParams.get("limit") ?? "100", 10) || 100,
    200,
  );
  const offset = parseInt(url.searchParams.get("offset") ?? "0", 10) || 0;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabaseAdmin() as any; // extended ai_issues columns not in generated types until regen

  // Fetch issues with embedded fixes via nested select
  let query = db
    .from("ai_issues")
    .select("*, fixes:ai_fixes(*)", { count: "exact" })
    .order("last_seen_at", { ascending: false, nullsFirst: false })
    .range(offset, offset + limit - 1);

  // Default = active queue; 'all' = no filter; explicit value = exact match
  if (statusParam && statusParam !== "all") {
    query = query.eq("status", statusParam);
  } else if (!statusParam) {
    query = query.not(
      "status",
      "in",
      "(resolved,dismissed,rejected_with_justification)",
    );
  }

  if (severity) query = query.eq("severity", severity);
  if (severityClass) query = query.eq("severity_class", severityClass);
  if (source) query = query.eq("source", source);
  if (category) query = query.eq("category", category);

  const { data, error, count } = await query;
  if (error) {
    return NextResponse.json(
      { error: "Failed to list issues", detail: error.message },
      { status: 500 },
    );
  }

  // Client-side severity ranking (primary sort); last_seen_at already DESC
  type IssueRow = { severity: string | null; last_seen_at: string | null };
  const issues = ((data ?? []) as IssueRow[]).slice().sort((a, b) => {
    const rankA = SEVERITY_RANK[a.severity ?? ""] ?? 99;
    const rankB = SEVERITY_RANK[b.severity ?? ""] ?? 99;
    if (rankA !== rankB) return rankA - rankB;
    const tA = a.last_seen_at ? new Date(a.last_seen_at).getTime() : 0;
    const tB = b.last_seen_at ? new Date(b.last_seen_at).getTime() : 0;
    return tB - tA;
  });

  return NextResponse.json({
    issues,
    total: count ?? issues.length,
    limit,
    offset,
    filter: {
      status: statusParam ?? "active_queue",
      severity,
      severity_class: severityClass,
      source,
      category,
    },
  });
}
