"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";

interface ShadowRun {
  id: string;
  variant_name: string;
  variant_commit_hash: string | null;
  phase: string;
  canary_traffic_pct: number | null;
  started_at: string;
  ended_at: string | null;
  turns_evaluated: number;
  baseline_scores: Record<string, number | null> | null;
  variant_scores: Record<string, number | null> | null;
  p_values: Record<string, number | null> | null;
  decision: string | null;
  decision_reason: string | null;
}

const REVIEWED = ["tone", "answer_quality", "faithfulness"] as const;

export default function ShadowRunsPage() {
  const [rows, setRows] = useState<ShadowRun[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchRuns();
  }, []);

  async function fetchRuns() {
    try {
      const res = await fetch(
        "/api/v1/admin/enterprise/quality/shadow-runs?limit=100",
        { credentials: "include" }
      );
      if (!res.ok) throw new Error("Failed to load shadow runs");
      const data = await res.json();
      setRows(data.rows ?? []);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  function phaseBadge(phase: string) {
    const variants: Record<string, string> = {
      shadow: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200",
      canary_5: "bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-200",
      canary_10: "bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-200",
      canary_25: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-200",
      promoted: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200",
      rolled_back: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
    };
    return (
      <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${variants[phase] ?? ""}`}>
        {phase.replace("_", " ")}
      </span>
    );
  }

  function fmt(n: number | null | undefined): string {
    if (n === null || n === undefined) return "—";
    return n.toFixed(3);
  }

  function deltaCell(v: number | null | undefined, b: number | null | undefined): React.ReactNode {
    if (v === null || v === undefined || b === null || b === undefined) return "—";
    const d = v - b;
    const color =
      d > 0.02 ? "text-green-600" : d < -0.02 ? "text-red-600" : "text-muted-foreground";
    return (
      <span className={`font-mono ${color}`}>
        {fmt(v)} <span className="text-xs">({d >= 0 ? "+" : ""}{d.toFixed(3)})</span>
      </span>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Shadow &amp; Canary Runs</h1>
        <p className="text-muted-foreground">
          System-prompt variants being tested against the baseline. The evaluator
          runs every 15–30 min and decides promote / rollback / extend based on
          Welch t-tests across the reviewed dimensions.
        </p>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Variant</TableHead>
              <TableHead>Phase</TableHead>
              <TableHead>Started</TableHead>
              <TableHead className="text-right">Turns</TableHead>
              {REVIEWED.map((d) => (
                <TableHead key={d} className="text-right">{d}</TableHead>
              ))}
              <TableHead>Decision</TableHead>
              <TableHead>Reason</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}><TableCell colSpan={9}><Skeleton className="h-6" /></TableCell></TableRow>
              ))
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground py-10">
                  No shadow or canary runs.
                </TableCell>
              </TableRow>
            ) : rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell>
                  <div className="font-medium">{r.variant_name}</div>
                  {r.variant_commit_hash && (
                    <div className="text-xs text-muted-foreground font-mono">
                      {r.variant_commit_hash.slice(0, 7)}
                    </div>
                  )}
                </TableCell>
                <TableCell>{phaseBadge(r.phase)}</TableCell>
                <TableCell className="text-xs font-mono">
                  {new Date(r.started_at).toLocaleDateString()}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {r.turns_evaluated.toLocaleString()}
                </TableCell>
                {REVIEWED.map((d) => (
                  <TableCell key={d} className="text-right">
                    {deltaCell(r.variant_scores?.[d] ?? null, r.baseline_scores?.[d] ?? null)}
                  </TableCell>
                ))}
                <TableCell>
                  {r.decision ? (
                    <Badge variant="outline">{r.decision}</Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground">pending</span>
                  )}
                </TableCell>
                <TableCell className="text-xs max-w-xs truncate" title={r.decision_reason ?? ""}>
                  {r.decision_reason ?? "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
