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

interface Insight {
  question: string;
  answer: string;
  severity: "critical" | "high" | "medium" | "info";
  category: "safety" | "coaching" | "routing" | "cost" | "dual_load";
  traces_analyzed: number;
  highlighted_traces: string[];
}

interface InsightBatch {
  id: string;
  generated_at: string;
  traces_analyzed: number;
  insights: Insight[];
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const SEV_STYLE: Record<string, string> = {
  critical: "border-red-300 bg-red-50",
  high: "border-orange-300 bg-orange-50",
  medium: "border-yellow-300 bg-yellow-50",
  low: "border-zinc-200 bg-zinc-50",
};

const SEV_BADGE: Record<string, string> = {
  critical: "bg-red-100 text-red-700 border-red-300",
  high: "bg-orange-100 text-orange-700 border-orange-300",
  medium: "bg-yellow-100 text-yellow-700 border-yellow-300",
  low: "bg-zinc-100 text-zinc-600 border-zinc-300",
  info: "bg-zinc-100 text-zinc-600 border-zinc-300",
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
      <span className="text-xs text-green-600 font-medium">
        {Math.abs(pct_change ?? 0).toFixed(0)}% better
      </span>
    );
  if (direction === "worsening")
    return (
      <span
        className={`text-xs font-medium ${alert ? "text-red-600" : "text-orange-600"}`}
      >
        {(pct_change ?? 0).toFixed(0)}% worse{alert ? " !" : ""}
      </span>
    );
  if (direction === "new")
    return <span className="text-xs text-blue-600 font-medium">new this week</span>;
  return <span className="text-xs text-zinc-500">stable</span>;
}

// ── Main Page ───────────────────────────────────────────────────────────────

const CATEGORY_LABEL: Record<string, string> = {
  safety: "Athlete Safety",
  coaching: "Coaching Quality",
  routing: "Intent Routing",
  cost: "Cost Efficiency",
  dual_load: "Dual-Load Stress",
};

const INSIGHT_SEV_STYLE: Record<string, string> = {
  critical: "border-l-red-500 bg-red-50",
  high: "border-l-orange-500 bg-orange-50",
  medium: "border-l-yellow-500 bg-yellow-50",
  info: "border-l-zinc-400 bg-zinc-50",
};

// ── Insight Card List (reusable for Latest + Historical) ──────────────────

function InsightCardList({ insights }: { insights: Insight[] }) {
  return (
    <div className="space-y-3">
      {insights.map((insight, idx) => (
        <Card
          key={idx}
          className={`border-l-4 ${INSIGHT_SEV_STYLE[insight.severity] ?? "border-l-zinc-400 bg-zinc-50"}`}
        >
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Badge
                  variant="outline"
                  className={`text-[10px] uppercase tracking-wider ${SEV_BADGE[insight.severity] ?? ""}`}
                >
                  {insight.severity}
                </Badge>
                <span className="text-xs font-medium text-muted-foreground">
                  {CATEGORY_LABEL[insight.category] ?? insight.category}
                </span>
              </div>
              <span className="text-xs text-muted-foreground">
                {insight.traces_analyzed} traces analyzed
              </span>
            </div>

            <p className="text-sm font-medium mb-2">{insight.question}</p>

            <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-wrap">
              {insight.answer}
            </p>

            {insight.highlighted_traces.length > 0 && (
              <div className="mt-3 flex gap-2 flex-wrap">
                {insight.highlighted_traces.map((traceId) => (
                  <span
                    key={traceId}
                    className="font-mono text-[10px] bg-zinc-200 rounded px-1.5 py-0.5 text-zinc-600"
                  >
                    {traceId.slice(0, 8)}…
                  </span>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ── Delta computation (Latest shows only NEW findings) ────────────────────

interface DeltaResult {
  deltaInsights: Insight[];   // Only insights affected by new traces
  unchangedCount: number;     // Categories with no new trace data
  newTraceIds: string[];      // Trace IDs not in previous batch
  totalNewTraces: number;     // Net new trace count
}

function computeInsightDelta(
  latest: InsightBatch,
  previous: InsightBatch | null
): DeltaResult {
  if (!previous || previous.insights.length === 0) {
    return {
      deltaInsights: latest.insights,
      unchangedCount: 0,
      newTraceIds: [...new Set(latest.insights.flatMap((i) => i.highlighted_traces))],
      totalNewTraces: latest.traces_analyzed,
    };
  }

  // Collect ALL trace IDs from the previous batch
  const prevTraceIds = new Set<string>();
  for (const ins of previous.insights) {
    for (const t of ins.highlighted_traces) {
      prevTraceIds.add(t);
    }
  }

  // Find genuinely new trace IDs in the latest batch
  const allLatestTraceIds = new Set<string>();
  for (const ins of latest.insights) {
    for (const t of ins.highlighted_traces) {
      allLatestTraceIds.add(t);
    }
  }
  const newTraceIds = [...allLatestTraceIds].filter((t) => !prevTraceIds.has(t));
  const newTraceSet = new Set(newTraceIds);

  // An insight is "delta" if it references at least one new trace ID,
  // OR if its category didn't exist in the previous batch,
  // OR if its severity changed for the same category.
  const prevByCategory = new Map<string, Insight>();
  for (const ins of previous.insights) {
    prevByCategory.set(ins.category, ins);
  }

  const deltaInsights: Insight[] = [];
  let unchangedCount = 0;

  for (const ins of latest.insights) {
    const prev = prevByCategory.get(ins.category);
    const hasNewTraces = ins.highlighted_traces.some((t) => newTraceSet.has(t));
    const isNewCategory = !prev;
    const severityChanged = prev && prev.severity !== ins.severity;

    if (isNewCategory || severityChanged || hasNewTraces) {
      deltaInsights.push(ins);
    } else {
      unchangedCount++;
    }
  }

  return {
    deltaInsights,
    unchangedCount,
    newTraceIds,
    totalNewTraces: Math.max(0, latest.traces_analyzed - previous.traces_analyzed),
  };
}

const INSIGHTS_STORAGE_KEY = "tomo_ai_health_insights_history";

function loadInsightHistory(): InsightBatch[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(INSIGHTS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveInsightHistory(batches: InsightBatch[]) {
  if (typeof window === "undefined") return;
  // Keep last 20 batches max
  const trimmed = batches.slice(0, 20);
  localStorage.setItem(INSIGHTS_STORAGE_KEY, JSON.stringify(trimmed));
}

export default function AIHealthPage() {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [digest, setDigest] = useState<Digest>({});
  const [latestBatch, setLatestBatch] = useState<InsightBatch | null>(null);
  const [historicalBatches, setHistoricalBatches] = useState<InsightBatch[]>([]);
  const [showHistorical, setShowHistorical] = useState(false);
  const [loading, setLoading] = useState(true);
  const [collecting, setCollecting] = useState(false);
  const [generatingInsights, setGeneratingInsights] = useState(false);

  // Load persisted history on mount
  useEffect(() => {
    const history = loadInsightHistory();
    if (history.length > 0) {
      setLatestBatch(history[0]);
      setHistoricalBatches(history.slice(1));
    }
  }, []);

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
        // If insights came back with collection, add to history
        if (data.insights && data.insights.length > 0) {
          const collectionBatch: InsightBatch = {
            id: crypto.randomUUID(),
            generated_at: new Date().toISOString(),
            traces_analyzed: data.runs_analyzed ?? 0,
            insights: data.insights,
          };
          const updatedHistory: InsightBatch[] = [];
          if (latestBatch) updatedHistory.push(latestBatch, ...historicalBatches);
          else updatedHistory.push(...historicalBatches);

          setLatestBatch(collectionBatch);
          setHistoricalBatches(updatedHistory);
          saveInsightHistory([collectionBatch, ...updatedHistory]);
        }
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

  const generateInsightsReport = async () => {
    setGeneratingInsights(true);
    try {
      const res = await fetch("/api/v1/admin/ai-health/insights", {
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        const newInsights: Insight[] = data.insights ?? [];
        const tracesAnalyzed: number = data.traces_analyzed ?? newInsights.reduce(
          (max: number, i: Insight) => Math.max(max, i.traces_analyzed), 0
        );

        const newBatch: InsightBatch = {
          id: crypto.randomUUID(),
          generated_at: new Date().toISOString(),
          traces_analyzed: tracesAnalyzed,
          insights: newInsights,
        };

        // Move current latest to historical
        const updatedHistory: InsightBatch[] = [];
        if (latestBatch) {
          updatedHistory.push(latestBatch, ...historicalBatches);
        } else {
          updatedHistory.push(...historicalBatches);
        }

        setLatestBatch(newBatch);
        setHistoricalBatches(updatedHistory);
        saveInsightHistory([newBatch, ...updatedHistory]);

        toast.success(
          `Insights generated from ${tracesAnalyzed} traces`
        );
      } else {
        toast.error("Insights generation failed");
      }
    } catch {
      toast.error("Request failed");
    } finally {
      setGeneratingInsights(false);
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
        <div className="flex gap-2">
          <Button
            onClick={generateInsightsReport}
            disabled={generatingInsights}
            variant="outline"
            size="sm"
          >
            {generatingInsights ? "Analyzing..." : "Generate Insights"}
          </Button>
          <Button
            onClick={triggerCollection}
            disabled={collecting}
            variant="outline"
            size="sm"
          >
            {collecting ? "Collecting..." : "Run Collection"}
          </Button>
        </div>
      </div>

      {/* Metrics row */}
      <div className="grid grid-cols-4 gap-4">
        {[
          {
            label: "Open issues",
            value: open.length,
            color: open.length > 0 ? "text-red-600" : "text-zinc-500",
          },
          {
            label: "Fixes ready",
            value: pending.length,
            color: pending.length > 0 ? "text-amber-600" : "text-zinc-500",
          },
          {
            label: "Applied",
            value: applied.length,
            color: applied.length > 0 ? "text-green-600" : "text-zinc-500",
          },
          {
            label: "Trend alerts",
            value: alerts.length,
            color: alerts.length > 0 ? "text-red-600" : "text-zinc-500",
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
        <Card className="border-blue-200 bg-blue-50">
          <CardHeader className="pb-2">
            <CardDescription className="text-blue-600 uppercase tracking-wide text-xs font-medium">
              Monthly digest — {digest.month_start}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-blue-800 leading-relaxed whitespace-pre-wrap">
              {digest.narrative}
            </p>
          </CardContent>
        </Card>
      )}

      <Separator />

      {/* ── Latest Insights (delta only) ────────────────────── */}
      {latestBatch && latestBatch.insights.length > 0 && (() => {
        const prevBatch = historicalBatches.length > 0 ? historicalBatches[0] : null;
        const delta = computeInsightDelta(latestBatch, prevBatch);
        return (
          <>
            <div>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-sm font-medium">Latest Insights</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Generated{" "}
                    {new Date(latestBatch.generated_at).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}{" "}
                    — {latestBatch.traces_analyzed} traces analyzed
                    {delta.totalNewTraces > 0 && (
                      <span className="text-emerald-600 font-medium">
                        {" "}(+{delta.totalNewTraces} new)
                      </span>
                    )}
                  </p>
                </div>
                <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-300">
                  Current
                </Badge>
              </div>

              {delta.deltaInsights.length > 0 ? (
                <>
                  <InsightCardList insights={delta.deltaInsights} />
                  {delta.unchangedCount > 0 && (
                    <p className="text-xs text-muted-foreground mt-3">
                      {delta.unchangedCount} categor{delta.unchangedCount === 1 ? "y" : "ies"} unchanged from previous generation
                    </p>
                  )}
                </>
              ) : (
                <Card className="border-zinc-200 bg-zinc-50">
                  <CardContent className="py-6 text-center">
                    <p className="text-sm text-muted-foreground">
                      No new findings — all {latestBatch.insights.length} categories unchanged from previous generation
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>

            <Separator />
          </>
        );
      })()}

      {/* ── Historical Insights (full previous generations) ── */}
      {historicalBatches.length > 0 && (
        <>
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-medium text-muted-foreground">
                  Historical Insights
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {historicalBatches.length} previous generation{historicalBatches.length > 1 ? "s" : ""}{" "}
                  — {historicalBatches.reduce((sum, b) => sum + b.traces_analyzed, 0)} total traces
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs h-7"
                onClick={() => setShowHistorical(!showHistorical)}
              >
                {showHistorical ? "Collapse" : "Show history"}
              </Button>
            </div>

            {showHistorical && (
              <div className="space-y-6">
                {historicalBatches.map((batch) => (
                  <div key={batch.id} className="opacity-75">
                    <div className="flex items-center gap-2 mb-3">
                      <Badge
                        variant="outline"
                        className="text-[10px] bg-zinc-100 text-zinc-500 border-zinc-300"
                      >
                        Historical
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {new Date(batch.generated_at).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}{" "}
                        — {batch.traces_analyzed} traces
                      </span>
                    </div>
                    <InsightCardList insights={batch.insights} />
                  </div>
                ))}
              </div>
            )}
          </div>

          <Separator />
        </>
      )}

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
                className={`border ${SEV_STYLE[issue.severity] ?? "border-zinc-200"}`}
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
                          <span className="text-xs text-red-600 font-medium">
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
                        className="bg-zinc-50 rounded-lg p-4 mt-3 border border-zinc-200"
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
                          <div className="font-mono text-xs bg-zinc-100 rounded px-2 py-1 mb-3 text-zinc-700 border border-zinc-200">
                            {fix.file_path}
                          </div>
                        )}

                        {fix.code_change && (
                          <pre className="text-xs bg-zinc-900 rounded p-3 mb-3 overflow-x-auto whitespace-pre-wrap text-zinc-100 max-h-64 overflow-y-auto">
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
                                <span className="text-xs text-green-600 font-medium self-center">
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
                              <span className="text-xs text-blue-600 font-medium">
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
