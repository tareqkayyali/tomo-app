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

export default function EvalRunsPage() {
  const [runs, setRuns] = useState<EvalRun[]>([]);
  const [loading, setLoading] = useState(false);
  const [triggerFilter, setTriggerFilter] = useState<string>("");

  const fetchRuns = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ limit: "100" });
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
      setLoading(false);
    }
  }, [triggerFilter]);

  useEffect(() => {
    fetchRuns();
  }, [fetchRuns]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Eval Runs</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Every suite invocation from PR CI, nightly cron, and manual
          triggers. Each row writes to <code>ai_eval_runs</code> and its
          per-scenario results to <code>ai_eval_results</code>.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle>Recent runs</CardTitle>
              <CardDescription>
                Newest first. Failed runs include per-scenario detail on the
                drill-in (Phase 6). Cost totals are live Anthropic spend.
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
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : runs.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No runs yet.
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
