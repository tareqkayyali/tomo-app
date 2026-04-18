"use client";

import { useCallback, useEffect, useState } from "react";
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

interface GoldenScenario {
  id: string;
  scenario_key: string;
  suite: string;
  user_message: string;
  expected_agent: string | null;
  source: string;
  is_frozen: boolean;
  last_passing_score: number | null;
  consecutive_passes: number;
  scheduled_removal_at: string | null;
  added_at: string;
}

const PAGE_SIZE = 50;

export default function GoldenSetPage() {
  const [rows, setRows] = useState<GoldenScenario[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [suiteFilter, setSuiteFilter] = useState<string>("all");
  const [frozenFilter, setFrozenFilter] = useState<string>("all");

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (sourceFilter !== "all") params.set("source", sourceFilter);
      if (suiteFilter !== "all") params.set("suite", suiteFilter);
      if (frozenFilter !== "all") params.set("isFrozen", frozenFilter);
      params.set("limit", String(PAGE_SIZE));
      params.set("offset", String(page * PAGE_SIZE));
      const res = await fetch(
        `/api/v1/admin/enterprise/quality/golden-set?${params.toString()}`,
        { credentials: "include" }
      );
      if (!res.ok) throw new Error("Failed to load golden set");
      const data = await res.json();
      setRows(data.rows ?? []);
      setTotal(data.total ?? 0);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [page, sourceFilter, suiteFilter, frozenFilter]);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  async function patch(id: string, body: Record<string, unknown>, success: string) {
    try {
      const res = await fetch(`/api/v1/admin/enterprise/quality/golden-set/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Update failed");
      toast.success(success);
      fetchRows();
    } catch (err: any) {
      toast.error(err.message);
    }
  }

  function sourceBadge(source: string) {
    const variants: Record<string, string> = {
      curated: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200",
      live_low_score: "bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-200",
      regression_canary: "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-200",
    };
    return (
      <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${variants[source] ?? ""}`}>
        {source.replace("_", " ")}
      </span>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Golden Test Set</h1>
        <p className="text-muted-foreground">
          Curated regression scenarios for the eval harness. Live candidates are
          added weekly from low-scoring turns. Frozen regression canaries never
          rotate out. Target: 20% frozen.
        </p>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Source</label>
            <Select value={sourceFilter} onValueChange={(v) => setSourceFilter(v ?? "all")}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="curated">Curated</SelectItem>
                <SelectItem value="live_low_score">Live low score</SelectItem>
                <SelectItem value="regression_canary">Regression canary</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Suite</label>
            <Select value={suiteFilter} onValueChange={(v) => setSuiteFilter(v ?? "all")}>
              <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {["s1","s2","s3","s4","s5","s6","s7","s8"].map((s) => (
                  <SelectItem key={s} value={s}>{s.toUpperCase()}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Frozen</label>
            <Select value={frozenFilter} onValueChange={(v) => setFrozenFilter(v ?? "all")}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="true">Frozen</SelectItem>
                <SelectItem value="false">Not frozen</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Added</TableHead>
              <TableHead>Suite</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Agent</TableHead>
              <TableHead>Scenario</TableHead>
              <TableHead className="text-right">Last score</TableHead>
              <TableHead className="text-right">Passes</TableHead>
              <TableHead>Frozen</TableHead>
              <TableHead>Removal</TableHead>
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
                  No scenarios match.
                </TableCell>
              </TableRow>
            ) : rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-mono text-xs">
                  {new Date(r.added_at).toLocaleDateString()}
                </TableCell>
                <TableCell><Badge variant="outline">{r.suite.toUpperCase()}</Badge></TableCell>
                <TableCell>{sourceBadge(r.source)}</TableCell>
                <TableCell>{r.expected_agent ?? "—"}</TableCell>
                <TableCell className="max-w-md truncate" title={r.user_message}>
                  {r.user_message}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {r.last_passing_score?.toFixed(2) ?? "—"}
                </TableCell>
                <TableCell className="text-right">{r.consecutive_passes}</TableCell>
                <TableCell>
                  {r.is_frozen ? (
                    <Badge variant="outline">Frozen</Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-xs">
                  {r.scheduled_removal_at
                    ? new Date(r.scheduled_removal_at).toLocaleDateString()
                    : "—"}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex gap-1 justify-end">
                    {!r.is_frozen ? (
                      <Button size="sm" variant="outline"
                        onClick={() => patch(r.id, { is_frozen: true, source: "regression_canary" }, "Frozen as canary")}>
                        Freeze
                      </Button>
                    ) : (
                      <Button size="sm" variant="ghost"
                        onClick={() => patch(r.id, { is_frozen: false, source: "curated" }, "Unfrozen")}>
                        Unfreeze
                      </Button>
                    )}
                    {r.scheduled_removal_at ? (
                      <Button size="sm" variant="ghost"
                        onClick={() => patch(r.id, { scheduled_removal_at: null }, "Removal cancelled")}>
                        Keep
                      </Button>
                    ) : null}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <div className="flex justify-between items-center text-sm">
        <div className="text-muted-foreground">
          {total === 0 ? "0 scenarios"
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
