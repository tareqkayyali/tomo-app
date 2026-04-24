"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";

/**
 * Chat Quality — overview dashboard.
 * Summarizes last 7 days of judged turns by dimension and cost.
 * Drills into safety flags + disagreement queue via the two sub-pages.
 */

interface AggregateRow {
  day: string;
  sport: string | null;
  age_band: string | null;
  agent: string | null;
  sampling_stratum: string;
  turn_count: number;
  mean_faithfulness: number | null;
  mean_tone: number | null;
  mean_age_fit: number | null;
  total_cost_usd: number | null;
}

interface OpenFlagStats {
  open: number;
  critical: number;
  high: number;
}

export default function QualityOverviewPage() {
  const [aggregates, setAggregates] = useState<AggregateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [flagStats, setFlagStats] = useState<OpenFlagStats>({
    open: 0,
    critical: 0,
    high: 0,
  });
  const [disagreementCount, setDisagreementCount] = useState(0);

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    try {
      const [aggRes, flagsRes, disRes] = await Promise.all([
        fetch("/api/v1/admin/enterprise/quality/aggregate?days=7", {
          credentials: "include",
        }),
        fetch(
          "/api/v1/admin/ai-health/quality/safety-flags?status=open&limit=200",
          { credentials: "include" }
        ),
        fetch(
          "/api/v1/admin/ai-health/quality/disagreements?limit=1",
          { credentials: "include" }
        ),
      ]);

      if (!aggRes.ok) throw new Error("Failed to load aggregates");
      const aggData = await aggRes.json();
      setAggregates(aggData.rows ?? []);

      if (flagsRes.ok) {
        const f = await flagsRes.json();
        const rows: Array<{ severity: string }> = f.rows ?? [];
        setFlagStats({
          open: f.total ?? rows.length,
          critical: rows.filter((r) => r.severity === "critical").length,
          high: rows.filter((r) => r.severity === "high").length,
        });
      }

      if (disRes.ok) {
        const d = await disRes.json();
        setDisagreementCount(d.total ?? 0);
      }
    } catch (err: any) {
      toast.error(err.message ?? "Failed to load quality overview");
    } finally {
      setLoading(false);
    }
  }

  const totalTurns = aggregates.reduce((sum, r) => sum + (r.turn_count ?? 0), 0);
  const totalCost = aggregates.reduce(
    (sum, r) => sum + Number(r.total_cost_usd ?? 0),
    0
  );

  function meanAcross(field: keyof AggregateRow): number | null {
    let weighted = 0;
    let total = 0;
    for (const r of aggregates) {
      const v = r[field];
      if (typeof v === "number" && r.turn_count) {
        weighted += v * r.turn_count;
        total += r.turn_count;
      }
    }
    return total === 0 ? null : weighted / total;
  }

  const meanTone = meanAcross("mean_tone");
  const meanFaith = meanAcross("mean_faithfulness");
  const meanAge = meanAcross("mean_age_fit");

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Chat Quality</h1>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Chat Quality</h1>
        <p className="text-muted-foreground">
          7-day rolling quality telemetry across all judged chat turns.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="text-xs uppercase text-muted-foreground">Turns judged</div>
          <div className="text-2xl font-bold">{totalTurns.toLocaleString()}</div>
          <div className="text-xs text-muted-foreground">last 7 days</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs uppercase text-muted-foreground">Judging cost</div>
          <div className="text-2xl font-bold">${totalCost.toFixed(2)}</div>
          <div className="text-xs text-muted-foreground">last 7 days</div>
        </Card>
        <Link href="/admin/ai-health/quality/safety-flags">
          <Card className="p-4 hover:bg-accent transition-colors">
            <div className="text-xs uppercase text-muted-foreground">Open safety flags</div>
            <div className="text-2xl font-bold">{flagStats.open.toLocaleString()}</div>
            <div className="text-xs text-muted-foreground">
              {flagStats.critical} critical · {flagStats.high} high
            </div>
          </Card>
        </Link>
        <Link href="/admin/ai-health/quality/disagreements">
          <Card className="p-4 hover:bg-accent transition-colors">
            <div className="text-xs uppercase text-muted-foreground">Judge disagreements</div>
            <div className="text-2xl font-bold">{disagreementCount.toLocaleString()}</div>
            <div className="text-xs text-muted-foreground">|A−B|, |A−C|, |B−C| &gt; 0.3</div>
          </Card>
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-4">
          <div className="text-xs uppercase text-muted-foreground">Mean tone</div>
          <div className="text-xl font-bold">
            {meanTone !== null ? meanTone.toFixed(2) : "—"}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-xs uppercase text-muted-foreground">Mean faithfulness</div>
          <div className="text-xl font-bold">
            {meanFaith !== null ? meanFaith.toFixed(2) : "—"}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-xs uppercase text-muted-foreground">Mean age fit</div>
          <div className="text-xl font-bold">
            {meanAge !== null ? meanAge.toFixed(2) : "—"}
          </div>
        </Card>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Day</TableHead>
              <TableHead>Sport</TableHead>
              <TableHead>Age band</TableHead>
              <TableHead>Agent</TableHead>
              <TableHead>Stratum</TableHead>
              <TableHead className="text-right">Turns</TableHead>
              <TableHead className="text-right">Faith</TableHead>
              <TableHead className="text-right">Tone</TableHead>
              <TableHead className="text-right">Age fit</TableHead>
              <TableHead className="text-right">Cost</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {aggregates.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center text-muted-foreground py-10">
                  No judged turns in the last 7 days.
                </TableCell>
              </TableRow>
            ) : (
              aggregates.map((r, i) => (
                <TableRow key={i}>
                  <TableCell className="font-mono text-xs">
                    {r.day?.slice(0, 10)}
                  </TableCell>
                  <TableCell>{r.sport ?? "—"}</TableCell>
                  <TableCell>{r.age_band ?? "—"}</TableCell>
                  <TableCell>{r.agent ?? "—"}</TableCell>
                  <TableCell className="text-xs">{r.sampling_stratum}</TableCell>
                  <TableCell className="text-right">{r.turn_count}</TableCell>
                  <TableCell className="text-right">
                    {r.mean_faithfulness?.toFixed(2) ?? "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    {r.mean_tone?.toFixed(2) ?? "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    {r.mean_age_fit?.toFixed(2) ?? "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    ${Number(r.total_cost_usd ?? 0).toFixed(4)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
