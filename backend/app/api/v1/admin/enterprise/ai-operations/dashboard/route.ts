import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/apiAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * GET /api/v1/admin/enterprise/ai-operations/dashboard
 *
 * Single aggregation endpoint backing the daily AI Operations dashboard.
 * Returns everything an admin needs to glance at the loop's health:
 *   - loop state (enabled?, budget, blocked_paths count)
 *   - last cron heartbeats (per crontype, newest audit row)
 *   - actions needed (open PRs, needs_human issues, open safety flags)
 *   - overnight summary (last nightly eval, issue deltas, drift deltas)
 *   - auto_repair_patterns list (with toggle state + trigger counts)
 *   - recent audit feed (last 30 events)
 *
 * Everything runs in parallel Promise.all — one round trip to the DB
 * regardless of how much the dashboard shows.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabaseAdmin() as any; // ai_* / auto_repair_patterns not in generated types until regen

  const now = new Date();
  const since24h = new Date(now.getTime() - 24 * 3600 * 1000).toISOString();

  const [
    configRes,
    lastNightlyRes,
    openPrsRes,
    needsHumanIssuesRes,
    openSafetyFlagsRes,
    issues24hBySourceRes,
    drift24hRes,
    patternsRes,
    auditFeedRes,
    cronHeartbeatRes,
  ] = await Promise.all([
    db
      .from("ai_auto_heal_config")
      .select("enabled, budget_daily_usd, budget_alert_threshold_pct, max_fixes_per_day, allowed_categories, blocked_paths")
      .limit(1)
      .maybeSingle(),

    db
      .from("ai_eval_runs")
      .select("id, trigger, status, started_at, finished_at, passed, failed, errored, total, cost_usd_total, commit_sha")
      .eq("trigger", "nightly")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle(),

    db
      .from("ai_fixes")
      .select("id, issue_id, title, author, status, pr_url, branch_name, applied_at, target_files")
      .eq("status", "auto_approved_pr_open")
      .order("applied_at", { ascending: false })
      .limit(20),

    db
      .from("ai_issues")
      .select("id, source, category, severity_class, target_file, target_symbol, description, escalation_level, first_seen_at, occurrence_count")
      .eq("status", "needs_human")
      .order("escalation_level", { ascending: false })
      .order("occurrence_count", { ascending: false })
      .limit(20),

    db
      .from("safety_audit_flags")
      .select("id, flag_type, severity, status, created_at")
      .eq("status", "open")
      .in("severity", ["critical", "high"])
      .order("created_at", { ascending: false })
      .limit(10),

    db
      .from("ai_issues")
      .select("source, severity_class")
      .gte("first_seen_at", since24h),

    db
      .from("quality_drift_alerts")
      .select("id, dimension, alerted_at, status")
      .gte("alerted_at", since24h),

    db
      .from("auto_repair_patterns")
      .select("id, pattern_name, description, detection_spec, patch_spec, affected_files, status, times_triggered, times_merged, last_triggered_at, updated_at")
      .order("pattern_name", { ascending: true }),

    db
      .from("ai_auto_heal_audit")
      .select("id, actor, action, target_table, target_id, reason, created_at")
      .order("created_at", { ascending: false })
      .limit(30),

    // Derive cron heartbeats from the most recent audit row per cron actor
    // (audit stores the actor string like 'cron:auto-heal-apply'). Not every
    // cron writes audit on every tick (monitor doesn't when nothing to do),
    // so absence == "no recent state change" not "cron died". Log level
    // triage rather than heartbeat truth.
    db
      .from("ai_auto_heal_audit")
      .select("actor, action, created_at")
      .like("actor", "cron:%")
      .gte("created_at", new Date(now.getTime() - 48 * 3600 * 1000).toISOString())
      .order("created_at", { ascending: false })
      .limit(200),
  ]);

  if (configRes.error) {
    return NextResponse.json(
      { error: "Failed to load dashboard", detail: configRes.error.message },
      { status: 500 },
    );
  }

  // ── Bucket new issues by source ─────────────────────────────────
  const issuesBySource: Record<string, number> = {};
  const issuesBySeverity: Record<string, number> = {};
  for (const r of (issues24hBySourceRes.data ?? []) as Array<{
    source: string | null;
    severity_class: string | null;
  }>) {
    if (r.source) issuesBySource[r.source] = (issuesBySource[r.source] ?? 0) + 1;
    if (r.severity_class)
      issuesBySeverity[r.severity_class] = (issuesBySeverity[r.severity_class] ?? 0) + 1;
  }

  // ── Drift 24h by dimension ──────────────────────────────────────
  const driftByDim: Record<string, number> = {};
  for (const r of (drift24hRes.data ?? []) as Array<{ dimension: string }>) {
    driftByDim[r.dimension] = (driftByDim[r.dimension] ?? 0) + 1;
  }

  // ── Cron heartbeat table ────────────────────────────────────────
  // Most recent audit event per cron actor in the last 48h.
  const heartbeats: Record<
    string,
    { last_seen_at: string; last_action: string }
  > = {};
  for (const r of (cronHeartbeatRes.data ?? []) as Array<{
    actor: string;
    action: string;
    created_at: string;
  }>) {
    if (!heartbeats[r.actor]) {
      heartbeats[r.actor] = { last_seen_at: r.created_at, last_action: r.action };
    }
  }

  return NextResponse.json({
    config: configRes.data ?? null,
    last_nightly_eval: lastNightlyRes.data ?? null,
    actions_needed: {
      auto_heal_prs_open: openPrsRes.data ?? [],
      issues_needing_human: needsHumanIssuesRes.data ?? [],
      safety_flags_open: openSafetyFlagsRes.data ?? [],
    },
    last_24h: {
      new_issues_by_source: issuesBySource,
      new_issues_by_severity_class: issuesBySeverity,
      drift_alerts_total: (drift24hRes.data ?? []).length,
      drift_alerts_by_dimension: driftByDim,
    },
    patterns: patternsRes.data ?? [],
    audit_feed: auditFeedRes.data ?? [],
    cron_heartbeats: heartbeats,
  });
}
