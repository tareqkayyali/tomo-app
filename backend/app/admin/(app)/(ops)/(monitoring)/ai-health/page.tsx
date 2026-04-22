"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
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
import EvalSystemTab from "./_components/EvalSystemTab";
import AutoHealTab from "./_components/AutoHealTab";

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
  category: "safety" | "coaching" | "routing" | "cost" | "dual_load" | "conversational_connect" | "tone_warmth" | "rag_coverage";
  traces_analyzed: number;
  highlighted_traces: string[];
}

interface InsightBatch {
  id: string;
  generated_at: string;
  traces_analyzed: number;
  insights: Insight[];
}

// Dashboard API types
interface AgentStats {
  agent_type: string;
  total_traces: number;
  success_rate: number;
  avg_cost: number;
  avg_latency_ms: number;
  error_count: number;
  safety_flags: number;
  top_intents: string[];
}

interface GlobalStats {
  total_traces: number;
  avg_cost: number;
  error_rate: number;
  safety_flags: number;
}

interface DashboardData {
  global_stats: GlobalStats;
  agents: AgentStats[];
  time_range: { from: string; to: string };
}

interface Trace {
  id: string;
  created_at: string;
  message: string;
  assistant_response: string;
  agent_type: string;
  path_type: string;
  intent_id: string;
  classification_layer: string;
  routing_confidence: number;
  tool_count: number;
  tool_names: string[];
  total_cost_usd: number;
  latency_ms: number;
  total_tokens: number;
  validation_passed: boolean;
  validation_flags: string[];
  session_id: string;
  user_id: string;
  request_id: string;
  rag_used: boolean;
  rag_chunk_count: number;
  sport: string;
  age_band: string;
  readiness_rag: string;
  acwr: number | null;
  phv_gate_fired: boolean;
  crisis_detected: boolean;
  turn_number: number;
  response_length_chars: number;
  cost_bucket: string;
  latency_bucket: string;
}

interface TracesResponse {
  traces: Trace[];
  total_count: number;
  limit: number;
  offset: number;
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

const CATEGORY_LABEL: Record<string, string> = {
  safety: "Athlete Safety",
  coaching: "Coaching Quality",
  routing: "Intent Routing",
  cost: "Cost Efficiency",
  dual_load: "Dual-Load Stress",
  conversational_connect: "Conversational Connect",
  tone_warmth: "Tone & Warmth",
  rag_coverage: "RAG Coverage",
};

const INSIGHT_SEV_STYLE: Record<string, string> = {
  critical: "border-l-red-500 bg-red-50",
  high: "border-l-orange-500 bg-orange-50",
  medium: "border-l-yellow-500 bg-yellow-50",
  info: "border-l-zinc-400 bg-zinc-50",
};

const TIME_RANGE_HOURS: Record<string, number> = {
  "1h": 1,
  "6h": 6,
  "24h": 24,
  "7d": 168,
  "30d": 720,
};

type TimeRange = "1h" | "6h" | "24h" | "7d" | "30d" | "custom";
type TabId = "command" | "traces" | "issues" | "eval-system" | "auto-heal";

const AGENT_TYPES = [
  "All",
  "timeline",
  "recovery",
  "output",
  "mastery",
  "settings",
  "planning",
  "testing_benchmark",
  "dual_load",
  "cv_identity",
  "training_program",
] as const;

const PATH_TYPES = ["All", "capsule", "full_ai", "confirmed_write"] as const;

const COST_BUCKETS = ["All", "free", "cheap", "moderate", "expensive"] as const;
const LATENCY_BUCKETS = ["All", "fast", "normal", "slow"] as const;
const VALIDATION_OPTIONS = ["All", "Pass", "Fail"] as const;

function getTimeRange(range: string, customFrom?: string, customTo?: string): { from: string; to: string } {
  if (range === "custom" && customFrom && customTo) {
    return {
      from: new Date(customFrom).toISOString(),
      to: new Date(customTo).toISOString(),
    };
  }
  const now = new Date();
  const hours = TIME_RANGE_HOURS[range] || 24;
  const from = new Date(now.getTime() - hours * 3600000);
  return { from: from.toISOString(), to: now.toISOString() };
}

function toDatetimeLocal(iso: string): string {
  return new Date(iso).toISOString().slice(0, 16);
}

function formatCost(cost: number | null | undefined): string {
  return `$${(cost ?? 0).toFixed(4)}`;
}

function formatLatency(ms: number | null | undefined): string {
  return `${((ms ?? 0) / 1000).toFixed(1)}s`;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function truncate(str: string, len: number): string {
  if (!str) return "";
  return str.length > len ? str.slice(0, len) + "..." : str;
}

function healthDot(rate: number | null | undefined): { color: string; border: string } {
  const r = rate ?? 0;
  if (r >= 95) return { color: "bg-green-500", border: "border-l-green-500" };
  if (r >= 85) return { color: "bg-yellow-500", border: "border-l-yellow-500" };
  return { color: "bg-red-500", border: "border-l-red-500" };
}

// ── Skeleton Loader ─────────────────────────────────────────────────────────

function Skeleton({ className }: { className?: string }) {
  return (
    <div className={`animate-pulse bg-zinc-200 rounded ${className ?? "h-4 w-20"}`} />
  );
}

// ── Trend Badge ─────────────────────────────────────────────────────────────

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

// ── Insight Card List (reusable for Latest + Historical + Filtered) ─────────

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
                    {traceId.slice(0, 8)}...
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

// ── Main Page ───────────────────────────────────────────────────────────────

export default function AIHealthPage() {
  // Tab state
  const [activeTab, setActiveTab] = useState<TabId>("command");

  // Time range
  const [timeRange, setTimeRange] = useState<TimeRange>("24h");

  // Command Center state
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(true);

  // Traces tab state
  const [tracesData, setTracesData] = useState<TracesResponse | null>(null);
  const [tracesLoading, setTracesLoading] = useState(false);
  const [expandedTraceId, setExpandedTraceId] = useState<string | null>(null);
  const [tracesOffset, setTracesOffset] = useState(0);
  const TRACES_LIMIT = 50;

  // Trace selection (for targeted insights)
  const [selectedTraceIds, setSelectedTraceIds] = useState<Set<string>>(new Set());

  // Trace filters
  const [filterAgentType, setFilterAgentType] = useState("All");
  const [filterPathType, setFilterPathType] = useState("All");
  const [filterIntent, setFilterIntent] = useState("");
  const [filterCostBucket, setFilterCostBucket] = useState("All");
  const [filterLatencyBucket, setFilterLatencyBucket] = useState("All");
  const [filterValidation, setFilterValidation] = useState("All");

  // Custom date range for traces (from/to pickers)
  const [customFrom, setCustomFrom] = useState(() => {
    return new Date(Date.now() - 24 * 3600000).toISOString().slice(0, 16);
  });
  const [customTo, setCustomTo] = useState(() => {
    return new Date().toISOString().slice(0, 16);
  });

  // Filtered insights (from traces tab)
  const [filteredInsights, setFilteredInsights] = useState<Insight[] | null>(null);
  const [filteredInsightsLoading, setFilteredInsightsLoading] = useState(false);
  const [filteredTracesAnalyzed, setFilteredTracesAnalyzed] = useState(0);
  const [activeInsightTab, setActiveInsightTab] = useState("");

  // Issues tab state
  const [issues, setIssues] = useState<Issue[]>([]);
  const [issuesLoading, setIssuesLoading] = useState(true);
  const [collecting, setCollecting] = useState(false);

  // ── Fetch: Dashboard ──────────────────────────────────────────────────────

  const fetchDashboard = useCallback(async () => {
    setDashboardLoading(true);
    try {
      const { from, to } = getTimeRange(timeRange);
      const res = await fetch(
        `/api/v1/admin/ai-health/dashboard?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
        { credentials: "include" }
      );
      if (res.ok) {
        setDashboardData(await res.json());
      } else {
        toast.error("Failed to load dashboard data");
      }
    } catch {
      toast.error("Dashboard request failed");
    } finally {
      setDashboardLoading(false);
    }
  }, [timeRange]);

  // ── Fetch: Traces ─────────────────────────────────────────────────────────

  const fetchTraces = useCallback(async (offset = 0) => {
    setTracesLoading(true);
    setFilteredInsights(null);
    try {
      const { from, to } = getTimeRange(timeRange, customFrom, customTo);
      const params = new URLSearchParams({
        from,
        to,
        limit: String(TRACES_LIMIT),
        offset: String(offset),
      });
      if (filterAgentType !== "All") params.set("agent_type", filterAgentType);
      if (filterPathType !== "All") params.set("path_type", filterPathType);
      if (filterIntent.trim()) params.set("intent_id", filterIntent.trim());

      const res = await fetch(
        `/api/v1/admin/ai-health/traces?${params.toString()}`,
        { credentials: "include" }
      );
      if (res.ok) {
        const data: TracesResponse = await res.json();
        setTracesData(data);
        setTracesOffset(offset);
      } else {
        toast.error("Failed to load traces");
      }
    } catch {
      toast.error("Traces request failed");
    } finally {
      setTracesLoading(false);
    }
  }, [timeRange, customFrom, customTo, filterAgentType, filterPathType, filterIntent]);

  // ── Fetch: Issues ─────────────────────────────────────────────────────────

  const fetchIssues = useCallback(async () => {
    setIssuesLoading(true);
    try {
      const res = await fetch("/api/v1/admin/ai-health/issues", {
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        setIssues(data.issues ?? []);
      } else {
        toast.error("Failed to load issues");
      }
    } catch {
      toast.error("Issues request failed");
    } finally {
      setIssuesLoading(false);
    }
  }, []);

  // ── Filtered Insights ─────────────────────────────────────────────────────

  const runFilteredInsights = async () => {
    setFilteredInsightsLoading(true);
    try {
      const { from, to } = getTimeRange(timeRange, customFrom, customTo);
      const body: Record<string, unknown> = { from, to, filters: {} };
      if (filterAgentType !== "All") body.agent_type = filterAgentType;
      // If traces are selected, run insights only on those
      if (selectedTraceIds.size > 0) {
        body.trace_ids = Array.from(selectedTraceIds);
      }

      const res = await fetch("/api/v1/admin/ai-health/insights/filtered", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const data = await res.json();
        setFilteredInsights(data.insights ?? []);
        setFilteredTracesAnalyzed(data.traces_analyzed ?? 0);
        toast.success(`Insights generated from ${data.traces_analyzed ?? 0} traces`);
      } else {
        const errData = await res.json().catch(() => ({}));
        const detail = errData.detail || errData.error || `HTTP ${res.status}`;
        toast.error(`Insight generation failed: ${detail}`);
      }
    } catch {
      toast.error("Request failed");
    } finally {
      setFilteredInsightsLoading(false);
    }
  };

  // ── Collection Trigger ────────────────────────────────────────────────────

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
        fetchIssues();
      } else {
        toast.error("Collection failed");
      }
    } catch {
      toast.error("Collection request failed");
    } finally {
      setCollecting(false);
    }
  };

  // ── Fix Actions ───────────────────────────────────────────────────────────

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
        fetchIssues();
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
        toast.success("Fix verified");
        fetchIssues();
      } else {
        toast.error("Failed to verify fix");
      }
    } catch {
      toast.error("Request failed");
    }
  };

  // ── Effects ───────────────────────────────────────────────────────────────

  useEffect(() => {
    if (activeTab === "command") fetchDashboard();
  }, [activeTab, fetchDashboard]);

  useEffect(() => {
    if (activeTab === "traces") fetchTraces(0);
  }, [activeTab, fetchTraces]);

  useEffect(() => {
    if (activeTab === "issues") fetchIssues();
  }, [activeTab, fetchIssues]);

  // Re-fetch dashboard when time range changes (if on command tab)
  useEffect(() => {
    if (activeTab === "command") fetchDashboard();
  }, [timeRange, fetchDashboard]);

  // Sync customFrom/customTo when time range quick-buttons are clicked
  useEffect(() => {
    if (timeRange !== "custom") {
      const { from, to } = getTimeRange(timeRange);
      setCustomFrom(toDatetimeLocal(from));
      setCustomTo(toDatetimeLocal(to));
    }
  }, [timeRange]);

  // ── Derived data ──────────────────────────────────────────────────────────

  const sortedAgents = useMemo(() => {
    if (!dashboardData?.agents) return [];
    return [...dashboardData.agents].sort((a, b) => b.total_traces - a.total_traces);
  }, [dashboardData]);

  const open = useMemo(() => issues.filter((i) => i.status === "open"), [issues]);
  const pending = useMemo(
    () => issues.filter((i) => i.status === "fix_generated"),
    [issues]
  );
  const applied = useMemo(
    () => issues.filter((i) => i.status === "fix_applied"),
    [issues]
  );

  // Client-side cost/latency/validation filtering for traces
  const filteredTraces = useMemo(() => {
    if (!tracesData?.traces) return [];
    let result = tracesData.traces;

    if (filterCostBucket !== "All") {
      result = result.filter((t) => {
        const c = t.total_cost_usd;
        switch (filterCostBucket) {
          case "free": return c === 0;
          case "cheap": return c > 0 && c < 0.005;
          case "moderate": return c >= 0.005 && c < 0.02;
          case "expensive": return c >= 0.02;
          default: return true;
        }
      });
    }

    if (filterLatencyBucket !== "All") {
      result = result.filter((t) => {
        const ms = t.latency_ms ?? 0;
        switch (filterLatencyBucket) {
          case "fast": return ms < 1000;
          case "normal": return ms >= 1000 && ms < 3000;
          case "slow": return ms >= 3000;
          default: return true;
        }
      });
    }

    if (filterValidation !== "All") {
      result = result.filter((t) =>
        filterValidation === "Pass" ? t.validation_passed : !t.validation_passed
      );
    }

    return result;
  }, [tracesData, filterCostBucket, filterLatencyBucket, filterValidation]);

  const hasActiveFilters =
    filterAgentType !== "All" ||
    filterPathType !== "All" ||
    filterIntent.trim() !== "" ||
    filterCostBucket !== "All" ||
    filterLatencyBucket !== "All" ||
    filterValidation !== "All";

  // Group insights by category for tabbed view
  const insightsByCategory = useMemo(() => {
    if (!filteredInsights) return {} as Record<string, Insight[]>;
    const grouped: Record<string, Insight[]> = {};
    for (const i of filteredInsights) {
      if (!grouped[i.category]) grouped[i.category] = [];
      grouped[i.category].push(i);
    }
    return grouped;
  }, [filteredInsights]);

  const insightCategories = useMemo(
    () => Object.keys(insightsByCategory),
    [insightsByCategory]
  );

  // Highest severity per category for tab badge
  const categorySeverity = useMemo(() => {
    const sev: Record<string, string> = {};
    const order = ["critical", "high", "medium", "info"];
    for (const [cat, insights] of Object.entries(insightsByCategory)) {
      let best = "info";
      for (const i of insights) {
        if (order.indexOf(i.severity) < order.indexOf(best)) best = i.severity;
      }
      sev[cat] = best;
    }
    return sev;
  }, [insightsByCategory]);

  // Auto-select first insight tab when insights load
  useEffect(() => {
    if (insightCategories.length > 0 && !insightCategories.includes(activeInsightTab)) {
      setActiveInsightTab(insightCategories[0]);
    }
  }, [insightCategories, activeInsightTab]);

  // ── Tab Bar ───────────────────────────────────────────────────────────────

  const tabs: { id: TabId; label: string }[] = [
    { id: "command", label: "Command Center" },
    { id: "traces", label: "Trace Explorer" },
    { id: "issues", label: "Issues & Fixes" },
    { id: "eval-system", label: "Eval System" },
    { id: "auto-heal", label: "Auto-Heal Loop" },
  ];

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-semibold">AI Health</h1>
        <p className="text-sm text-muted-foreground mt-1">
          3-level observability: real-time metrics, trace inspection, and issue management
        </p>
      </div>

      {/* Tab Bar */}
      <div className="flex border-b border-zinc-200">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors relative ${
              activeTab === tab.id
                ? "text-zinc-900"
                : "text-zinc-500 hover:text-zinc-700"
            }`}
          >
            {tab.label}
            {activeTab === tab.id && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-zinc-900 rounded-t" />
            )}
          </button>
        ))}
      </div>

      {/* ================================================================ */}
      {/* TAB 1: Command Center                                           */}
      {/* ================================================================ */}
      {activeTab === "command" && (
        <div className="space-y-6">
          {/* Time Range Bar */}
          <div className="flex items-center gap-1 bg-zinc-50 p-1.5 rounded-lg w-fit">
            {(["1h", "6h", "24h", "7d", "30d"] as TimeRange[]).map((r) => (
              <button
                key={r}
                onClick={() => setTimeRange(r)}
                className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                  timeRange === r
                    ? "bg-white text-zinc-900 shadow-sm border border-zinc-200"
                    : "text-zinc-500 hover:text-zinc-700"
                }`}
              >
                {r}
              </button>
            ))}
          </div>

          {/* Global Stats Strip */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {dashboardLoading ? (
              <>
                {[1, 2, 3, 4].map((i) => (
                  <Card key={i}>
                    <CardContent className="pt-4 pb-3">
                      <Skeleton className="h-8 w-16 mb-2" />
                      <Skeleton className="h-3 w-24" />
                    </CardContent>
                  </Card>
                ))}
              </>
            ) : dashboardData ? (
              <>
                <Card>
                  <CardContent className="pt-4 pb-3">
                    <div className="text-2xl font-medium text-zinc-900">
                      {(dashboardData.global_stats.total_traces ?? 0).toLocaleString()}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Total Traces
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4 pb-3">
                    <div className="text-2xl font-medium text-zinc-900">
                      {formatCost(dashboardData.global_stats.avg_cost)}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">Avg Cost</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4 pb-3">
                    <div
                      className={`text-2xl font-medium ${
                        (dashboardData.global_stats.error_rate ?? 0) > 5
                          ? "text-red-600"
                          : (dashboardData.global_stats.error_rate ?? 0) > 2
                            ? "text-orange-600"
                            : "text-zinc-900"
                      }`}
                    >
                      {(dashboardData.global_stats.error_rate ?? 0).toFixed(1)}%
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">Error Rate</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4 pb-3">
                    <div
                      className={`text-2xl font-medium ${
                        (dashboardData.global_stats.safety_flags ?? 0) > 0
                          ? "text-red-600"
                          : "text-green-600"
                      }`}
                    >
                      {dashboardData.global_stats.safety_flags ?? 0}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Safety Flags
                    </div>
                  </CardContent>
                </Card>
              </>
            ) : (
              <Card className="col-span-full">
                <CardContent className="py-8 text-center text-sm text-muted-foreground">
                  No dashboard data available
                </CardContent>
              </Card>
            )}
          </div>

          {/* Agent Health Grid */}
          <div>
            <h2 className="text-sm font-medium mb-3">Agent Health</h2>
            {dashboardLoading ? (
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <Card key={i}>
                    <CardContent className="pt-4 pb-3 space-y-2">
                      <Skeleton className="h-5 w-32" />
                      <Skeleton className="h-3 w-full" />
                      <Skeleton className="h-3 w-24" />
                      <Skeleton className="h-3 w-40" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : sortedAgents.length > 0 ? (
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                {sortedAgents.map((agent) => {
                  const health = healthDot(agent.success_rate);
                  return (
                    <Card
                      key={agent.agent_type}
                      className={`border-l-4 ${health.border}`}
                    >
                      <CardContent className="pt-4 pb-3">
                        <div className="flex items-center gap-2 mb-2">
                          <span
                            className={`inline-block w-2.5 h-2.5 rounded-full ${health.color}`}
                          />
                          <span className="text-sm font-medium capitalize">
                            {agent.agent_type.replace(/_/g, " ")}
                          </span>
                        </div>
                        <div className="text-xs text-zinc-600 space-y-1">
                          <div>
                            {agent.total_traces} traces{" "}
                            <span className="text-zinc-400 mx-1">|</span>
                            <span
                              className={
                                (agent.success_rate ?? 0) >= 95
                                  ? "text-green-600"
                                  : (agent.success_rate ?? 0) >= 85
                                    ? "text-yellow-600"
                                    : "text-red-600"
                              }
                            >
                              {(agent.success_rate ?? 0).toFixed(1)}% success
                            </span>
                          </div>
                          <div>
                            {formatCost(agent.avg_cost)} avg
                            <span className="text-zinc-400 mx-1">|</span>
                            {formatLatency(agent.avg_latency_ms)} avg
                          </div>
                          {agent.top_intents.length > 0 && (
                            <div className="text-zinc-400">
                              Top: {agent.top_intents.slice(0, 3).join(", ")}
                            </div>
                          )}
                        </div>
                        <div className="mt-3">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs h-7 px-2 text-blue-600 hover:text-blue-700"
                            onClick={() => {
                              setFilterAgentType(agent.agent_type);
                              setActiveTab("traces");
                            }}
                          >
                            View Traces →
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            ) : (
              <Card>
                <CardContent className="py-8 text-center text-sm text-muted-foreground">
                  No agent data for this time range
                </CardContent>
              </Card>
            )}
          </div>

          {/* Active Issues (inline preview) */}
          {!dashboardLoading && issues.length > 0 && (
            <div>
              <Separator className="mb-6" />
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-medium">Active Issues</h2>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs h-7 text-blue-600"
                  onClick={() => setActiveTab("issues")}
                >
                  View all →
                </Button>
              </div>
              <div className="space-y-3">
                {issues
                  .filter((i) => i.status === "open" || i.status === "fix_generated")
                  .slice(0, 5)
                  .map((issue) => (
                    <Card
                      key={issue.id}
                      className={`border ${SEV_STYLE[issue.severity] ?? "border-zinc-200"}`}
                    >
                      <CardContent className="py-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Badge
                              variant="outline"
                              className={`text-[10px] uppercase tracking-wider ${SEV_BADGE[issue.severity] ?? ""}`}
                            >
                              {issue.severity}
                            </Badge>
                            <span className="text-sm">{issue.pattern_summary}</span>
                            <TrendBadge trend={issue.trend_data} />
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {issue.affected_count} runs
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ================================================================ */}
      {/* TAB 2: Trace Explorer                                           */}
      {/* ================================================================ */}
      {activeTab === "traces" && (
        <div className="space-y-4">
          {/* Time Range (shared) */}
          <div className="flex items-center gap-1 bg-zinc-50 p-1.5 rounded-lg w-fit">
            {(["1h", "6h", "24h", "7d", "30d"] as TimeRange[]).map((r) => (
              <button
                key={r}
                onClick={() => setTimeRange(r)}
                className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                  timeRange === r
                    ? "bg-white text-zinc-900 shadow-sm border border-zinc-200"
                    : "text-zinc-500 hover:text-zinc-700"
                }`}
              >
                {r}
              </button>
            ))}
          </div>

          {/* Filter Bar */}
          <div className="bg-zinc-50 p-3 rounded-lg flex flex-wrap items-end gap-3">
            {/* Agent Type */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">
                Agent
              </label>
              <select
                value={filterAgentType}
                onChange={(e) => setFilterAgentType(e.target.value)}
                className="text-xs border border-zinc-300 rounded px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-zinc-400"
              >
                {AGENT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t === "All" ? "All Agents" : t.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
            </div>

            {/* Path Type */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">
                Path
              </label>
              <select
                value={filterPathType}
                onChange={(e) => setFilterPathType(e.target.value)}
                className="text-xs border border-zinc-300 rounded px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-zinc-400"
              >
                {PATH_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t === "All" ? "All Paths" : t.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
            </div>

            {/* Intent */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">
                Intent
              </label>
              <input
                type="text"
                value={filterIntent}
                onChange={(e) => setFilterIntent(e.target.value)}
                placeholder="e.g. create_event"
                className="text-xs border border-zinc-300 rounded px-2 py-1.5 bg-white w-36 focus:outline-none focus:ring-1 focus:ring-zinc-400"
              />
            </div>

            {/* Cost Bucket */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">
                Cost
              </label>
              <select
                value={filterCostBucket}
                onChange={(e) => setFilterCostBucket(e.target.value)}
                className="text-xs border border-zinc-300 rounded px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-zinc-400"
              >
                {COST_BUCKETS.map((b) => (
                  <option key={b} value={b}>
                    {b === "All" ? "All Costs" : b}
                  </option>
                ))}
              </select>
            </div>

            {/* Latency Bucket */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">
                Latency
              </label>
              <select
                value={filterLatencyBucket}
                onChange={(e) => setFilterLatencyBucket(e.target.value)}
                className="text-xs border border-zinc-300 rounded px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-zinc-400"
              >
                {LATENCY_BUCKETS.map((b) => (
                  <option key={b} value={b}>
                    {b === "All" ? "All Latencies" : b}
                  </option>
                ))}
              </select>
            </div>

            {/* Validation */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">
                Validation
              </label>
              <select
                value={filterValidation}
                onChange={(e) => setFilterValidation(e.target.value)}
                className="text-xs border border-zinc-300 rounded px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-zinc-400"
              >
                {VALIDATION_OPTIONS.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </div>

            {/* Separator */}
            <div className="w-px h-8 bg-zinc-300 self-end mb-0.5" />

            {/* From Date */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">
                From
              </label>
              <input
                type="datetime-local"
                value={customFrom}
                onChange={(e) => {
                  setCustomFrom(e.target.value);
                  setTimeRange("custom");
                }}
                className="text-xs border border-zinc-300 rounded px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-zinc-400"
              />
            </div>

            {/* To Date */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">
                To
              </label>
              <input
                type="datetime-local"
                value={customTo}
                onChange={(e) => {
                  setCustomTo(e.target.value);
                  setTimeRange("custom");
                }}
                className="text-xs border border-zinc-300 rounded px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-zinc-400"
              />
            </div>

            {/* Apply Button */}
            <Button
              size="sm"
              variant="outline"
              className="text-xs h-[30px]"
              onClick={() => {
                setTracesOffset(0);
                fetchTraces(0);
              }}
            >
              Apply
            </Button>
          </div>

          {/* Traces Table */}
          {tracesLoading ? (
            <Card>
              <CardContent className="py-6 space-y-3">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="flex gap-4">
                    <Skeleton className="h-4 w-16" />
                    <Skeleton className="h-4 w-64" />
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-4 w-12" />
                    <Skeleton className="h-4 w-16" />
                    <Skeleton className="h-4 w-12" />
                    <Skeleton className="h-4 w-8" />
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : filteredTraces.length > 0 ? (
            <div className="border border-zinc-200 rounded-lg overflow-hidden">
              {/* Table Header */}
              <div className="grid grid-cols-[32px_72px_1fr_90px_100px_48px_72px_72px_48px] bg-zinc-100 text-[10px] font-medium text-zinc-500 uppercase tracking-wider px-3 py-2 border-b border-zinc-200">
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    className="rounded border-zinc-300 cursor-pointer"
                    checked={filteredTraces.length > 0 && selectedTraceIds.size === filteredTraces.length}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedTraceIds(new Set(filteredTraces.map((t) => t.id)));
                      } else {
                        setSelectedTraceIds(new Set());
                      }
                    }}
                  />
                </div>
                <div>Time</div>
                <div>Message</div>
                <div>Agent</div>
                <div>Intent</div>
                <div>Tools</div>
                <div>Cost</div>
                <div>Latency</div>
                <div>Status</div>
              </div>

              {/* Table Rows */}
              {filteredTraces.map((trace) => (
                <div key={trace.id}>
                  <div
                    className={`grid grid-cols-[32px_72px_1fr_90px_100px_48px_72px_72px_48px] px-3 py-2 text-xs cursor-pointer transition-colors ${
                      expandedTraceId === trace.id
                        ? "bg-zinc-50"
                        : selectedTraceIds.has(trace.id)
                          ? "bg-blue-50/50"
                          : "hover:bg-zinc-50"
                    } border-b border-zinc-100`}
                    onClick={() =>
                      setExpandedTraceId(
                        expandedTraceId === trace.id ? null : trace.id
                      )
                    }
                  >
                    <div className="flex items-center" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        className="rounded border-zinc-300 cursor-pointer"
                        checked={selectedTraceIds.has(trace.id)}
                        onChange={(e) => {
                          const next = new Set(selectedTraceIds);
                          if (e.target.checked) next.add(trace.id);
                          else next.delete(trace.id);
                          setSelectedTraceIds(next);
                        }}
                      />
                    </div>
                    <div className="font-mono text-zinc-500">
                      {formatTime(trace.created_at)}
                    </div>
                    <div className="text-zinc-800 truncate pr-2">
                      {truncate(trace.message || "", 60)}
                    </div>
                    <div className="text-zinc-600 capitalize truncate">
                      {(trace.agent_type || "").replace(/_/g, " ")}
                    </div>
                    <div className="text-zinc-500 font-mono truncate">
                      {trace.intent_id || "-"}
                    </div>
                    <div className="text-zinc-600 text-center">
                      {trace.tool_count ?? 0}
                    </div>
                    <div className="font-mono text-zinc-600">
                      {formatCost(trace.total_cost_usd)}
                    </div>
                    <div className="text-zinc-600">
                      {formatLatency(trace.latency_ms)}
                    </div>
                    <div className="text-center">
                      {trace.validation_passed !== false ? (
                        <span className="text-green-600 font-medium">
                          Pass
                        </span>
                      ) : (
                        <span className="text-red-600 font-medium">
                          Fail
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Expanded Detail */}
                  {expandedTraceId === trace.id && (
                    <div className="bg-zinc-50 border-b border-zinc-200 px-4 py-3">
                      <div className="grid grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-2 text-xs">
                        <div>
                          <span className="text-zinc-400 font-medium">Session:</span>{" "}
                          <span className="font-mono text-zinc-700">
                            {trace.session_id ? trace.session_id.slice(0, 12) + "..." : "-"}
                          </span>
                        </div>
                        <div>
                          <span className="text-zinc-400 font-medium">Turn:</span>{" "}
                          <span className="text-zinc-700">
                            {trace.turn_number || 1}
                          </span>
                        </div>
                        <div>
                          <span className="text-zinc-400 font-medium">Path:</span>{" "}
                          <span className="text-zinc-700 capitalize">
                            {(trace.path_type || "").replace(/_/g, " ")}
                          </span>
                        </div>
                        <div>
                          <span className="text-zinc-400 font-medium">
                            Classification:
                          </span>{" "}
                          <span className="text-zinc-700">
                            {trace.classification_layer || "-"}
                            {(trace.routing_confidence ?? 0) > 0 && (
                              <span className="text-zinc-400 ml-1">
                                ({((trace.routing_confidence ?? 0) * 100).toFixed(0)}%
                                conf)
                              </span>
                            )}
                          </span>
                        </div>
                        <div>
                          <span className="text-zinc-400 font-medium">Tools:</span>{" "}
                          <span className="font-mono text-zinc-700">
                            {(trace.tool_names?.length ?? 0) > 0
                              ? trace.tool_names.join(", ")
                              : "none"}
                          </span>
                        </div>
                        <div>
                          <span className="text-zinc-400 font-medium">Tokens:</span>{" "}
                          <span className="text-zinc-700">
                            {(trace.total_tokens ?? 0).toLocaleString()}
                          </span>
                          <span className="text-zinc-400 mx-1">|</span>
                          <span className="text-zinc-400 font-medium">RAG:</span>{" "}
                          <span className="text-zinc-700">
                            {trace.rag_used
                              ? `yes (${trace.rag_chunk_count ?? 0} chunks)`
                              : "no"}
                          </span>
                        </div>
                        <div>
                          <span className="text-zinc-400 font-medium">Sport:</span>{" "}
                          <span className="text-zinc-700">
                            {trace.sport || "-"}
                          </span>
                          <span className="text-zinc-400 mx-1">|</span>
                          <span className="text-zinc-400 font-medium">Age:</span>{" "}
                          <span className="text-zinc-700">
                            {trace.age_band || "-"}
                          </span>
                          <span className="text-zinc-400 mx-1">|</span>
                          <span className="text-zinc-400 font-medium">
                            Readiness:
                          </span>{" "}
                          <span
                            className={
                              (trace.readiness_rag || "").toLowerCase() === "green"
                                ? "text-green-600"
                                : (trace.readiness_rag || "").toLowerCase() === "yellow"
                                  ? "text-yellow-600"
                                  : (trace.readiness_rag || "").toLowerCase() === "red"
                                    ? "text-red-600"
                                    : "text-zinc-600"
                            }
                          >
                            {trace.readiness_rag || "-"}
                          </span>
                          <span className="text-zinc-400 mx-1">|</span>
                          <span className="text-zinc-400 font-medium">ACWR:</span>{" "}
                          <span className="text-zinc-700">
                            {trace.acwr != null ? Number(trace.acwr).toFixed(1) : "-"}
                          </span>
                        </div>
                        <div>
                          <span className="text-zinc-400 font-medium">Safety:</span>{" "}
                          <span className="text-zinc-700">
                            PHV={trace.phv_gate_fired ? "yes" : "no"}, Crisis=
                            {trace.crisis_detected ? "yes" : "no"}
                          </span>
                        </div>
                        {trace.validation_flags &&
                          trace.validation_flags.length > 0 && (
                            <div className="col-span-full">
                              <span className="text-zinc-400 font-medium">
                                Validation Flags:
                              </span>{" "}
                              <span className="text-red-600 font-mono">
                                {trace.validation_flags.join(", ")}
                              </span>
                            </div>
                          )}
                      </div>

                      {/* Export Trace Button */}
                      <div className="mt-3 pt-2 border-t border-zinc-200 flex justify-end">
                        <button
                          className="text-[10px] text-blue-600 hover:text-blue-800 font-medium px-2 py-1 rounded border border-blue-200 hover:bg-blue-50 transition-colors"
                          onClick={(e) => {
                            e.stopPropagation();
                            const traceExport = {
                              id: trace.id,
                              exported_at: new Date().toISOString(),
                              created_at: trace.created_at,
                              message: trace.message,
                              assistant_response: trace.assistant_response,
                              agent_type: trace.agent_type,
                              intent_id: trace.intent_id,
                              classification_layer: trace.classification_layer,
                              routing_confidence: trace.routing_confidence,
                              path_type: trace.path_type,
                              tool_count: trace.tool_count,
                              tool_names: trace.tool_names,
                              total_cost_usd: trace.total_cost_usd,
                              total_tokens: trace.total_tokens,
                              latency_ms: trace.latency_ms,
                              validation_passed: trace.validation_passed,
                              validation_flags: trace.validation_flags,
                              session_id: trace.session_id,
                              user_id: trace.user_id,
                              request_id: trace.request_id,
                              rag_used: trace.rag_used,
                              rag_chunk_count: trace.rag_chunk_count,
                              sport: trace.sport,
                              age_band: trace.age_band,
                              readiness_rag: trace.readiness_rag,
                              acwr: trace.acwr,
                              phv_gate_fired: trace.phv_gate_fired,
                              crisis_detected: trace.crisis_detected,
                              turn_number: trace.turn_number,
                              response_length_chars: trace.response_length_chars,
                              cost_bucket: trace.cost_bucket,
                              latency_bucket: trace.latency_bucket,
                            };
                            const blob = new Blob([JSON.stringify(traceExport, null, 2)], { type: "application/json" });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement("a");
                            a.href = url;
                            a.download = `tomo-trace-${trace.id.slice(0, 8)}-${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.json`;
                            a.click();
                            URL.revokeObjectURL(url);
                            toast.success("Trace exported");
                          }}
                        >
                          Export Trace JSON
                        </button>
                      </div>

                      {/* User Message */}
                      <div className="mt-3 pt-2 border-t border-zinc-200">
                        <span className="text-[10px] text-zinc-400 uppercase tracking-wider font-medium">
                          User Message
                        </span>
                        <p className="text-xs text-zinc-700 mt-1 whitespace-pre-wrap bg-white rounded p-2 border border-zinc-100">
                          {trace.message || "(empty)"}
                        </p>
                      </div>

                      {/* Assistant Response */}
                      <div className="mt-2">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-zinc-400 uppercase tracking-wider font-medium">
                            Assistant Response
                          </span>
                          {trace.response_length_chars > 0 && (
                            <span className="text-[10px] text-zinc-300">
                              ({trace.response_length_chars} chars)
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-zinc-700 mt-1 whitespace-pre-wrap bg-blue-50 rounded p-2 border border-blue-100 max-h-48 overflow-y-auto">
                          {trace.assistant_response || "(not captured — traces before this update lack response text)"}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                No traces found for the selected filters and time range
              </CardContent>
            </Card>
          )}

          {/* Pagination */}
          {tracesData && tracesData.total_count > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-zinc-500">
                Showing {tracesOffset + 1}-
                {Math.min(tracesOffset + TRACES_LIMIT, tracesData.total_count)} of{" "}
                {tracesData.total_count.toLocaleString()}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs h-7"
                  disabled={tracesOffset === 0}
                  onClick={() => fetchTraces(Math.max(0, tracesOffset - TRACES_LIMIT))}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs h-7"
                  disabled={tracesOffset + TRACES_LIMIT >= tracesData.total_count}
                  onClick={() => fetchTraces(tracesOffset + TRACES_LIMIT)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}

          {/* Run Insights + Export All */}
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              className="text-xs"
              onClick={runFilteredInsights}
              disabled={filteredInsightsLoading}
            >
              {filteredInsightsLoading
                ? "Generating Insights..."
                : selectedTraceIds.size > 0
                  ? `Run Insights on ${selectedTraceIds.size} Selected Trace${selectedTraceIds.size > 1 ? "s" : ""}`
                  : hasActiveFilters
                    ? "Run Insights on Filtered Traces"
                    : "Run Insights on All Traces"}
            </Button>
            {filteredInsights && filteredInsights.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-blue-600 hover:text-blue-700"
                onClick={() => {
                  const exportData = {
                    exported_at: new Date().toISOString(),
                    time_range: timeRange === "custom"
                      ? { from: customFrom, to: customTo }
                      : timeRange,
                    filters: {
                      agent_type: filterAgentType !== "All" ? filterAgentType : null,
                      path_type: filterPathType !== "All" ? filterPathType : null,
                      intent: filterIntent.trim() || null,
                      cost_bucket: filterCostBucket !== "All" ? filterCostBucket : null,
                      latency_bucket: filterLatencyBucket !== "All" ? filterLatencyBucket : null,
                      validation: filterValidation !== "All" ? filterValidation : null,
                    },
                    traces_analyzed: filteredTracesAnalyzed,
                    insights: filteredInsights.map((i) => ({
                      category: i.category,
                      category_label: CATEGORY_LABEL[i.category] ?? i.category,
                      severity: i.severity,
                      question: i.question,
                      answer: i.answer,
                      traces_analyzed: i.traces_analyzed,
                      highlighted_traces: i.highlighted_traces,
                    })),
                    dashboard_snapshot: dashboardData ? {
                      total_traces: dashboardData.global_stats.total_traces,
                      avg_cost: dashboardData.global_stats.avg_cost,
                      error_rate: dashboardData.global_stats.error_rate,
                      safety_flags: dashboardData.global_stats.safety_flags,
                      agents: dashboardData.agents.map((a) => ({
                        agent: a.agent_type,
                        traces: a.total_traces,
                        success_rate: a.success_rate,
                        avg_cost: a.avg_cost,
                        avg_latency_ms: a.avg_latency_ms,
                        top_intents: a.top_intents,
                      })),
                    } : null,
                  };
                  const blob = new Blob(
                    [JSON.stringify(exportData, null, 2)],
                    { type: "application/json" }
                  );
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `tomo-ai-insights-all-${new Date().toISOString().slice(0, 16).replace(/:/g, "-")}.json`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
              >
                Export All
              </Button>
            )}
          </div>

          {/* Insights Results — Tabbed View */}
          {filteredInsights && filteredInsights.length > 0 && (
            <div>
              <Separator className="mb-4" />
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium">
                  {hasActiveFilters ? "Filtered Insights" : "Full Trace Insights"}
                </h3>
                <span className="text-xs text-muted-foreground">
                  {filteredInsights.length} insights from {filteredTracesAnalyzed} traces
                </span>
              </div>

              {/* Insight Category Tabs */}
              <div className="flex border-b border-zinc-200 mb-0 overflow-x-auto">
                {insightCategories.map((cat) => {
                  const sev = categorySeverity[cat] || "info";
                  const sevDot: Record<string, string> = {
                    critical: "bg-red-500",
                    high: "bg-orange-500",
                    medium: "bg-yellow-500",
                    info: "bg-zinc-400",
                  };
                  return (
                    <button
                      key={cat}
                      onClick={() => setActiveInsightTab(cat)}
                      className={`px-3 py-2.5 text-xs font-medium transition-colors relative whitespace-nowrap flex items-center gap-1.5 ${
                        activeInsightTab === cat
                          ? "text-zinc-900"
                          : "text-zinc-500 hover:text-zinc-700"
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${sevDot[sev] || sevDot.info}`} />
                      {CATEGORY_LABEL[cat] ?? cat}
                      {activeInsightTab === cat && (
                        <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-zinc-900 rounded-t" />
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Active Tab Content */}
              {activeInsightTab && insightsByCategory[activeInsightTab] && (
                <Card className="rounded-t-none border-t-0">
                  <CardHeader className="pb-2 pt-4 px-4 flex flex-row items-center justify-between">
                    <CardTitle className="text-sm font-medium">
                      {CATEGORY_LABEL[activeInsightTab] ?? activeInsightTab}
                    </CardTitle>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs text-blue-600 hover:text-blue-700 h-7"
                      onClick={() => {
                        const tabInsights = insightsByCategory[activeInsightTab];
                        const exportData = {
                          exported_at: new Date().toISOString(),
                          category: activeInsightTab,
                          category_label: CATEGORY_LABEL[activeInsightTab] ?? activeInsightTab,
                          time_range: timeRange === "custom"
                            ? { from: customFrom, to: customTo }
                            : timeRange,
                          filters: {
                            agent_type: filterAgentType !== "All" ? filterAgentType : null,
                            path_type: filterPathType !== "All" ? filterPathType : null,
                            intent: filterIntent.trim() || null,
                          },
                          insights: tabInsights.map((i) => ({
                            severity: i.severity,
                            question: i.question,
                            answer: i.answer,
                            traces_analyzed: i.traces_analyzed,
                            highlighted_traces: i.highlighted_traces,
                          })),
                        };
                        const blob = new Blob(
                          [JSON.stringify(exportData, null, 2)],
                          { type: "application/json" }
                        );
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = `tomo-insight-${activeInsightTab}-${new Date().toISOString().slice(0, 16).replace(/:/g, "-")}.json`;
                        a.click();
                        URL.revokeObjectURL(url);
                      }}
                    >
                      Export {CATEGORY_LABEL[activeInsightTab] ?? activeInsightTab}
                    </Button>
                  </CardHeader>
                  <CardContent className="px-4 pb-4 space-y-3">
                    {insightsByCategory[activeInsightTab].map((insight, idx) => (
                      <div
                        key={idx}
                        className={`border-l-4 rounded-r-lg p-3 ${
                          INSIGHT_SEV_STYLE[insight.severity] ?? "border-l-zinc-400 bg-zinc-50"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <Badge
                            variant="outline"
                            className={`text-[10px] uppercase tracking-wider ${SEV_BADGE[insight.severity] ?? ""}`}
                          >
                            {insight.severity}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {insight.traces_analyzed} traces
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
                                {traceId.slice(0, 8)}...
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}
            </div>
          )}
          {filteredInsights && filteredInsights.length === 0 && (
            <Card>
              <CardContent className="py-6 text-center text-sm text-muted-foreground">
                No insights generated from traces
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ================================================================ */}
      {/* TAB 3: Issues & Fixes                                           */}
      {/* ================================================================ */}
      {activeTab === "issues" && (
        <div className="space-y-6">
          {/* Header with Collection trigger */}
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-medium">Issue Detection & Fix Recommendations</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {issues.length} total issues ({open.length} open, {pending.length} fixes
                ready, {applied.length} applied)
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

          {/* Metrics Row */}
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
                value: issues.filter(
                  (i) =>
                    i.trend_data &&
                    typeof i.trend_data === "object" &&
                    "alert" in i.trend_data &&
                    i.trend_data.alert
                ).length,
                color:
                  issues.filter(
                    (i) =>
                      i.trend_data &&
                      typeof i.trend_data === "object" &&
                      "alert" in i.trend_data &&
                      i.trend_data.alert
                  ).length > 0
                    ? "text-red-600"
                    : "text-zinc-500",
              },
            ].map((m) => (
              <Card key={m.label}>
                <CardContent className="pt-4 pb-3">
                  {issuesLoading ? (
                    <Skeleton className="h-8 w-10" />
                  ) : (
                    <div className={`text-2xl font-medium ${m.color}`}>
                      {m.value}
                    </div>
                  )}
                  <div className="text-xs text-muted-foreground mt-1">
                    {m.label}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Separator />

          {/* Issue + Fix Queue */}
          {issuesLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <Card key={i}>
                  <CardContent className="py-5 space-y-3">
                    <Skeleton className="h-4 w-48" />
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-3 w-64" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : [...open, ...pending, ...applied].length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                No active issues. Run a collection to detect issues from traces.
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
                              <span className="text-sm font-medium">
                                {fix.title}
                              </span>
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
      )}

      {/* ================================================================ */}
      {/* TAB 4: Eval System (Phase 0+)                                    */}
      {/* ================================================================ */}
      {activeTab === "eval-system" && <EvalSystemTab />}

      {/* ================================================================ */}
      {/* TAB 5: Auto-Heal Loop (Phase 0+)                                 */}
      {/* ================================================================ */}
      {activeTab === "auto-heal" && <AutoHealTab />}
    </div>
  );
}
