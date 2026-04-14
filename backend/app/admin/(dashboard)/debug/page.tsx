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
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageGuide } from "@/components/admin/PageGuide";

// ── Types ─────────────────────────────────────────────────────────

interface DebugError {
  id: string;
  created_at: string;
  user_id: string | null;
  session_id: string | null;
  node: string | null;
  error_type: string | null;
  error_message: string;
  traceback: string | null;
  request_message: string | null;
  intent_id: string | null;
  severity: string;
  resolved: boolean;
}

interface DebugRequest {
  id: string;
  created_at: string;
  user_id: string | null;
  session_id: string | null;
  message: string | null;
  intent_id: string | null;
  agent: string | null;
  flow_pattern: string | null;
  status: string;
  latency_ms: number | null;
  cost_usd: number | null;
  tokens_used: number | null;
}

type TabType = "errors" | "requests";

// ── Helpers ───────────────────────────────────────────────────────

function severityBadge(severity: string) {
  if (severity === "error") return <Badge variant="destructive">error</Badge>;
  if (severity === "warning") return <Badge variant="outline" className="border-yellow-500 text-yellow-600">warning</Badge>;
  return <Badge variant="secondary">{severity}</Badge>;
}

function statusBadge(status: string) {
  if (status === "ok") return <Badge variant="outline" className="border-green-500 text-green-600">ok</Badge>;
  if (status === "error") return <Badge variant="destructive">error</Badge>;
  return <Badge variant="secondary">{status}</Badge>;
}

function relativeTime(isoStr: string): string {
  const diff = Date.now() - new Date(isoStr).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

function truncate(s: string | null | undefined, n: number): string {
  if (!s) return "-";
  return s.length > n ? s.slice(0, n) + "..." : s;
}

// ── Main Component ────────────────────────────────────────────────

export default function DebugPage() {
  const [tab, setTab] = useState<TabType>("errors");
  const [errors, setErrors] = useState<DebugError[]>([]);
  const [requests, setRequests] = useState<DebugRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Filters
  const [userId, setUserId] = useState("");
  const [severity, setSeverity] = useState("all");
  const [node, setNode] = useState("");
  const [status, setStatus] = useState("all");
  const [hours, setHours] = useState("24");
  const [limit, setLimit] = useState("50");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        type: tab,
        limit,
        hours,
      });
      if (userId) params.set("user_id", userId);
      if (tab === "errors") {
        if (severity !== "all") params.set("severity", severity);
        if (node) params.set("node", node);
      } else {
        if (status !== "all") params.set("status", status);
      }

      const res = await fetch(`/api/v1/admin/debug?${params}`, {
        credentials: "include",
      });

      if (!res.ok) {
        toast.error("Failed to load debug data");
        return;
      }

      const data = await res.json();
      if (tab === "errors") setErrors(data.errors ?? []);
      else setRequests(data.requests ?? []);
    } catch {
      toast.error("Connection error");
    } finally {
      setLoading(false);
    }
  }, [tab, userId, severity, node, status, hours, limit]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const errorCount = errors.filter((e) => !e.resolved).length;
  const errorRate =
    requests.length > 0
      ? ((requests.filter((r) => r.status !== "ok").length / requests.length) * 100).toFixed(1)
      : "0.0";
  const avgLatency =
    requests.length > 0
      ? Math.round(
          requests.reduce((sum, r) => sum + (r.latency_ms ?? 0), 0) /
            requests.filter((r) => r.latency_ms).length
        )
      : 0;
  const totalCost = requests
    .reduce((sum, r) => sum + (r.cost_usd ?? 0), 0)
    .toFixed(4);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">System Diagnostics</h1>
          <p className="text-muted-foreground mt-1">
            Live AI service errors and request telemetry. Persisted in Supabase across all Railway instances.
          </p>
        </div>
        <Button onClick={fetchData} disabled={loading} variant="outline">
          {loading ? "Loading..." : "Refresh"}
        </Button>
      </div>

      <PageGuide
        summary="Monitor Python AI service health in real time."
        details={[
          "Errors are written to Supabase on every crash — visible across all Railway instances.",
          "Requests track every chat turn: intent, agent, latency, cost.",
          "Use the user_id filter to reproduce a specific user's crash.",
          "The node filter lets you isolate crashes by graph node (supervisor, flow_controller, etc).",
        ]}
      />

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Open Errors ({hours}h)</CardDescription>
            <CardTitle className={errorCount > 0 ? "text-red-600" : "text-green-600"}>
              {errorCount}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Requests ({hours}h)</CardDescription>
            <CardTitle>{requests.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Error Rate</CardDescription>
            <CardTitle className={parseFloat(errorRate) > 5 ? "text-red-600" : ""}>
              {errorRate}%
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Avg Latency / Cost</CardDescription>
            <CardTitle>{avgLatency}ms / ${totalCost}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Tab Switcher */}
      <div className="flex gap-2 border-b">
        {(["errors", "requests"] as TabType[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`pb-2 px-1 text-sm font-medium border-b-2 transition-colors ${
              tab === t
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t === "errors" ? "Errors" : "Requests"}
            {t === "errors" && errorCount > 0 && (
              <Badge variant="destructive" className="ml-2 text-xs">
                {errorCount}
              </Badge>
            )}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Time Window</label>
          <Select value={hours} onValueChange={setHours}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">Last 1h</SelectItem>
              <SelectItem value="6">Last 6h</SelectItem>
              <SelectItem value="24">Last 24h</SelectItem>
              <SelectItem value="48">Last 48h</SelectItem>
              <SelectItem value="168">Last 7d</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Limit</label>
          <Select value={limit} onValueChange={setLimit}>
            <SelectTrigger className="w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="20">20</SelectItem>
              <SelectItem value="50">50</SelectItem>
              <SelectItem value="100">100</SelectItem>
              <SelectItem value="200">200</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">User ID</label>
          <Input
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            placeholder="Filter by user_id"
            className="w-64"
          />
        </div>
        {tab === "errors" && (
          <>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Severity</label>
              <Select value={severity} onValueChange={setSeverity}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="error">Error</SelectItem>
                  <SelectItem value="warning">Warning</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Node</label>
              <Input
                value={node}
                onChange={(e) => setNode(e.target.value)}
                placeholder="supervisor, flow_controller..."
                className="w-48"
              />
            </div>
          </>
        )}
        {tab === "requests" && (
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Status</label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="ok">Success</SelectItem>
                <SelectItem value="error">Error</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
        <Button onClick={fetchData} disabled={loading} size="sm">
          Apply
        </Button>
      </div>

      {/* Errors Table */}
      {tab === "errors" && (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-32">When</TableHead>
                  <TableHead className="w-24">Severity</TableHead>
                  <TableHead className="w-40">Node</TableHead>
                  <TableHead className="w-40">Error Type</TableHead>
                  <TableHead>Message</TableHead>
                  <TableHead className="w-32">User</TableHead>
                  <TableHead className="w-32">Intent</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {errors.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      {loading ? "Loading..." : "No errors in the selected time window"}
                    </TableCell>
                  </TableRow>
                )}
                {errors.map((err) => (
                  <>
                    <TableRow
                      key={err.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => setExpandedId(expandedId === err.id ? null : err.id)}
                    >
                      <TableCell className="text-xs text-muted-foreground">
                        {relativeTime(err.created_at)}
                      </TableCell>
                      <TableCell>{severityBadge(err.severity)}</TableCell>
                      <TableCell className="text-xs font-mono">{err.node ?? "-"}</TableCell>
                      <TableCell className="text-xs font-mono text-orange-600">
                        {err.error_type ?? "-"}
                      </TableCell>
                      <TableCell className="text-xs">
                        {truncate(err.error_message, 80)}
                      </TableCell>
                      <TableCell className="text-xs font-mono text-muted-foreground">
                        {err.user_id ? err.user_id.slice(0, 8) + "..." : "-"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {err.intent_id ?? "-"}
                      </TableCell>
                    </TableRow>
                    {expandedId === err.id && (
                      <TableRow key={`${err.id}-expanded`}>
                        <TableCell colSpan={7} className="bg-muted/30 p-4">
                          <div className="space-y-3">
                            {err.request_message && (
                              <div>
                                <p className="text-xs font-semibold text-muted-foreground mb-1">User message</p>
                                <p className="text-sm">{err.request_message}</p>
                              </div>
                            )}
                            <div>
                              <p className="text-xs font-semibold text-muted-foreground mb-1">Full error</p>
                              <p className="text-sm text-red-600">{err.error_message}</p>
                            </div>
                            {err.traceback && (
                              <div>
                                <p className="text-xs font-semibold text-muted-foreground mb-1">Traceback</p>
                                <pre className="text-xs bg-background rounded p-3 overflow-auto max-h-64 border">
                                  {err.traceback}
                                </pre>
                              </div>
                            )}
                            <div className="text-xs text-muted-foreground space-y-1">
                              <p>User ID: {err.user_id ?? "-"}</p>
                              <p>Session ID: {err.session_id ?? "-"}</p>
                              <p>Error ID: {err.id}</p>
                              <p>Created: {new Date(err.created_at).toLocaleString()}</p>
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Requests Table */}
      {tab === "requests" && (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-32">When</TableHead>
                  <TableHead className="w-20">Status</TableHead>
                  <TableHead className="w-36">Intent</TableHead>
                  <TableHead className="w-28">Agent</TableHead>
                  <TableHead>Message</TableHead>
                  <TableHead className="w-24">Latency</TableHead>
                  <TableHead className="w-20">Cost</TableHead>
                  <TableHead className="w-24">Tokens</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requests.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                      {loading ? "Loading..." : "No requests in the selected time window"}
                    </TableCell>
                  </TableRow>
                )}
                {requests.map((req) => (
                  <TableRow key={req.id}>
                    <TableCell className="text-xs text-muted-foreground">
                      {relativeTime(req.created_at)}
                    </TableCell>
                    <TableCell>{statusBadge(req.status)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {req.intent_id ?? "-"}
                    </TableCell>
                    <TableCell className="text-xs font-mono text-muted-foreground">
                      {req.agent ?? "-"}
                    </TableCell>
                    <TableCell className="text-xs">{truncate(req.message, 60)}</TableCell>
                    <TableCell className="text-xs">
                      {req.latency_ms ? `${Math.round(req.latency_ms)}ms` : "-"}
                    </TableCell>
                    <TableCell className="text-xs">
                      {req.cost_usd != null ? `$${req.cost_usd.toFixed(4)}` : "-"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {req.tokens_used?.toLocaleString() ?? "-"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
