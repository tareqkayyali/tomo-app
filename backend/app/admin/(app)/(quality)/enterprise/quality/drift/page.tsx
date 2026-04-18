"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

interface DriftAlert {
  id: string;
  dimension: string;
  segment_key: Record<string, unknown>;
  baseline_mean: number | null;
  current_mean: number | null;
  cusum_value: number | null;
  window_days: number;
  status: string;
  matched_pattern_id: string | null;
  proposed_pr_url: string | null;
  proposed_patch: Record<string, unknown> | null;
  alerted_at: string;
  resolution_notes: string | null;
}

const PAGE_SIZE = 50;

export default function DriftAlertsPage() {
  const [rows, setRows] = useState<DriftAlert[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [statusFilter, setStatusFilter] = useState<string>("open");
  const [dimFilter, setDimFilter] = useState<string>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (dimFilter !== "all") params.set("dimension", dimFilter);
      params.set("limit", String(PAGE_SIZE));
      params.set("offset", String(page * PAGE_SIZE));
      const res = await fetch(
        `/api/v1/admin/enterprise/quality/drift?${params.toString()}`,
        { credentials: "include" }
      );
      if (!res.ok) throw new Error("Failed to load drift alerts");
      const data = await res.json();
      setRows(data.rows ?? []);
      setTotal(data.total ?? 0);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, dimFilter]);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  async function updateStatus(id: string, status: string) {
    try {
      const res = await fetch(`/api/v1/admin/enterprise/quality/drift/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("Update failed");
      toast.success(`Marked ${status.replace("_", " ")}`);
      fetchRows();
    } catch (err: any) {
      toast.error(err.message);
    }
  }

  function delta(row: DriftAlert): string {
    if (row.baseline_mean === null || row.current_mean === null) return "—";
    const d = row.current_mean - row.baseline_mean;
    return `${d >= 0 ? "+" : ""}${d.toFixed(3)}`;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Drift Alerts</h1>
        <p className="text-muted-foreground">
          Rolling z-score of recent 7-day quality scores vs the 28-day baseline,
          per dimension × segment. Alerts fire at |z| &gt; 2.5 with adequate samples.
        </p>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Status</label>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v ?? "all")}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="patch_proposed">Patch proposed</SelectItem>
                <SelectItem value="patch_merged">Patch merged</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
                <SelectItem value="false_alarm">False alarm</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Dimension</label>
            <Select value={dimFilter} onValueChange={(v) => setDimFilter(v ?? "all")}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="faithfulness">Faithfulness</SelectItem>
                <SelectItem value="answer_quality">Answer quality</SelectItem>
                <SelectItem value="tone">Tone</SelectItem>
                <SelectItem value="age_fit">Age fit</SelectItem>
                <SelectItem value="conversational">Conversational</SelectItem>
                <SelectItem value="empathy">Empathy</SelectItem>
                <SelectItem value="personalization">Personalization</SelectItem>
                <SelectItem value="actionability">Actionability</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Alerted</TableHead>
              <TableHead>Dimension</TableHead>
              <TableHead>Segment</TableHead>
              <TableHead className="text-right">Baseline</TableHead>
              <TableHead className="text-right">Current</TableHead>
              <TableHead className="text-right">Δ</TableHead>
              <TableHead className="text-right">z</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Patch</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={i}><TableCell colSpan={10}><Skeleton className="h-6" /></TableCell></TableRow>
              ))
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center text-muted-foreground py-10">
                  No drift alerts match.
                </TableCell>
              </TableRow>
            ) : rows.map((r) => (
              <Fragment key={r.id}>
                <TableRow>
                  <TableCell className="font-mono text-xs">
                    {new Date(r.alerted_at).toLocaleString()}
                  </TableCell>
                  <TableCell>{r.dimension}</TableCell>
                  <TableCell className="text-xs max-w-xs truncate" title={JSON.stringify(r.segment_key)}>
                    {formatSegment(r.segment_key)}
                  </TableCell>
                  <TableCell className="text-right font-mono">{r.baseline_mean?.toFixed(3) ?? "—"}</TableCell>
                  <TableCell className="text-right font-mono">{r.current_mean?.toFixed(3) ?? "—"}</TableCell>
                  <TableCell className="text-right font-mono">{delta(r)}</TableCell>
                  <TableCell className="text-right font-mono">{r.cusum_value?.toFixed(2) ?? "—"}</TableCell>
                  <TableCell><Badge variant="outline">{r.status}</Badge></TableCell>
                  <TableCell>
                    {r.proposed_patch ? (
                      <Button size="sm" variant="ghost" onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}>
                        {expandedId === r.id ? "Hide" : "View"}
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                    {r.proposed_pr_url && (
                      <a
                        href={r.proposed_pr_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-blue-600 ml-2 underline"
                      >
                        Issue
                      </a>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {r.status === "open" || r.status === "patch_proposed" ? (
                      <div className="flex gap-1 justify-end">
                        <Button size="sm" variant="outline" onClick={() => updateStatus(r.id, "resolved")}>
                          Resolve
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => updateStatus(r.id, "false_alarm")}>
                          False alarm
                        </Button>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">{r.resolution_notes ?? ""}</span>
                    )}
                  </TableCell>
                </TableRow>
                {expandedId === r.id && r.proposed_patch && (
                  <TableRow>
                    <TableCell colSpan={10} className="bg-muted/40">
                      <pre className="text-xs font-mono whitespace-pre-wrap p-2">
                        {JSON.stringify(r.proposed_patch, null, 2)}
                      </pre>
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            ))}
          </TableBody>
        </Table>
      </Card>

      <div className="flex justify-between items-center text-sm">
        <div className="text-muted-foreground">
          {total === 0 ? "0 alerts"
            : `Showing ${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, total)} of ${total}`}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}>Previous</Button>
          <Button variant="outline" size="sm" disabled={(page + 1) * PAGE_SIZE >= total}
            onClick={() => setPage((p) => p + 1)}>Next</Button>
        </div>
      </div>
    </div>
  );
}

function formatSegment(seg: Record<string, unknown>): string {
  const entries = Object.entries(seg).filter(([k]) => k !== "kind");
  return entries.map(([k, v]) => `${k}=${v}`).join(" · ");
}
