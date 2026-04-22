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

// Types match the /api/v1/admin/ai-health/eval-runs + /baselines response shapes.

interface EvalRun {
  id: string;
  trigger: "pr" | "nightly" | "pre_deploy" | "manual" | "auto_heal_reeval";
  suite_set: string[];
  commit_sha: string | null;
  branch: string | null;
  total: number;
  passed: number;
  failed: number;
  errored: number;
  cost_usd_total: number | string | null;
  started_at: string;
  finished_at: string | null;
  status: "running" | "passed" | "failed" | "errored" | "aborted";
  report_url: string | null;
}

interface Baseline {
  id: string;
  kind: "active" | "long_term_anchor";
  commit_sha: string;
  promoted_at: string;
  promoted_by: string;
  consecutive_green_nights: number | null;
  behavior_fingerprint: string | null;
  drift_vs_anchor_pct: number | string | null;
  notes: string | null;
}

interface BaselineHistoryRow {
  id: string;
  kind: string;
  commit_sha: string;
  promoted_at: string;
  promoted_by: string;
  is_retired: boolean;
  retired_at: string | null;
}

const STATUS_TINT: Record<string, string> = {
  passed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  failed: "bg-rose-50 text-rose-700 border-rose-200",
  errored: "bg-amber-50 text-amber-700 border-amber-200",
  running: "bg-sky-50 text-sky-700 border-sky-200",
  aborted: "bg-zinc-100 text-zinc-600 border-zinc-200",
};

function shortSha(sha: string | null): string {
  if (!sha) return "—";
  return sha.startsWith("PENDING_") ? sha : sha.slice(0, 7);
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function fmtDuration(startIso: string, endIso: string | null): string {
  if (!endIso) return "—";
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "—";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1000)}s`;
}

export default function EvalSystemTab() {
  const [runs, setRuns] = useState<EvalRun[]>([]);
  const [runsLoading, setRunsLoading] = useState(false);
  const [triggerFilter, setTriggerFilter] = useState<string>("");

  const [active, setActive] = useState<Baseline | null>(null);
  const [anchor, setAnchor] = useState<Baseline | null>(null);
  const [history, setHistory] = useState<BaselineHistoryRow[]>([]);
  const [baselinesLoading, setBaselinesLoading] = useState(false);

  const fetchRuns = useCallback(async () => {
    setRunsLoading(true);
    try {
      const qs = new URLSearchParams({ limit: "50" });
      if (triggerFilter) qs.set("trigger", triggerFilter);
      const res = await fetch(
        `/api/v1/admin/ai-health/eval-runs?${qs.toString()}`,
        { credentials: "include" },
      );
      if (!res.ok) {
        toast.error("Failed to load eval runs");
        return;
      }
      const data = await res.json();
      setRuns(data.runs ?? []);
    } catch {
      toast.error("Eval runs request failed");
    } finally {
      setRunsLoading(false);
    }
  }, [triggerFilter]);

  const fetchBaselines = useCallback(async () => {
    setBaselinesLoading(true);
    try {
      const res = await fetch("/api/v1/admin/ai-health/baselines", {
        credentials: "include",
      });
      if (!res.ok) {
        toast.error("Failed to load baselines");
        return;
      }
      const data = await res.json();
      setActive(data.active ?? null);
      setAnchor(data.long_term_anchor ?? null);
      setHistory(data.history ?? []);
    } catch {
      toast.error("Baselines request failed");
    } finally {
      setBaselinesLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRuns();
  }, [fetchRuns]);

  useEffect(() => {
    fetchBaselines();
  }, [fetchBaselines]);

  return (
    <div className="space-y-6">
      {/* ── Baselines ────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Regression Baselines</CardTitle>
          <CardDescription>
            Dual anchor. <code>active</code> auto-advances after 3 consecutive green
            nightlies (Phase 1). <code>long_term_anchor</code> advances only by
            super_admin manual promotion (Phase 5).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {baselinesLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <BaselineCard baseline={active} label="Active (rolling)" />
              <BaselineCard baseline={anchor} label="Long-term anchor" />
            </div>
          )}

          {history.length > 0 && (
            <div className="mt-6">
              <h4 className="text-sm font-medium mb-2">Promotion history</h4>
              <div className="border rounded-md divide-y">
                {history.slice(0, 10).map((row) => (
                  <div
                    key={row.id}
                    className="px-3 py-2 text-xs flex items-center gap-3"
                  >
                    <Badge variant="outline" className="font-mono">
                      {row.kind}
                    </Badge>
                    <code className="text-zinc-600">{shortSha(row.commit_sha)}</code>
                    <span className="text-zinc-500">{fmtDate(row.promoted_at)}</span>
                    <span className="text-zinc-500 truncate">
                      by {row.promoted_by}
                    </span>
                    {row.is_retired && (
                      <Badge variant="secondary" className="ml-auto">
                        retired
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Recent Runs ──────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle>Eval Runs</CardTitle>
              <CardDescription>
                Each row is one suite invocation. Phase 1+ writes here; empty
                until Phase 1 lands.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={triggerFilter}
                onChange={(e) => setTriggerFilter(e.target.value)}
                className="text-xs border rounded px-2 py-1"
              >
                <option value="">all triggers</option>
                <option value="pr">pr</option>
                <option value="nightly">nightly</option>
                <option value="pre_deploy">pre_deploy</option>
                <option value="manual">manual</option>
                <option value="auto_heal_reeval">auto_heal_reeval</option>
              </select>
              <Button size="sm" variant="outline" onClick={fetchRuns}>
                Refresh
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {runsLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : runs.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No runs yet. Phase 1 will begin writing here once
              <code className="mx-1">runner.py --persist</code> is wired into CI.
            </p>
          ) : (
            <div className="border rounded-md divide-y">
              <div className="px-3 py-2 grid grid-cols-[auto_1fr_auto_auto_auto_auto_auto] gap-3 text-xs font-medium text-zinc-500 uppercase tracking-wider">
                <span>Status</span>
                <span>Trigger / commit</span>
                <span>Pass</span>
                <span>Fail</span>
                <span>Err</span>
                <span>Duration</span>
                <span>Started</span>
              </div>
              {runs.map((run) => (
                <div
                  key={run.id}
                  className="px-3 py-2 grid grid-cols-[auto_1fr_auto_auto_auto_auto_auto] gap-3 text-sm items-center"
                >
                  <Badge
                    variant="outline"
                    className={`font-mono text-[10px] ${STATUS_TINT[run.status] ?? ""}`}
                  >
                    {run.status}
                  </Badge>
                  <div className="truncate">
                    <span className="font-medium">{run.trigger}</span>
                    <span className="text-zinc-400 mx-1">·</span>
                    <code className="text-xs text-zinc-600">
                      {shortSha(run.commit_sha)}
                    </code>
                    {run.suite_set?.length > 0 && (
                      <span className="text-xs text-zinc-500 ml-2">
                        [{run.suite_set.join(", ")}]
                      </span>
                    )}
                  </div>
                  <span className="tabular-nums text-emerald-700">
                    {run.passed}
                  </span>
                  <span className="tabular-nums text-rose-700">{run.failed}</span>
                  <span className="tabular-nums text-amber-700">
                    {run.errored}
                  </span>
                  <span className="tabular-nums text-xs text-zinc-500">
                    {fmtDuration(run.started_at, run.finished_at)}
                  </span>
                  <span className="text-xs text-zinc-500">
                    {fmtDate(run.started_at)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function BaselineCard({
  baseline,
  label,
}: {
  baseline: Baseline | null;
  label: string;
}) {
  if (!baseline) {
    return (
      <div className="border rounded-md p-4 bg-zinc-50">
        <p className="text-xs uppercase tracking-wider text-zinc-500 mb-1">
          {label}
        </p>
        <p className="text-sm text-muted-foreground">not set</p>
      </div>
    );
  }
  const isPlaceholder = baseline.commit_sha.startsWith("PENDING_");
  return (
    <div
      className={`border rounded-md p-4 ${isPlaceholder ? "bg-amber-50 border-amber-200" : "bg-emerald-50 border-emerald-200"}`}
    >
      <p className="text-xs uppercase tracking-wider text-zinc-500 mb-1">
        {label}
      </p>
      <div className="flex items-baseline gap-2">
        <code className="font-mono text-sm">{shortSha(baseline.commit_sha)}</code>
        {isPlaceholder && (
          <Badge variant="outline" className="text-[10px]">
            placeholder
          </Badge>
        )}
      </div>
      <div className="mt-2 space-y-0.5 text-xs text-zinc-600">
        <div>
          <span className="text-zinc-500">Promoted:</span>{" "}
          {fmtDate(baseline.promoted_at)} by {baseline.promoted_by}
        </div>
        {baseline.consecutive_green_nights != null && (
          <div>
            <span className="text-zinc-500">Green nights:</span>{" "}
            {baseline.consecutive_green_nights}
          </div>
        )}
        {baseline.drift_vs_anchor_pct != null && (
          <div>
            <span className="text-zinc-500">Drift vs anchor:</span>{" "}
            {Number(baseline.drift_vs_anchor_pct).toFixed(2)}%
          </div>
        )}
        {baseline.notes && (
          <div className="text-zinc-500 italic mt-1">{baseline.notes}</div>
        )}
      </div>
    </div>
  );
}
