"use client";

import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

interface DisagreementRow {
  id: string;
  turn_id: string;
  sport: string | null;
  age_band: string | null;
  agent: string | null;
  sampling_stratum: string;
  disagreement_max: number;
  has_rag: boolean;
  a_tone: number | null;
  b_tone: number | null;
  c_tone: number | null;
  a_answer_quality: number | null;
  b_answer_quality: number | null;
  c_answer_quality: number | null;
  a_age_fit: number | null;
  b_age_fit: number | null;
  c_age_fit: number | null;
  a_faithfulness: number | null;
  b_faithfulness: number | null;
  c_faithfulness: number | null;
  total_judge_cost_usd: number | null;
  created_at: string;
}

const PAGE_SIZE = 50;

export default function DisagreementsPage() {
  const [rows, setRows] = useState<DisagreementRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [agentFilter, setAgentFilter] = useState<string>("all");
  const [ageBandFilter, setAgeBandFilter] = useState<string>("all");
  const [minDisagreement, setMinDisagreement] = useState<string>("0.3");

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (agentFilter !== "all") params.set("agent", agentFilter);
      if (ageBandFilter !== "all") params.set("ageBand", ageBandFilter);
      params.set("minDisagreement", minDisagreement);
      params.set("limit", String(PAGE_SIZE));
      params.set("offset", String(page * PAGE_SIZE));

      const res = await fetch(
        `/api/v1/admin/enterprise/quality/disagreements?${params.toString()}`,
        { credentials: "include" }
      );
      if (!res.ok) throw new Error("Failed to load disagreements");
      const data = await res.json();
      setRows(data.rows ?? []);
      setTotal(data.total ?? 0);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [page, agentFilter, ageBandFilter, minDisagreement]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  /** Renders A / B / C for a single dimension, inline. "—" when null. */
  function ScoreCell({
    a,
    b,
    c,
  }: {
    a: number | null;
    b: number | null;
    c: number | null;
  }) {
    const f = (x: number | null) => (x === null ? "—" : x.toFixed(2));
    return (
      <span className="font-mono text-xs">
        {f(a)} / {f(b)} / {f(c)}
      </span>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Judge Disagreements</h1>
        <p className="text-muted-foreground">
          Turns where the three judges diverged by more than the threshold.
          Useful for calibrating judges and curating the golden test set.
          Columns show A (Haiku) / B (GPT-4o-mini) / C (rules).
        </p>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Agent</label>
            <Select value={agentFilter} onValueChange={(v) => setAgentFilter(v ?? "all")}>
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="timeline">Timeline</SelectItem>
                <SelectItem value="output">Output</SelectItem>
                <SelectItem value="mastery">Mastery</SelectItem>
                <SelectItem value="orchestrator">Orchestrator</SelectItem>
                <SelectItem value="capsule">Capsule</SelectItem>
                <SelectItem value="fast_path">Fast path</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Age band</label>
            <Select value={ageBandFilter} onValueChange={(v) => setAgeBandFilter(v ?? "all")}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="u13">U13</SelectItem>
                <SelectItem value="u15">U15</SelectItem>
                <SelectItem value="u17">U17</SelectItem>
                <SelectItem value="u19_plus">U19+</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Min disagreement</label>
            <Select value={minDisagreement} onValueChange={(v) => setMinDisagreement(v ?? "0.3")}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0.2">&gt; 0.2</SelectItem>
                <SelectItem value="0.3">&gt; 0.3 (default)</SelectItem>
                <SelectItem value="0.4">&gt; 0.4</SelectItem>
                <SelectItem value="0.5">&gt; 0.5</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>Agent</TableHead>
              <TableHead>Age</TableHead>
              <TableHead>Sport</TableHead>
              <TableHead>Stratum</TableHead>
              <TableHead className="text-right">Max Δ</TableHead>
              <TableHead>Tone A/B/C</TableHead>
              <TableHead>Answer A/B/C</TableHead>
              <TableHead>Age fit A/B/C</TableHead>
              <TableHead>Faith A/B/C</TableHead>
              <TableHead>Turn</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={11}>
                    <Skeleton className="h-6" />
                  </TableCell>
                </TableRow>
              ))
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={11} className="text-center text-muted-foreground py-10">
                  No disagreements above threshold.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-xs">
                    {new Date(r.created_at).toLocaleString()}
                  </TableCell>
                  <TableCell>{r.agent ?? "—"}</TableCell>
                  <TableCell>{r.age_band ?? "—"}</TableCell>
                  <TableCell>{r.sport ?? "—"}</TableCell>
                  <TableCell className="text-xs">{r.sampling_stratum}</TableCell>
                  <TableCell className="text-right font-mono">
                    {r.disagreement_max.toFixed(2)}
                  </TableCell>
                  <TableCell>
                    <ScoreCell a={r.a_tone} b={r.b_tone} c={r.c_tone} />
                  </TableCell>
                  <TableCell>
                    <ScoreCell
                      a={r.a_answer_quality}
                      b={r.b_answer_quality}
                      c={r.c_answer_quality}
                    />
                  </TableCell>
                  <TableCell>
                    <ScoreCell a={r.a_age_fit} b={r.b_age_fit} c={r.c_age_fit} />
                  </TableCell>
                  <TableCell>
                    <ScoreCell
                      a={r.a_faithfulness}
                      b={r.b_faithfulness}
                      c={r.c_faithfulness}
                    />
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {r.turn_id?.slice(0, 8)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      <div className="flex justify-between items-center text-sm">
        <div className="text-muted-foreground">
          {total === 0
            ? "0 rows"
            : `Showing ${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, total)} of ${total}`}
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={(page + 1) * PAGE_SIZE >= total}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
