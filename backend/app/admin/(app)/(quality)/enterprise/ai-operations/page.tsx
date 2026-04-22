"use client";

import { useCallback, useEffect, useState } from "react";
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

// ── Types (mirror /api/v1/admin/enterprise/ai-operations/dashboard) ──

interface DashboardConfig {
  enabled: boolean;
  budget_daily_usd: number | string;
  budget_alert_threshold_pct: number | string;
  max_fixes_per_day: number;
  allowed_categories: string[];
  blocked_paths: string[];
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

interface AuditEvent {
  id: string;
  actor: string;
  action: string;
  target_table: string;
  target_id: string | null;
  reason: string | null;
  created_at: string;
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
  audit_feed: AuditEvent[];
  cron_heartbeats: Record<string, { last_seen_at: string; last_action: string }>;
}

// ── Helpers ──────────────────────────────────────────────────────────

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
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

// Crons expected to fire regularly + their cron actor strings
const EXPECTED_CRONS: Array<{ actor: string; label: string }> = [
  { actor: "cron:quality-drift-check", label: "Drift Check (nightly)" },
  { actor: "cron:advance_eval_baseline", label: "Baseline Rollover (daily)" },
  { actor: "cron:auto-repair-scan", label: "CQE Auto-Repair (6h)" },
  { actor: "cron:auto-heal-apply", label: "Auto-Heal Applier (30m)" },
  { actor: "cron:auto-heal-monitor", label: "Post-Merge Monitor (1h)" },
  { actor: "cron:shadow-evaluate", label: "Shadow Evaluator (15m)" },
  { actor: "cron:golden-set-curate", label: "Golden-Set Curator (weekly)" },
];

// ── Component ────────────────────────────────────────────────────────

export default function AiOperationsPage() {
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [togglingLoop, setTogglingLoop] = useState(false);
  const [togglingPatternId, setTogglingPatternId] = useState<string | null>(null);
  const [triageIssueId, setTriageIssueId] = useState<string | null>(null);

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        "/api/v1/admin/enterprise/ai-operations/dashboard",
        { credentials: "include" },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(`Dashboard load failed: ${err.error ?? res.status}`);
        return;
      }
      const body = (await res.json()) as DashboardResponse;
      setData(body);
    } catch (e) {
      toast.error(`Dashboard request failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
    // Auto-refresh every 60s so the admin sees organic activity tick in
    const iv = setInterval(fetchDashboard, 60_000);
    return () => clearInterval(iv);
  }, [fetchDashboard]);

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
        body: JSON.stringify({
          enabled: next,
          ...(reason.trim() ? { reason: reason.trim() } : {}),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(`Toggle failed: ${err.error ?? res.status}`);
        return;
      }
      toast.success(`Auto-heal ${next ? "ENABLED" : "DISABLED"}`);
      await fetchDashboard();
    } finally {
      setTogglingLoop(false);
    }
  }, [data, fetchDashboard]);

  const handlePatternToggle = useCallback(
    async (pattern: PatternRow) => {
      const next = pattern.status === "active" ? "disabled" : "active";
      if (!window.confirm(`Set pattern "${pattern.pattern_name}" to ${next.toUpperCase()}?`)) return;
      const reason = window.prompt("Reason (audited). Leave blank for default.", "");
      if (reason === null) return;
      setTogglingPatternId(pattern.id);
      try {
        const res = await fetch(
          `/api/v1/admin/enterprise/ai-operations/patterns/${pattern.id}`,
          {
            method: "PATCH",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              status: next,
              ...(reason.trim() ? { reason: reason.trim() } : {}),
            }),
          },
        );
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
    },
    [fetchDashboard],
  );

  const handleIssueTriage = useCallback(
    async (issue: NeedsHumanIssue, action: "resolve" | "dismiss" | "reject") => {
      let status: string;
      let rejection_reason: string | undefined;
      if (action === "resolve") status = "resolved";
      else if (action === "dismiss") status = "dismissed";
      else {
        status = "rejected_with_justification";
        const r = window.prompt(
          "Rejection reason (required, shown in audit + future dedup):",
          "",
        );
        if (!r || !r.trim()) {
          toast.error("Rejection reason required");
          return;
        }
        rejection_reason = r.trim();
      }
      if (action !== "reject" && !window.confirm(`Mark issue ${action}d?`)) return;
      setTriageIssueId(issue.id);
      try {
        const res = await fetch(
          `/api/v1/admin/enterprise/ai-operations/issues/${issue.id}`,
          {
            method: "PATCH",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              status,
              ...(rejection_reason ? { rejection_reason } : {}),
            }),
          },
        );
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
    },
    [fetchDashboard],
  );

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
        <p className="text-sm text-rose-700">
          Failed to load dashboard. Check console + try again.
        </p>
        <Button onClick={fetchDashboard}>Retry</Button>
      </div>
    );
  }

  const enabled = Boolean(data.config?.enabled);
  const lastNightly = data.last_nightly_eval;

  return (
    <div className="space-y-6 max-w-7xl">
      {/* ── Page header ─────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">AI Operations</h1>
          <p className="text-sm text-muted-foreground mt-1">
            One-page daily ops view. Auto-refreshes every 60s. Covers status,
            actions, overnight results, pattern management, and the audit feed.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={fetchDashboard}>
          Refresh
        </Button>
      </div>

      {/* ── Status header ───────────────────────────────────────────── */}
      <Card className={enabled ? "border-emerald-200" : "border-zinc-200"}>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-3">
                Auto-Heal Loop
                <Badge
                  variant="outline"
                  className={
                    enabled
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                      : "bg-zinc-100 text-zinc-600 border-zinc-200"
                  }
                >
                  {enabled ? "ENABLED" : "DISABLED"}
                </Badge>
              </CardTitle>
              <CardDescription>
                Budget ${Number(data.config?.budget_daily_usd ?? 0).toFixed(2)}/day
                · alert @ {(Number(data.config?.budget_alert_threshold_pct ?? 0) * 100).toFixed(0)}%
                · max {data.config?.max_fixes_per_day ?? 0} fixes/day
                · {data.config?.allowed_categories.length ?? 0} allowed categories
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

        {/* Cron heartbeats */}
        <CardContent>
          <p className="text-xs uppercase tracking-wider text-zinc-500 mb-2">
            Cron heartbeats (last 48h)
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 text-xs">
            {EXPECTED_CRONS.map((c) => {
              const hb = data.cron_heartbeats[c.actor];
              return (
                <div
                  key={c.actor}
                  className={`border rounded px-2 py-1 flex items-center gap-2 ${
                    hb ? "bg-emerald-50 border-emerald-200" : "bg-amber-50 border-amber-200"
                  }`}
                >
                  <span className="font-mono text-[10px]">
                    {hb ? "✓" : "—"}
                  </span>
                  <span className="flex-1 truncate">{c.label}</span>
                  <span className="text-zinc-500">
                    {hb ? relTime(hb.last_seen_at) : "no recent state"}
                  </span>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-zinc-400 mt-2">
            A cron that hasn&apos;t written an audit row in 48h isn&apos;t
            necessarily dead — most crons only write when they change state.
            Dig into logs if a specific cron is expected to have fired.
          </p>
        </CardContent>
      </Card>

      {/* ── Actions needed (3 side-by-side cards) ──────────────────── */}
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
                    <div className="truncate font-medium">
                      {pr.title ?? "(no title)"}
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-xs text-zinc-500">
                      <span>by {pr.author}</span>
                      <span>·</span>
                      <span>{relTime(pr.applied_at)}</span>
                      {pr.pr_url && (
                        <>
                          <span>·</span>
                          <a
                            href={pr.pr_url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-sky-600 underline"
                          >
                            open PR →
                          </a>
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
                      <span className="text-xs text-zinc-500">
                        ×{iss.occurrence_count}
                      </span>
                    </div>
                    <div className="truncate mt-1">
                      {iss.description ?? iss.category ?? iss.target_symbol ?? iss.id}
                    </div>
                    <div className="flex gap-1 mt-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={triageIssueId === iss.id}
                        onClick={() => handleIssueTriage(iss, "resolve")}
                      >
                        Resolve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={triageIssueId === iss.id}
                        onClick={() => handleIssueTriage(iss, "dismiss")}
                      >
                        Dismiss
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={triageIssueId === iss.id}
                        onClick={() => handleIssueTriage(iss, "reject")}
                      >
                        Reject
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Safety flags */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              Safety Flags
              <Badge
                variant="outline"
                className={
                  data.actions_needed.safety_flags_open.length > 0
                    ? "bg-rose-50 text-rose-700 border-rose-200"
                    : "bg-emerald-50 text-emerald-700 border-emerald-200"
                }
              >
                {data.actions_needed.safety_flags_open.length}
              </Badge>
            </CardTitle>
            <CardDescription>Open critical/high — inspect → resolve</CardDescription>
          </CardHeader>
          <CardContent>
            {data.actions_needed.safety_flags_open.length === 0 ? (
              <p className="text-sm text-muted-foreground">All clear.</p>
            ) : (
              <div className="space-y-1 text-sm">
                {data.actions_needed.safety_flags_open.map((f) => (
                  <div key={f.id} className="border rounded p-2 flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className={
                        f.severity === "critical"
                          ? "bg-rose-50 text-rose-700 border-rose-200"
                          : "bg-amber-50 text-amber-700 border-amber-200"
                      }
                    >
                      {f.severity}
                    </Badge>
                    <span className="text-xs">{f.flag_type}</span>
                    <span className="text-xs text-zinc-500 ml-auto">
                      {relTime(f.created_at)}
                    </span>
                  </div>
                ))}
                <a
                  href="/admin/enterprise/quality/safety-flags"
                  className="block text-xs text-sky-600 underline mt-2"
                >
                  Full list →
                </a>
              </div>
            )}
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
            {/* Nightly eval */}
            <div className="border rounded p-3">
              <p className="text-xs uppercase tracking-wider text-zinc-500 mb-2">
                Last nightly eval
              </p>
              {!lastNightly ? (
                <p className="text-sm text-muted-foreground">None yet.</p>
              ) : (
                <div className="space-y-1 text-sm">
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className={`font-mono text-[10px] ${STATUS_TINT[lastNightly.status] ?? ""}`}
                    >
                      {lastNightly.status}
                    </Badge>
                    <code className="text-xs">{shortSha(lastNightly.commit_sha)}</code>
                  </div>
                  <div className="text-xs text-zinc-500">
                    {lastNightly.passed}/{lastNightly.total} passed
                    {lastNightly.failed > 0 && (
                      <span className="text-rose-600"> · {lastNightly.failed} fail</span>
                    )}
                    {lastNightly.errored > 0 && (
                      <span className="text-amber-600"> · {lastNightly.errored} err</span>
                    )}
                  </div>
                  <div className="text-xs text-zinc-500">
                    {fmtDate(lastNightly.started_at)}
                  </div>
                  <a
                    href="/admin/enterprise/evaluations/runs"
                    className="text-xs text-sky-600 underline"
                  >
                    All runs →
                  </a>
                </div>
              )}
            </div>

            {/* New issues */}
            <div className="border rounded p-3">
              <p className="text-xs uppercase tracking-wider text-zinc-500 mb-2">
                New issues (24h)
              </p>
              {Object.keys(data.last_24h.new_issues_by_source).length === 0 ? (
                <p className="text-sm text-muted-foreground">None.</p>
              ) : (
                <div className="space-y-1 text-sm">
                  {Object.entries(data.last_24h.new_issues_by_source).map(([src, n]) => (
                    <div key={src} className="flex items-center gap-2">
                      <Badge variant="outline" className="font-mono text-[10px]">
                        {src}
                      </Badge>
                      <span>{n}</span>
                    </div>
                  ))}
                  <div className="flex flex-wrap gap-1 mt-2">
                    {Object.entries(data.last_24h.new_issues_by_severity_class).map(([sev, n]) => (
                      <Badge key={sev} variant="outline" className="text-[10px]">
                        {sev}: {n}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Drift alerts */}
            <div className="border rounded p-3">
              <p className="text-xs uppercase tracking-wider text-zinc-500 mb-2">
                Drift alerts (24h)
              </p>
              <div className="text-2xl font-semibold">
                {data.last_24h.drift_alerts_total}
              </div>
              {Object.keys(data.last_24h.drift_alerts_by_dimension).length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {Object.entries(data.last_24h.drift_alerts_by_dimension).map(([dim, n]) => (
                    <Badge key={dim} variant="outline" className="text-[10px]">
                      {dim}: {n}
                    </Badge>
                  ))}
                </div>
              )}
              <a
                href="/admin/enterprise/quality/drift"
                className="text-xs text-sky-600 underline block mt-2"
              >
                Drift detail →
              </a>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Pattern management ─────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Auto-Repair Patterns</CardTitle>
          <CardDescription>
            CQE pattern library. Only patterns with <code>status=active</code>
            {" "}participate when drift fires. Toggle requires super_admin.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {data.patterns.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No patterns in library. Seed via migration 051.
            </p>
          ) : (
            <div className="border rounded-md divide-y">
              {data.patterns.map((p) => (
                <div key={p.id} className="px-3 py-2 flex items-start gap-3 text-sm">
                  <Badge
                    variant="outline"
                    className={`font-mono text-[10px] ${PATTERN_STATUS_TINT[p.status] ?? ""}`}
                  >
                    {p.status}
                  </Badge>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{p.pattern_name}</span>
                      <span className="text-xs text-zinc-500">
                        patch: {(p.patch_spec as { type?: string } | null)?.type ?? "—"}
                      </span>
                      <span className="text-xs text-zinc-400">
                        · triggered {p.times_triggered}× ({p.times_merged} merged)
                      </span>
                    </div>
                    <div className="text-xs text-zinc-500 mt-0.5 truncate">
                      {p.description ?? "(no description)"}
                    </div>
                    {p.affected_files && p.affected_files.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {p.affected_files.map((f) => (
                          <code
                            key={f}
                            className="text-[10px] bg-zinc-100 border rounded px-1"
                          >
                            {f}
                          </code>
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
                    {togglingPatternId === p.id
                      ? "…"
                      : p.status === "active"
                        ? "Disable"
                        : "Activate"}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Recent activity feed ───────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Recent activity</CardTitle>
          <CardDescription>Last 30 audit events, newest first</CardDescription>
        </CardHeader>
        <CardContent>
          {data.audit_feed.length === 0 ? (
            <p className="text-sm text-muted-foreground">No events yet.</p>
          ) : (
            <div className="border rounded-md divide-y">
              {data.audit_feed.map((ev) => (
                <div key={ev.id} className="px-3 py-2 text-sm">
                  <div className="flex items-baseline gap-3">
                    <Badge variant="outline" className="font-mono text-[10px]">
                      {ev.action}
                    </Badge>
                    <span className="text-xs text-zinc-500">{ev.target_table}</span>
                    <span className="text-xs text-zinc-400 ml-auto">
                      {relTime(ev.created_at)}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-3 text-xs">
                    <span className="text-zinc-600 font-mono text-[10px]">
                      {ev.actor}
                    </span>
                    {ev.reason && (
                      <span className="text-zinc-500 italic truncate">{ev.reason}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Deep links ─────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dive deeper</CardTitle>
          <CardDescription>
            Detail pages for when something on this dashboard needs investigating
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
            <a className="text-sky-600 underline" href="/admin/enterprise/quality">
              Chat Quality Hub
            </a>
            <a className="text-sky-600 underline" href="/admin/enterprise/quality/drift">
              Drift alerts
            </a>
            <a className="text-sky-600 underline" href="/admin/enterprise/quality/safety-flags">
              Safety flags
            </a>
            <a className="text-sky-600 underline" href="/admin/enterprise/quality/shadow-runs">
              Shadow runs
            </a>
            <a className="text-sky-600 underline" href="/admin/enterprise/quality/golden-set">
              Golden set
            </a>
            <a className="text-sky-600 underline" href="/admin/enterprise/quality/disagreements">
              Judge disagreements
            </a>
            <a className="text-sky-600 underline" href="/admin/enterprise/quality/auto-heal">
              Auto-Heal detail
            </a>
            <a className="text-sky-600 underline" href="/admin/enterprise/evaluations">
              Eval Dashboard
            </a>
            <a className="text-sky-600 underline" href="/admin/enterprise/evaluations/runs">
              Eval Runs
            </a>
            <a className="text-sky-600 underline" href="/admin/enterprise/evaluations/baselines">
              Baselines
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
