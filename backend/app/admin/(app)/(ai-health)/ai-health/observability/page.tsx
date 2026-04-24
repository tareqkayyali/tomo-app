"use client";

/**
 * Observability Hub — Claude cost visibility, quick-links to existing
 * AI health / eval / debug surfaces.
 *
 * Phase 4d ships the Claude cost dashboard as the primary actionable
 * view (reads daily_api_costs). Event pipeline metrics and eval-report
 * browser are Phase 5 additions.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import { toast } from "sonner";

interface DayRow {
  day: string | null;
  agent_type: string | null;
  model: string | null;
  call_count: number | null;
  total_cost: number | null;
  avg_latency: number | null;
  total_input: number | null;
  total_output: number | null;
}
interface BucketRow {
  bucket: string;
  call_count: number;
  total_cost: number;
  total_input: number;
  total_output: number;
  avg_latency: number;
}
interface CostResponse {
  since: string;
  days: number;
  groupBy: "day" | "agent" | "model";
  totals: {
    total_cost: number;
    total_calls: number;
    total_input: number;
    total_output: number;
  };
  rows: (DayRow | BucketRow)[];
}

const WINDOWS = [
  { value: "7", label: "Last 7 days" },
  { value: "14", label: "Last 14 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
] as const;

const GROUPS = [
  { value: "day", label: "By day" },
  { value: "agent", label: "By agent" },
  { value: "model", label: "By model" },
] as const;

export default function ObservabilityPage() {
  const [days, setDays] = useState<"7" | "14" | "30" | "90">("14");
  const [groupBy, setGroupBy] = useState<"day" | "agent" | "model">("day");
  const [data, setData] = useState<CostResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ days, group_by: groupBy });
      const res = await fetch(`/api/v1/admin/observability/costs?${qs}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      setData((await res.json()) as CostResponse);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [days, groupBy]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Observability</h1>
        <p className="text-sm text-muted-foreground">
          Claude API spend, call volume, latency. Data comes from
          <code className="font-mono text-xs mx-1">api_usage_log</code>
          (written by
          <code className="font-mono text-xs mx-1">trackedClaudeCall()</code>)
          aggregated into the <code>daily_api_costs</code> view.
        </p>
      </header>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Window</span>
          <Select
            value={days}
            onValueChange={(v) =>
              setDays((v ?? "14") as "7" | "14" | "30" | "90")
            }
          >
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {WINDOWS.map((w) => (
                <SelectItem key={w.value} value={w.value}>
                  {w.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Group</span>
          <Select
            value={groupBy}
            onValueChange={(v) =>
              setGroupBy((v ?? "day") as "day" | "agent" | "model")
            }
          >
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {GROUPS.map((g) => (
                <SelectItem key={g.value} value={g.value}>
                  {g.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Headline cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <StatCard
          label="Total cost"
          value={`$${(data?.totals.total_cost ?? 0).toFixed(2)}`}
          hint="Sum across the window"
        />
        <StatCard
          label="API calls"
          value={(data?.totals.total_calls ?? 0).toLocaleString()}
        />
        <StatCard
          label="Input tokens"
          value={(data?.totals.total_input ?? 0).toLocaleString()}
        />
        <StatCard
          label="Output tokens"
          value={(data?.totals.total_output ?? 0).toLocaleString()}
        />
      </div>

      {/* Main table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Spend breakdown — {GROUPS.find((g) => g.value === groupBy)?.label}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-sm text-muted-foreground">Loading...</div>
          ) : !data || data.rows.length === 0 ? (
            <div className="rounded-lg border p-6 text-center text-sm text-muted-foreground">
              No API usage logged in this window.
            </div>
          ) : (
            <CostTable data={data} />
          )}
        </CardContent>
      </Card>

      {/* Quick-links to sibling observability surfaces */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <QuickLink
          href="/admin/ai-health"
          title="AI Health"
          subtitle="Issues, fixes, monthly digest, trace log"
        />
        <QuickLink
          href="/admin/enterprise/quality"
          title="Chat Quality"
          subtitle="Eval scores, safety flags, drift alerts"
        />
        <QuickLink
          href="/admin/system/audit"
          title="Audit Log"
          subtitle="Every CMS mutation, actor, diff"
        />
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card>
      <CardContent className="space-y-1 pt-6">
        <div className="text-xs uppercase text-muted-foreground">{label}</div>
        <div className="text-2xl font-semibold">{value}</div>
        {hint ? (
          <div className="text-xs text-muted-foreground">{hint}</div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function QuickLink({
  href,
  title,
  subtitle,
}: {
  href: string;
  title: string;
  subtitle: string;
}) {
  return (
    <Link href={href}>
      <Card className="hover:bg-accent/40 transition-colors">
        <CardContent className="pt-6 space-y-1">
          <div className="font-medium">{title}</div>
          <div className="text-xs text-muted-foreground">{subtitle}</div>
        </CardContent>
      </Card>
    </Link>
  );
}

function CostTable({ data }: { data: CostResponse }) {
  if (data.groupBy === "day") {
    const rows = data.rows as DayRow[];
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Day</TableHead>
            <TableHead>Agent</TableHead>
            <TableHead>Model</TableHead>
            <TableHead className="text-right">Calls</TableHead>
            <TableHead className="text-right">Cost (USD)</TableHead>
            <TableHead className="text-right">Avg latency</TableHead>
            <TableHead className="text-right">In tokens</TableHead>
            <TableHead className="text-right">Out tokens</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r, i) => (
            <TableRow key={`${r.day}-${r.agent_type}-${r.model}-${i}`}>
              <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                {r.day ?? "—"}
              </TableCell>
              <TableCell>
                <Badge variant="outline">{r.agent_type ?? "—"}</Badge>
              </TableCell>
              <TableCell className="text-xs font-mono">
                {r.model ?? "—"}
              </TableCell>
              <TableCell className="text-right">
                {(r.call_count ?? 0).toLocaleString()}
              </TableCell>
              <TableCell className="text-right font-medium">
                ${(r.total_cost ?? 0).toFixed(3)}
              </TableCell>
              <TableCell className="text-right text-xs">
                {r.avg_latency ? `${Math.round(r.avg_latency)}ms` : "—"}
              </TableCell>
              <TableCell className="text-right text-xs text-muted-foreground">
                {(r.total_input ?? 0).toLocaleString()}
              </TableCell>
              <TableCell className="text-right text-xs text-muted-foreground">
                {(r.total_output ?? 0).toLocaleString()}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  }

  const rows = data.rows as BucketRow[];
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{data.groupBy === "agent" ? "Agent" : "Model"}</TableHead>
          <TableHead className="text-right">Calls</TableHead>
          <TableHead className="text-right">Cost (USD)</TableHead>
          <TableHead className="text-right">Avg latency</TableHead>
          <TableHead className="text-right">In tokens</TableHead>
          <TableHead className="text-right">Out tokens</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.bucket}>
            <TableCell>
              <Badge variant="outline">{r.bucket}</Badge>
            </TableCell>
            <TableCell className="text-right">
              {r.call_count.toLocaleString()}
            </TableCell>
            <TableCell className="text-right font-medium">
              ${r.total_cost.toFixed(3)}
            </TableCell>
            <TableCell className="text-right text-xs">
              {r.avg_latency ? `${Math.round(r.avg_latency)}ms` : "—"}
            </TableCell>
            <TableCell className="text-right text-xs text-muted-foreground">
              {r.total_input.toLocaleString()}
            </TableCell>
            <TableCell className="text-right text-xs text-muted-foreground">
              {r.total_output.toLocaleString()}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
