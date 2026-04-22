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

interface Config {
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

interface AuditRow {
  id: string;
  actor: string;
  action: string;
  target_table: string;
  target_id: string | null;
  reason: string | null;
  created_at: string;
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

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function shortSha(sha: string | null): string {
  if (!sha) return "—";
  return sha.startsWith("PENDING_") ? sha : sha.slice(0, 7);
}

const WATCH_STATUS_TINT: Record<string, string> = {
  watching: "bg-sky-50 text-sky-700 border-sky-200",
  clean: "bg-emerald-50 text-emerald-700 border-emerald-200",
  reverted: "bg-rose-50 text-rose-700 border-rose-200",
  monitor_down: "bg-amber-50 text-amber-700 border-amber-200",
};

export default function AutoHealTab() {
  const [config, setConfig] = useState<Config | null>(null);
  const [configLoading, setConfigLoading] = useState(false);

  const [watches, setWatches] = useState<PostMergeWatch[]>([]);
  const [watchStatus, setWatchStatus] = useState<string>("watching");
  const [watchesLoading, setWatchesLoading] = useState(false);

  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);

  const fetchConfig = useCallback(async () => {
    setConfigLoading(true);
    try {
      const res = await fetch("/api/v1/admin/ai-health/config", {
        credentials: "include",
      });
      if (!res.ok) {
        toast.error("Failed to load config");
        return;
      }
      const data = await res.json();
      setConfig(data.config ?? null);
    } catch {
      toast.error("Config request failed");
    } finally {
      setConfigLoading(false);
    }
  }, []);

  const fetchWatches = useCallback(async () => {
    setWatchesLoading(true);
    try {
      const qs = new URLSearchParams();
      if (watchStatus) qs.set("status", watchStatus);
      qs.set("limit", "50");
      const res = await fetch(
        `/api/v1/admin/ai-health/post-merge-watches?${qs.toString()}`,
        { credentials: "include" },
      );
      if (!res.ok) {
        toast.error("Failed to load watches");
        return;
      }
      const data = await res.json();
      setWatches(data.watches ?? []);
    } catch {
      toast.error("Watches request failed");
    } finally {
      setWatchesLoading(false);
    }
  }, [watchStatus]);

  const fetchAudit = useCallback(async () => {
    setAuditLoading(true);
    try {
      const res = await fetch(
        "/api/v1/admin/ai-health/audit?limit=50",
        { credentials: "include" },
      );
      if (!res.ok) {
        toast.error("Failed to load audit log");
        return;
      }
      const data = await res.json();
      setAudit(data.audit ?? []);
    } catch {
      toast.error("Audit request failed");
    } finally {
      setAuditLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);
  useEffect(() => {
    fetchWatches();
  }, [fetchWatches]);
  useEffect(() => {
    fetchAudit();
  }, [fetchAudit]);

  return (
    <div className="space-y-6">
      {/* ── Kill-switch + config ───────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle>Auto-Heal Loop Configuration</CardTitle>
              <CardDescription>
                Read-only in Phase 0. Kill-switch toggle enabled in Phase 5
                (super_admin only).
              </CardDescription>
            </div>
            {config && (
              <Badge
                variant="outline"
                className={
                  config.enabled
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                    : "bg-zinc-100 text-zinc-600 border-zinc-200"
                }
              >
                {config.enabled ? "ENABLED" : "DISABLED"}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {configLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : !config ? (
            <p className="text-sm text-muted-foreground">
              Config not seeded. Run migration 092.
            </p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <Metric label="Budget / day" value={`$${Number(config.budget_daily_usd).toFixed(2)}`} />
              <Metric
                label="Alert threshold"
                value={`${(Number(config.budget_alert_threshold_pct) * 100).toFixed(0)}%`}
              />
              <Metric label="Max fixes / day" value={config.max_fixes_per_day} />
              <Metric
                label="Max / file / week"
                value={config.max_fixes_per_file_per_week}
              />
              <Metric
                label="Revert cooldown"
                value={`${config.cooldown_minutes_after_revert}m`}
              />
              <Metric
                label="Post-merge clean"
                value={`${config.post_merge_clean_hours}h`}
              />
              <Metric
                label="90d revert cap"
                value={`${(Number(config.rolling_90d_revert_rate_cap) * 100).toFixed(0)}%`}
              />
              <Metric
                label="Clean merges req"
                value={config.consecutive_clean_merges_required}
              />
              <div className="col-span-2 md:col-span-4">
                <p className="text-xs uppercase tracking-wider text-zinc-500 mb-1">
                  Allowed categories ({config.allowed_categories.length})
                </p>
                <div className="flex flex-wrap gap-1">
                  {config.allowed_categories.map((c) => (
                    <Badge key={c} variant="outline" className="font-mono text-[10px]">
                      {c}
                    </Badge>
                  ))}
                </div>
              </div>
              <div className="col-span-2 md:col-span-4">
                <p className="text-xs uppercase tracking-wider text-zinc-500 mb-1">
                  Blocked paths ({config.blocked_paths.length})
                </p>
                <div className="flex flex-wrap gap-1">
                  {config.blocked_paths.map((p) => (
                    <Badge
                      key={p}
                      variant="outline"
                      className="font-mono text-[10px] bg-rose-50 text-rose-700 border-rose-200"
                    >
                      {p}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Post-merge watches ─────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle>Post-Merge Watches</CardTitle>
              <CardDescription>
                Fixes merged via auto-heal are watched for 48h post-deploy;
                any regression auto-opens a revert PR.
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
              <Button size="sm" variant="outline" onClick={fetchWatches}>
                Refresh
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {watchesLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : watches.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No active watches. Phase 5 post-merge monitor writes here when an
              auto-heal PR merges.
            </p>
          ) : (
            <div className="border rounded-md divide-y">
              {watches.map((w) => (
                <div key={w.id} className="px-3 py-2 text-sm">
                  <div className="flex items-center gap-3">
                    <Badge
                      variant="outline"
                      className={`font-mono text-[10px] ${WATCH_STATUS_TINT[w.status] ?? ""}`}
                    >
                      {w.status}
                    </Badge>
                    <div className="flex-1 truncate">
                      <span className="font-medium">
                        {w.ai_fixes?.title ?? "(fix removed)"}
                      </span>
                      <span className="text-zinc-500 ml-2 text-xs">
                        @ {shortSha(w.merged_commit_sha)}
                      </span>
                    </div>
                    {w.regressions_detected > 0 && (
                      <Badge variant="outline" className="bg-rose-50 text-rose-700 border-rose-200">
                        {w.regressions_detected} regression
                        {w.regressions_detected === 1 ? "" : "s"}
                      </Badge>
                    )}
                  </div>
                  <div className="mt-1 flex items-center gap-3 text-xs text-zinc-500">
                    <span>merged {fmtDate(w.merged_at)}</span>
                    <span>watching until {fmtDate(w.watch_until)}</span>
                    {w.auto_revert_pr_url && (
                      <a
                        href={w.auto_revert_pr_url}
                        className="text-rose-600 underline"
                        target="_blank"
                        rel="noreferrer"
                      >
                        revert PR
                      </a>
                    )}
                    {w.ai_fixes?.pr_url && (
                      <a
                        href={w.ai_fixes.pr_url}
                        className="text-sky-600 underline"
                        target="_blank"
                        rel="noreferrer"
                      >
                        original PR
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Audit log ──────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle>Audit Log</CardTitle>
              <CardDescription>
                Append-only record of config changes, fix state transitions,
                baseline promotions. Last 50 rows.
              </CardDescription>
            </div>
            <Button size="sm" variant="outline" onClick={fetchAudit}>
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {auditLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : audit.length === 0 ? (
            <p className="text-sm text-muted-foreground">No audit entries yet.</p>
          ) : (
            <div className="border rounded-md divide-y">
              {audit.map((row) => (
                <div key={row.id} className="px-3 py-2 text-sm">
                  <div className="flex items-baseline gap-3">
                    <Badge variant="outline" className="font-mono text-[10px]">
                      {row.action}
                    </Badge>
                    <span className="text-xs text-zinc-500">
                      {row.target_table}
                    </span>
                    <span className="text-xs text-zinc-400 ml-auto">
                      {fmtDate(row.created_at)}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-3 text-xs">
                    <span className="text-zinc-600">{row.actor}</span>
                    {row.reason && (
                      <span className="text-zinc-500 italic truncate">
                        {row.reason}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Metric({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wider text-zinc-500 mb-0.5">
        {label}
      </p>
      <p className="font-mono text-sm">{value}</p>
    </div>
  );
}
