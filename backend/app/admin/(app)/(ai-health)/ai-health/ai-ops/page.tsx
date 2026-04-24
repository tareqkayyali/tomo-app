"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

// ── Types ────────────────────────────────────────────────────────────

interface DashboardConfig {
  enabled: boolean;
  budget_daily_usd: number | string;
  budget_alert_threshold_pct: number | string;
  max_fixes_per_day: number;
  allowed_categories: string[];
  blocked_paths: string[];
}

interface FullConfig {
  id: string;
  enabled: boolean;
  max_fixes_per_day: number;
  max_fixes_per_file_per_week: number;
  cooldown_minutes_after_revert: number;
  consecutive_clean_merges_required: number;
  post_merge_clean_hours: number;
  rolling_90d_revert_rate_cap: number | string;
  budget_daily_usd: number | string;
  budget_alert_threshold_pct: number | string;
  allowed_categories: string[];
  blocked_paths: string[];
  updated_at: string;
  updated_by: string | null;
}

interface NightlyEval {
  id: string;
  trigger: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  passed: number;
  failed: number;
  errored: number;
  total: number;
  cost_usd_total: number | string | null;
  commit_sha: string | null;
}

interface OpenPrRow {
  id: string;
  issue_id: string;
  title: string | null;
  author: string;
  status: string;
  pr_url: string | null;
  branch_name: string | null;
  applied_at: string | null;
  target_files: string[] | null;
}

interface NeedsHumanIssue {
  id: string;
  source: string;
  category: string | null;
  severity_class: string | null;
  target_file: string | null;
  target_symbol: string | null;
  description: string | null;
  escalation_level: number;
  first_seen_at: string | null;
  occurrence_count: number;
}

interface SafetyFlag {
  id: string;
  flag_type: string;
  severity: string;
  status: string;
  created_at: string;
}

interface PatternRow {
  id: string;
  pattern_name: string;
  description: string | null;
  detection_spec: Record<string, unknown> | null;
  patch_spec: Record<string, unknown> | null;
  affected_files: string[] | null;
  status: string;
  times_triggered: number;
  times_merged: number;
  last_triggered_at: string | null;
  updated_at: string;
}

interface DashboardResponse {
  config: DashboardConfig | null;
  last_nightly_eval: NightlyEval | null;
  actions_needed: {
    auto_heal_prs_open: OpenPrRow[];
    issues_needing_human: NeedsHumanIssue[];
    safety_flags_open: SafetyFlag[];
  };
  last_24h: {
    new_issues_by_source: Record<string, number>;
    new_issues_by_severity_class: Record<string, number>;
    drift_alerts_total: number;
    drift_alerts_by_dimension: Record<string, number>;
  };
  patterns: PatternRow[];
  audit_feed: never[];
  cron_heartbeats: Record<string, { last_seen_at: string; last_action: string }>;
}

interface PostMergeWatch {
  id: string;
  fix_id: string;
  merged_commit_sha: string;
  merged_at: string;
  watch_until: string;
  regressions_detected: number;
  auto_revert_pr_url: string | null;
  status: "watching" | "clean" | "reverted" | "monitor_down";
  ai_fixes: {
    id: string;
    title: string;
    author: string;
    status: string;
    pr_url: string | null;
  } | null;
}

// ── Helpers ──────────────────────────────────────────────────────────

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
}

function relTime(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(diff) || diff < 0) return "—";
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

function shortSha(sha: string | null): string {
  if (!sha) return "—";
  return sha.startsWith("PENDING_") ? sha : sha.slice(0, 7);
}

const STATUS_TINT: Record<string, string> = {
  passed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  failed: "bg-rose-50 text-rose-700 border-rose-200",
  errored: "bg-amber-50 text-amber-700 border-amber-200",
  running: "bg-sky-50 text-sky-700 border-sky-200",
  aborted: "bg-zinc-100 text-zinc-600 border-zinc-200",
};

const PATTERN_STATUS_TINT: Record<string, string> = {
  active: "bg-emerald-50 text-emerald-700 border-emerald-200",
  disabled: "bg-zinc-100 text-zinc-600 border-zinc-200",
  archived: "bg-rose-50 text-rose-700 border-rose-200",
};

const WATCH_STATUS_TINT: Record<string, string> = {
  watching: "bg-sky-50 text-sky-700 border-sky-200",
  clean: "bg-emerald-50 text-emerald-700 border-emerald-200",
  reverted: "bg-rose-50 text-rose-700 border-rose-200",
  monitor_down: "bg-amber-50 text-amber-700 border-amber-200",
};

const EXPECTED_CRONS: Array<{ actor: string; label: string }> = [
  { actor: "cron:quality-drift-check", label: "Drift Check (nightly)" },
  { actor: "cron:advance_eval_baseline", label: "Baseline Rollover (daily)" },
  { actor: "cron:auto-repair-scan", label: "CQE Auto-Repair (6h)" },
  { actor: "cron:auto-heal-apply", label: "Auto-Heal Applier (30m)" },
  { actor: "cron:auto-heal-monitor", label: "Post-Merge Monitor (1h)" },
  { actor: "cron:shadow-evaluate", label: "Shadow Evaluator (15m)" },
  { actor: "cron:golden-set-curate", label: "Golden-Set Curator (weekly)" },
];

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wider text-zinc-500 mb-0.5">{label}</p>
      <p className="font-mono text-sm">{value}</p>
    </div>
  );
}

// ── Component ────────────────────────────────────────────────────────

export default function AiOperationsPage() {
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [fullConfig, setFullConfig] = useState<FullConfig | null>(null);
  const [watches, setWatches] = useState<PostMergeWatch[]>([]);
  const [watchStatus, setWatchStatus] = useState<string>("watching");
  const [togglingLoop, setTogglingLoop] = useState(false);
  const [togglingPatternId, setTogglingPatternId] = useState<string | null>(null);
  const [triageIssueId, setTriageIssueId] = useState<string | null>(null);

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/admin/enterprise/ai-operations/dashboard", { credentials: "include" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(`Dashboard load failed: ${err.error ?? res.status}`);
        return;
      }
      setData((await res.json()) as DashboardResponse);
    } catch (e) {
      toast.error(`Dashboard request failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchFullConfig = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/admin/ai-health/config", { credentials: "include" });
      if (!res.ok) return;
      const body = await res.json();
      setFullConfig(body.config ?? null);
    } catch { /* non-critical */ }
  }, []);

  const fetchWatches = useCallback(async () => {
    try {
      const qs = new URLSearchParams({ limit: "50" });
      if (watchStatus) qs.set("status", watchStatus);
      const res = await fetch(`/api/v1/admin/ai-health/post-merge-watches?${qs}`, { credentials: "include" });
      if (!res.ok) return;
      const body = await res.json();
      setWatches(body.watches ?? []);
    } catch { /* non-critical */ }
  }, [watchStatus]);

  useEffect(() => {
    fetchDashboard();
    fetchFullConfig();
    const iv = setInterval(fetchDashboard, 60_000);
    return () => clearInterval(iv);
  }, [fetchDashboard, fetchFullConfig]);

  useEffect(() => { fetchWatches(); }, [fetchWatches]);

  const handleLoopToggle = useCallback(async () => {
    if (!data?.config) return;
    const next = !data.config.enabled;
    const msg = next
      ? "Enable the auto-heal loop?\n\nApplier will begin acting on proposed ai_fixes every 30 min. Kill-switch, blocked_paths, budget, rate limits all remain enforced."
      : "Disable the auto-heal loop?\n\nActing crons short-circuit within 30 min. Telemetry continues.";
    if (!window.confirm(msg)) return;
    const reason = window.prompt("Reason (audited). Leave blank for default.", "");
    if (reason === null) return;
    setTogglingLoop(true);
    try {
      const res = await fetch("/api/v1/admin/ai-health/config", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next, ...(reason.trim() ? { reason: reason.trim() } : {}) }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(`Toggle failed: ${err.error ?? res.status}`);
        return;
      }
      toast.success(`Auto-heal ${next ? "ENABLED" : "DISABLED"}`);
      await Promise.all([fetchDashboard(), fetchFullConfig()]);
    } finally {
      setTogglingLoop(false);
    }
  }, [data, fetchDashboard, fetchFullConfig]);

  const handlePatternToggle = useCallback(async (pattern: PatternRow) => {
    const next = pattern.status === "active" ? "disabled" : "active";
    if (!window.confirm(`Set pattern "${pattern.pattern_name}" to ${next.toUpperCase()}?`)) return;
    const reason = window.prompt("Reason (audited). Leave blank for default.", "");
    if (reason === null) return;
    setTogglingPatternId(pattern.id);
    try {
      const res = await fetch(`/api/v1/admin/enterprise/ai-operations/patterns/${pattern.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next, ...(reason.trim() ? { reason: reason.trim() } : {}) }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(`Pattern toggle failed: ${err.error ?? res.status}`);
        return;
      }
      toast.success(`Pattern ${pattern.pattern_name} → ${next}`);
      await fetchDashboard();
    } finally {
      setTogglingPatternId(null);
    }
  }, [fetchDashboard]);

  const handleIssueTriage = useCallback(async (issue: NeedsHumanIssue, action: "resolve" | "dismiss" | "reject") => {
    let status: string;
    let rejection_reason: string | undefined;
    if (action === "resolve") status = "resolved";
    else if (action === "dismiss") status = "dismissed";
    else {
      status = "rejected_with_justification";
      const r = window.prompt("Rejection reason (required, shown in audit + future dedup):", "");
      if (!r || !r.trim()) { toast.error("Rejection reason required"); return; }
      rejection_reason = r.trim();
    }
    if (action !== "reject" && !window.confirm(`Mark issue ${action}d?`)) return;
    setTriageIssueId(issue.id);
    try {
      const res = await fetch(`/api/v1/admin/enterprise/ai-operations/issues/${issue.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, ...(rejection_reason ? { rejection_reason } : {}) }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(`Triage failed: ${err.error ?? res.status}`);
        return;
      }
      toast.success(`Issue ${action}d`);
      await fetchDashboard();
    } finally {
      setTriageIssueId(null);
    }
  }, [fetchDashboard]);

  if (loading && !data) {
    return (
      <div className="space-y-6 max-w-7xl">
        <h1 className="text-2xl font-semibold">AI Operations</h1>
        <p className="text-sm text-muted-foreground">Loading dashboard…</p>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="space-y-6 max-w-7xl">
        <h1 className="text-2xl font-semibold">AI Operations</h1>
        <p className="text-sm text-rose-700">Failed to load dashboard. Check console + try again.</p>
        <Button onClick={fetchDashboard}>Retry</Button>
      </div>
    );
  }

  const enabled = Boolean(data.config?.enabled);
  const lastNightly = data.last_nightly_eval;
  const cfg = fullConfig;

  return (
    <div className="space-y-6 max-w-7xl">
      {/* ── Page header ─────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">AI Operations</h1>
          <p className="text-sm text-muted-foreground mt-1">
            One-page daily ops view. Auto-refreshes every 60s. Covers auto-heal
            status, config, post-merge watches, actions, overnight results, and
            pattern management.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={fetchDashboard}>Refresh</Button>
      </div>

      {/* ── Auto-Heal status + cron heartbeats ─────────────────────── */}
      <Card className={enabled ? "border-emerald-200" : "border-zinc-200"}>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-3">
                Auto-Heal Loop
                <Badge
                  variant="outline"
                  className={enabled
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                    : "bg-zinc-100 text-zinc-600 border-zinc-200"}
                >
                  {enabled ? "ENABLED" : "DISABLED"}
                </Badge>
              </CardTitle>
              <CardDescription>
                Budget ${Number(data.config?.budget_daily_usd ?? 0).toFixed(2)}/day
                · alert @ {(Number(data.config?.budget_alert_threshold_pct ?? 0) * 100).toFixed(0)}%
                · max {data.config?.max_fixes_per_day ?? 0} fixes/day
                · {data.config?.allowed_categories.length ?? 0} categories
                · {data.config?.blocked_paths.length ?? 0} blocked paths
              </CardDescription>
            </div>
            <Button
              size="sm"
              variant={enabled ? "destructive" : "default"}
              disabled={togglingLoop}
              onClick={handleLoopToggle}
            >
              {togglingLoop ? "…" : enabled ? "Disable" : "Enable"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Full config detail */}
          {cfg && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm border rounded-md p-3 bg-zinc-50">
              <Metric label="Budget / day" value={`$${Number(cfg.budget_daily_usd).toFixed(2)}`} />
              <Metric label="Alert threshold" value={`${(Number(cfg.budget_alert_threshold_pct) * 100).toFixed(0)}%`} />
              <Metric label="Max fixes / day" value={cfg.max_fixes_per_day} />
              <Metric label="Max / file / week" value={cfg.max_fixes_per_file_per_week} />
              <Metric label="Revert cooldown" value={`${cfg.cooldown_minutes_after_revert}m`} />
              <Metric label="Post-merge clean" value={`${cfg.post_merge_clean_hours}h`} />
              <Metric label="90d revert cap" value={`${(Number(cfg.rolling_90d_revert_rate_cap) * 100).toFixed(0)}%`} />
              <Metric label="Clean merges req" value={cfg.consecutive_clean_merges_required} />
              <div className="col-span-2 md:col-span-4">
                <p className="text-xs uppercase tracking-wider text-zinc-500 mb-1">
                  Allowed categories ({cfg.allowed_categories.length})
                </p>
                <div className="flex flex-wrap gap-1">
                  {cfg.allowed_categories.map((c) => (
                    <Badge key={c} variant="outline" className="font-mono text-[10px]">{c}</Badge>
                  ))}
                </div>
              </div>
              <div className="col-span-2 md:col-span-4">
                <p className="text-xs uppercase tracking-wider text-zinc-500 mb-1">
                  Blocked paths ({cfg.blocked_paths.length})
                </p>
                <div className="flex flex-wrap gap-1">
                  {cfg.blocked_paths.map((p) => (
                    <Badge key={p} variant="outline" className="font-mono text-[10px] bg-rose-50 text-rose-700 border-rose-200">{p}</Badge>
                  ))}
                </div>
              </div>
              <div className="col-span-2 md:col-span-4 text-xs text-zinc-400">
                Last updated {fmtDate(cfg.updated_at)}{cfg.updated_by ? ` by ${cfg.updated_by}` : ""}
              </div>
            </div>
          )}

          {/* Cron heartbeats */}
          <div>
            <p className="text-xs uppercase tracking-wider text-zinc-500 mb-2">Cron heartbeats (last 48h)</p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 text-xs">
              {EXPECTED_CRONS.map((c) => {
                const hb = data.cron_heartbeats[c.actor];
                return (
                  <div
                    key={c.actor}
                    className={`border rounded px-2 py-1 flex items-center gap-2 ${hb ? "bg-emerald-50 border-emerald-200" : "bg-amber-50 border-amber-200"}`}
                  >
                    <span className="font-mono text-[10px]">{hb ? "✓" : "—"}</span>
                    <span className="flex-1 truncate">{c.label}</span>
                    <span className="text-zinc-500">{hb ? relTime(hb.last_seen_at) : "no recent state"}</span>
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-zinc-400 mt-2">
              A cron that hasn&apos;t written an audit row in 48h isn&apos;t necessarily dead — most crons only write when they change state.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ── Post-merge watches ──────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle>Post-Merge Watches</CardTitle>
              <CardDescription>
                Fixes merged via auto-heal are watched for 48h post-deploy; any regression auto-opens a revert PR.
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <select
                value={watchStatus}
                onChange={(e) => setWatchStatus(e.target.value)}
                className="text-xs border rounded px-2 py-1"
              >
                <option value="watching">watching</option>
                <option value="clean">clean</option>
                <option value="reverted">reverted</option>
                <option value="monitor_down">monitor_down</option>
                <option value="">all</option>
              </select>
              <Button size="sm" variant="outline" onClick={fetchWatches}>Refresh</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {watches.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No watches for this status. Post-merge monitor writes here when an auto-heal PR merges.
            </p>
          ) : (
            <div className="border rounded-md divide-y">
              {watches.map((w) => (
                <div key={w.id} className="px-3 py-2 text-sm">
                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className={`font-mono text-[10px] ${WATCH_STATUS_TINT[w.status] ?? ""}`}>
                      {w.status}
                    </Badge>
                    <div className="flex-1 truncate">
                      <span className="font-medium">{w.ai_fixes?.title ?? "(fix removed)"}</span>
                      <span className="text-zinc-500 ml-2 text-xs">@ {shortSha(w.merged_commit_sha)}</span>
                    </div>
                    {w.regressions_detected > 0 && (
                      <Badge variant="outline" className="bg-rose-50 text-rose-700 border-rose-200">
                        {w.regressions_detected} regression{w.regressions_detected === 1 ? "" : "s"}
                      </Badge>
                    )}
                  </div>
                  <div className="mt-1 flex items-center gap-3 text-xs text-zinc-500">
                    <span>merged {fmtDate(w.merged_at)}</span>
                    <span>watching until {fmtDate(w.watch_until)}</span>
                    {w.auto_revert_pr_url && (
                      <a href={w.auto_revert_pr_url} className="text-rose-600 underline" target="_blank" rel="noreferrer">revert PR</a>
                    )}
                    {w.ai_fixes?.pr_url && (
                      <a href={w.ai_fixes.pr_url} className="text-sky-600 underline" target="_blank" rel="noreferrer">original PR</a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Actions needed ──────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Auto-heal PRs */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              Auto-Heal PRs
              <Badge variant="outline" className="bg-sky-50 text-sky-700 border-sky-200">
                {data.actions_needed.auto_heal_prs_open.length}
              </Badge>
            </CardTitle>
            <CardDescription>Awaiting your review on GitHub</CardDescription>
          </CardHeader>
          <CardContent>
            {data.actions_needed.auto_heal_prs_open.length === 0 ? (
              <p className="text-sm text-muted-foreground">None open.</p>
            ) : (
              <div className="space-y-2 text-sm">
                {data.actions_needed.auto_heal_prs_open.map((pr) => (
                  <div key={pr.id} className="border rounded p-2">
                    <div className="truncate font-medium">{pr.title ?? "(no title)"}</div>
                    <div className="flex items-center gap-2 mt-1 text-xs text-zinc-500">
                      <span>by {pr.author}</span>
                      <span>·</span>
                      <span>{relTime(pr.applied_at)}</span>
                      {pr.pr_url && (
                        <>
                          <span>·</span>
                          <a href={pr.pr_url} target="_blank" rel="noreferrer" className="text-sky-600 underline">open PR →</a>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Issues needing human */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              Issues Needing Human
              <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                {data.actions_needed.issues_needing_human.length}
              </Badge>
            </CardTitle>
            <CardDescription>Triage → resolved / dismissed / rejected</CardDescription>
          </CardHeader>
          <CardContent>
            {data.actions_needed.issues_needing_human.length === 0 ? (
              <p className="text-sm text-muted-foreground">None.</p>
            ) : (
              <div className="space-y-2 text-sm">
                {data.actions_needed.issues_needing_human.map((iss) => (
                  <div key={iss.id} className="border rounded p-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="font-mono text-[10px]">
                        {iss.severity_class ?? iss.source}
                      </Badge>
                      <span className="text-xs text-zinc-500">×{iss.occurrence_count}</span>
                    </div>
                    <div className="truncate mt-1">
                      {iss.description ?? iss.category ?? iss.target_symbol ?? iss.id}
                    </div>
                    <div className="flex gap-1 mt-2">
                      <Button size="sm" variant="outline" disabled={triageIssueId === iss.id} onClick={() => handleIssueTriage(iss, "resolve")}>Resolve</Button>
                      <Button size="sm" variant="outline" disabled={triageIssueId === iss.id} onClick={() => handleIssueTriage(iss, "dismiss")}>Dismiss</Button>
                      <Button size="sm" variant="outline" disabled={triageIssueId === iss.id} onClick={() => handleIssueTriage(iss, "reject")}>Reject</Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Safety flags — count + link only */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              Safety Flags
              <Badge
                variant="outline"
                className={data.actions_needed.safety_flags_open.length > 0
                  ? "bg-rose-50 text-rose-700 border-rose-200"
                  : "bg-emerald-50 text-emerald-700 border-emerald-200"}
              >
                {data.actions_needed.safety_flags_open.length}
              </Badge>
            </CardTitle>
            <CardDescription>Open critical/high — triage in Safety Flags</CardDescription>
          </CardHeader>
          <CardContent>
            {data.actions_needed.safety_flags_open.length === 0 ? (
              <p className="text-sm text-muted-foreground">All clear.</p>
            ) : (
              <p className="text-sm text-muted-foreground">
                {data.actions_needed.safety_flags_open.filter(f => f.severity === "critical").length} critical,{" "}
                {data.actions_needed.safety_flags_open.filter(f => f.severity === "high").length} high severity open.
              </p>
            )}
            <Link
              href="/admin/ai-health/quality/safety-flags"
              className="inline-block mt-3 text-xs text-sky-600 underline"
            >
              Triage safety flags →
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* ── Overnight summary ──────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Last 24h</CardTitle>
          <CardDescription>Overnight and today-so-far activity</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="border rounded p-3">
              <p className="text-xs uppercase tracking-wider text-zinc-500 mb-2">Last nightly eval</p>
              {!lastNightly ? (
                <p className="text-sm text-muted-foreground">None yet.</p>
              ) : (
                <div className="space-y-1 text-sm">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={`font-mono text-[10px] ${STATUS_TINT[lastNightly.status] ?? ""}`}>
                      {lastNightly.status}
                    </Badge>
                    <code className="text-xs">{shortSha(lastNightly.commit_sha)}</code>
                  </div>
                  <div className="text-xs text-zinc-500">
                    {lastNightly.passed}/{lastNightly.total} passed
                    {lastNightly.failed > 0 && <span className="text-rose-600"> · {lastNightly.failed} fail</span>}
                    {lastNightly.errored > 0 && <span className="text-amber-600"> · {lastNightly.errored} err</span>}
                  </div>
                  <div className="text-xs text-zinc-500">{fmtDate(lastNightly.started_at)}</div>
                  <Link href="/admin/ai-health/quality/eval-runs" className="text-xs text-sky-600 underline">All runs →</Link>
                </div>
              )}
            </div>

            <div className="border rounded p-3">
              <p className="text-xs uppercase tracking-wider text-zinc-500 mb-2">New issues (24h)</p>
              {Object.keys(data.last_24h.new_issues_by_source).length === 0 ? (
                <p className="text-sm text-muted-foreground">None.</p>
              ) : (
                <div className="space-y-1 text-sm">
                  {Object.entries(data.last_24h.new_issues_by_source).map(([src, n]) => (
                    <div key={src} className="flex items-center gap-2">
                      <Badge variant="outline" className="font-mono text-[10px]">{src}</Badge>
                      <span>{n}</span>
                    </div>
                  ))}
                  <div className="flex flex-wrap gap-1 mt-2">
                    {Object.entries(data.last_24h.new_issues_by_severity_class).map(([sev, n]) => (
                      <Badge key={sev} variant="outline" className="text-[10px]">{sev}: {n}</Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="border rounded p-3">
              <p className="text-xs uppercase tracking-wider text-zinc-500 mb-2">Drift alerts (24h)</p>
              <div className="text-2xl font-semibold">{data.last_24h.drift_alerts_total}</div>
              {Object.keys(data.last_24h.drift_alerts_by_dimension).length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {Object.entries(data.last_24h.drift_alerts_by_dimension).map(([dim, n]) => (
                    <Badge key={dim} variant="outline" className="text-[10px]">{dim}: {n}</Badge>
                  ))}
                </div>
              )}
              <Link href="/admin/ai-health/quality/drift" className="text-xs text-sky-600 underline block mt-2">Drift detail →</Link>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Pattern management ─────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Auto-Repair Patterns</CardTitle>
          <CardDescription>
            CQE pattern library. Only patterns with <code>status=active</code> participate when drift fires. Toggle requires super_admin.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {data.patterns.length === 0 ? (
            <p className="text-sm text-muted-foreground">No patterns in library. Seed via migration 051.</p>
          ) : (
            <div className="border rounded-md divide-y">
              {data.patterns.map((p) => (
                <div key={p.id} className="px-3 py-2 flex items-start gap-3 text-sm">
                  <Badge variant="outline" className={`font-mono text-[10px] ${PATTERN_STATUS_TINT[p.status] ?? ""}`}>
                    {p.status}
                  </Badge>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{p.pattern_name}</span>
                      <span className="text-xs text-zinc-500">patch: {(p.patch_spec as { type?: string } | null)?.type ?? "—"}</span>
                      <span className="text-xs text-zinc-400">· triggered {p.times_triggered}× ({p.times_merged} merged)</span>
                    </div>
                    <div className="text-xs text-zinc-500 mt-0.5 truncate">{p.description ?? "(no description)"}</div>
                    {p.affected_files && p.affected_files.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {p.affected_files.map((f) => (
                          <code key={f} className="text-[10px] bg-zinc-100 border rounded px-1">{f}</code>
                        ))}
                      </div>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant={p.status === "active" ? "destructive" : "default"}
                    disabled={togglingPatternId === p.id}
                    onClick={() => handlePatternToggle(p)}
                  >
                    {togglingPatternId === p.id ? "…" : p.status === "active" ? "Disable" : "Activate"}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Quick links ─────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dive deeper</CardTitle>
          <CardDescription>Detail pages for when something needs investigating</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
            <Link className="text-sky-600 underline" href="/admin/ai-health/quality">Chat Quality Hub</Link>
            <Link className="text-sky-600 underline" href="/admin/ai-health/quality/drift">Drift alerts</Link>
            <Link className="text-sky-600 underline" href="/admin/ai-health/quality/safety-flags">Safety flags</Link>
            <Link className="text-sky-600 underline" href="/admin/ai-health/quality/shadow-runs">Shadow runs</Link>
            <Link className="text-sky-600 underline" href="/admin/ai-health/quality/golden-set">Golden set</Link>
            <Link className="text-sky-600 underline" href="/admin/ai-health/quality/disagreements">Judge disagreements</Link>
            <Link className="text-sky-600 underline" href="/admin/ai-health/quality/evals">Eval suite overview</Link>
            <Link className="text-sky-600 underline" href="/admin/ai-health/quality/eval-runs">Eval runs</Link>
            <Link className="text-sky-600 underline" href="/admin/ai-health/quality/baselines">Baselines</Link>
            <Link className="text-sky-600 underline" href="/admin/ai-health/audit">Full audit log</Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
