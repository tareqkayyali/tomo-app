import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/apiAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";

// GET /api/v1/admin/ai-health
// Root endpoint — returns a summary card dataset for the CMS AI Health
// overview page: latest run, open P1 count, budget usage, kill-switch state,
// 24h issue detection rate.

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabaseAdmin() as any; // ai_* tables not in generated types until regen

  const [
    { data: config, error: configError },
    { data: latestRun, error: runError },
    { count: openP1, error: p1Error },
    { count: openP2, error: p2Error },
    { count: issues24h, error: issues24hError },
    { count: fixes24h, error: fixes24hError },
    { count: activeWatches, error: watchesError },
    { data: activeBaseline, error: baselineError },
  ] = await Promise.all([
    db.from("ai_auto_heal_config").select("*").limit(1).maybeSingle(),
    db
      .from("ai_eval_runs")
      .select("id, trigger, status, started_at, finished_at, passed, failed, errored, total")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    db
      .from("ai_issues")
      .select("*", { count: "exact", head: true })
      .eq("severity_class", "p1_safety")
      .in("status", ["open", "fix_generated", "needs_human"]),
    db
      .from("ai_issues")
      .select("*", { count: "exact", head: true })
      .eq("severity_class", "p2_quality")
      .in("status", ["open", "fix_generated", "needs_human"]),
    db
      .from("ai_issues")
      .select("*", { count: "exact", head: true })
      .gte("created_at", new Date(Date.now() - 24 * 3600 * 1000).toISOString()),
    db
      .from("ai_fixes")
      .select("*", { count: "exact", head: true })
      .gte("created_at", new Date(Date.now() - 24 * 3600 * 1000).toISOString()),
    db
      .from("ai_post_merge_watch")
      .select("*", { count: "exact", head: true })
      .eq("status", "watching"),
    db
      .from("ai_eval_baselines")
      .select("kind, commit_sha, promoted_at, consecutive_green_nights")
      .eq("kind", "active")
      .eq("is_retired", false)
      .maybeSingle(),
  ]);

  const firstError =
    configError ??
    runError ??
    p1Error ??
    p2Error ??
    issues24hError ??
    fixes24hError ??
    watchesError ??
    baselineError;

  if (firstError) {
    return NextResponse.json(
      { error: "Failed to load summary", detail: firstError.message },
      { status: 500 },
    );
  }

  return NextResponse.json({
    summary: {
      loop_enabled: config?.enabled ?? false,
      budget_daily_usd: config?.budget_daily_usd ?? null,
      budget_alert_threshold_pct: config?.budget_alert_threshold_pct ?? null,
      latest_run: latestRun ?? null,
      open_issues: {
        p1_safety: openP1 ?? 0,
        p2_quality: openP2 ?? 0,
      },
      last_24h: {
        issues_created: issues24h ?? 0,
        fixes_created: fixes24h ?? 0,
      },
      active_post_merge_watches: activeWatches ?? 0,
      active_baseline: activeBaseline ?? null,
    },
  });
}
