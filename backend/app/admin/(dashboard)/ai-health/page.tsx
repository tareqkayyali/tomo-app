"use client";

import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

// ── Types ───────────────────────────────────────────────────────────────────

interface TrendData {
  prev_week_count: number;
  this_week_count: number;
  direction: "improving" | "worsening" | "stable" | "new";
  pct_change: number | null;
  consecutive_weeks_present: number;
  alert: boolean;
}

interface Fix {
  id: string;
  priority: number;
  fix_type: string;
  title: string;
  description: string;
  file_path: string;
  code_change: string;
  expected_impact: string;
  langsmith_metric: string;
  confidence: number;
  status: string;
  applied_at: string | null;
  created_at: string;
}

interface Issue {
  id: string;
  week_start: string;
  issue_type: string;
  severity: string;
  affected_count: number;
  pattern_summary: string;
  metadata: Record<string, unknown>;
  trend_data: TrendData | null;
  recurrence_count: number;
  last_seen_at: string;
  status: string;
  fixes: Fix[];
}

interface Digest {
  month_start?: string;
  narrative?: string | null;
  top_issues?: Array<{ issue_type: string; total_affected: number }>;
  top_fixes?: Array<Record<string, unknown>>;
  stats?: Record<string, unknown>;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const SEV_STYLE: Record<string, string> = {
  critical: "border-red-500/30 bg-red-500/10",
  high: "border-orange-500/30 bg-orange-500/10",
  medium: "border-yellow-500/30 bg-yellow-500/10",
  low: "border-zinc-700 bg-zinc-800/50",
};

const SEV_BADGE: Record<string, string> = {
  critical: "bg-red-500/20 text-red-400 border-red-500/30",
  high: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  medium: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  low: "bg-zinc-700 text-zinc-400 border-zinc-600",
};

const P_LABEL: Record<number, string> = {
  1: "P1 Safety",
  2: "P2 Cost",
  3: "P3 Quality",
  4: "P4 UX",
};

function TrendBadge({ trend }: { trend: TrendData | null }) {
  if (!trend) return null;
  const { direction, pct_change, alert } = trend;
  if (direction === "improving")
    return (
      <span className="text-xs text-green-400 font-medium">
        {Math.abs(pct_change ?? 0).toFixed(0)}% better
      </span>
    );
  if (direction === "worsening")
    return (
      <span
        className={`text-xs font-medium ${alert ? "text-red-400" : "text-orange-400"}`}
      >
        {(pct_change ?? 0).toFixed(0)}% worse{alert ? " !" : ""}
      </span>
    );
  if (direction === "new")
    return <span className="text-xs text-blue-400 font-medium">new this week</span>;
  return <span className="text-xs text-zinc-500">stable</span>;
}

// ── Main Page ───────────────────────────────────────────────────────────────

export default function AIHealthPage() {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [digest, setDigest] = useState<Digest>({});
  const [loading, setLoading] = useState(true);
  const [collecting, setCollecting] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [issuesRes, digestRes] = await Promise.all([
        fetch("/api/v1/admin/ai-health/issues", { credentials: "include" }),
        fetch("/api/v1/admin/ai-health/digest/latest", { credentials: "include" }),
      ]);

      if (issuesRes.ok) {
        const data = await issuesRes.json();
        setIssues(data.issues ?? []);
      }
      if (digestRes.ok) {
        setDigest(await digestRes.json());
      }
    } catch (e) {
      toast.error("Failed to load AI health data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const triggerCollection = async () => {
    setCollecting(true);
    try {
      const res = await fetch("/api/v1/admin/ai-health/collect", {
        method: "POST",
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        toast.success(
          `Collection complete: ${data.runs_analyzed} runs, ${data.issues_detected} issues, ${data.fixes_generated} fixes`
        );
        fetchData();
      } else {
        toast.error("Collection failed");
      }
    } catch {
      toast.error("Collection request failed");
    } finally {
      setCollecting(false);
    }
  };

  const markFixApplied = async (fixId: string) => {
    try {
      const res = await fetch(`/api/v1/admin/ai-health/fixes/${fixId}/status`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "applied", applied_by: "admin" }),
      });
      if (res.ok) {
        toast.success("Fix marked as applied");
        fetchData();
      } else {
        toast.error("Failed to update fix status");
      }
    } catch {
      toast.error("Request failed");
    }
  };

  const markFixVerified = async (fixId: string) => {
    try {
      const res = await fetch(`/api/v1/admin/ai-health/fixes/${fixId}/status`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "verified" }),
      });
      if (res.ok) {
        toast.success("Fix verified — feedback sent to LangSmith");
        fetchData();
      } else {
        toast.error("Failed to verify fix");
      }
    } catch {
      toast.error("Request failed");
    }
  };

  // Categorize issues
  const open = issues.filter((i) => i.status === "open");
  const pending = issues.filter((i) => i.status === "fix_generated");
  const applied = issues.filter((i) => i.status === "fix_applied");
  const alerts = issues.filter((i) => {
    const t = i.trend_data;
    return t && typeof t === "object" && "alert" in t && t.alert;
  });

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold">AI Health</h1>
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">AI Health</h1>
          <p className="text-sm text-muted-foreground mt-1">
            LangSmith feedback loop — issue detection, fix recommendations, and quality
            trends
          </p>
        </div>
        <Button
          onClick={triggerCollection}
          disabled={collecting}
          variant="outline"
          size="sm"
        >
          {collecting ? "Collecting..." : "Run Collection"}
        </Button>
      </div>

      {/* Metrics row */}
      <div className="grid grid-cols-4 gap-4">
        {[
          {
            label: "Open issues",
            value: open.length,
            color: open.length > 0 ? "text-red-400" : "text-zinc-500",
          },
          {
            label: "Fixes ready",
            value: pending.length,
            color: pending.length > 0 ? "text-amber-400" : "text-zinc-500",
          },
          {
            label: "Applied",
            value: applied.length,
            color: applied.length > 0 ? "text-green-400" : "text-zinc-500",
          },
          {
            label: "Trend alerts",
            value: alerts.length,
            color: alerts.length > 0 ? "text-red-400" : "text-zinc-500",
          },
        ].map((m) => (
          <Card key={m.label}>
            <CardContent className="pt-4 pb-3">
              <div className={`text-2xl font-medium ${m.color}`}>{m.value}</div>
              <div className="text-xs text-muted-foreground mt-1">{m.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Monthly digest */}
      {digest?.narrative && (
        <Card className="border-blue-500/30 bg-blue-500/5">
          <CardHeader className="pb-2">
            <CardDescription className="text-blue-400 uppercase tracking-wide text-xs font-medium">
              Monthly digest — {digest.month_start}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-blue-300/90 leading-relaxed whitespace-pre-wrap">
              {digest.narrative}
            </p>
          </CardContent>
        </Card>
      )}

      <Separator />

      {/* Fix queue */}
      <div>
        <h2 className="text-sm font-medium mb-4">Fix Queue</h2>
        {[...open, ...pending, ...applied].length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              No active issues. Run a collection to detect issues from LangSmith traces.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {[...open, ...pending, ...applied].map((issue) => (
              <Card
                key={issue.id}
                className={`border ${SEV_STYLE[issue.severity] ?? "border-zinc-700"}`}
              >
                <CardContent className="pt-5 pb-4">
                  {/* Issue header */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                        <Badge
                          variant="outline"
                          className={`text-[10px] uppercase tracking-wider ${SEV_BADGE[issue.severity] ?? ""}`}
                        >
                          {issue.severity}
                        </Badge>
                        <span className="text-xs font-medium text-muted-foreground">
                          {issue.issue_type.replace(/_/g, " ")}
                        </span>
                        <TrendBadge trend={issue.trend_data} />
                        {issue.recurrence_count > 0 && (
                          <span className="text-xs text-red-400 font-medium">
                            recurred {issue.recurrence_count}x
                          </span>
                        )}
                      </div>
                      <p className="text-sm">{issue.pattern_summary}</p>
                    </div>
                    <div className="text-right text-xs text-muted-foreground ml-4 shrink-0">
                      <div>{issue.affected_count} runs</div>
                      <div>{issue.week_start}</div>
                    </div>
                  </div>

                  {/* Fixes */}
                  {Array.isArray(issue.fixes) &&
                    issue.fixes.filter(Boolean).map((fix) => (
                      <div
                        key={fix.id}
                        className="bg-zinc-800/60 rounded-lg p-4 mt-3 border border-zinc-700/50"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-[10px]">
                              {P_LABEL[fix.priority] ?? `P${fix.priority}`}
                            </Badge>
                            <span className="text-sm font-medium">{fix.title}</span>
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {Math.round(fix.confidence * 100)}% confidence
                          </span>
                        </div>

                        <p className="text-xs text-muted-foreground mb-3">
                          {fix.description}
                        </p>

                        {fix.file_path && (
                          <div className="font-mono text-xs bg-zinc-900/80 rounded px-2 py-1 mb-3 text-zinc-400">
                            {fix.file_path}
                          </div>
                        )}

                        {fix.code_change && (
                          <pre className="text-xs bg-zinc-900/80 rounded p-3 mb-3 overflow-x-auto whitespace-pre-wrap text-zinc-300 max-h-64 overflow-y-auto">
                            {fix.code_change}
                          </pre>
                        )}

                        <div className="flex items-center justify-between">
                          <p className="text-xs text-muted-foreground">
                            Expected: {fix.expected_impact}
                          </p>
                          <div className="flex gap-2">
                            {fix.status === "pending" && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-xs h-7"
                                onClick={() => markFixApplied(fix.id)}
                              >
                                Mark applied
                              </Button>
                            )}
                            {fix.status === "applied" && (
                              <>
                                <span className="text-xs text-green-400 font-medium self-center">
                                  Applied {fix.applied_at?.slice(0, 10)}
                                </span>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-xs h-7"
                                  onClick={() => markFixVerified(fix.id)}
                                >
                                  Verify fix
                                </Button>
                              </>
                            )}
                            {fix.status === "verified" && (
                              <span className="text-xs text-blue-400 font-medium">
                                Verified
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
