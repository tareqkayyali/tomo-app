"use client";

/**
 * /admin/enterprise/protocols/generations
 *
 * Audit view for the prompt-layer PD protocol generator.
 * One row per Claude generation. Clicking a row opens a drawer-style
 * detail panel with the full prompt, draft JSON, RAG grounding, and
 * (when saved) a link to the live protocol.
 *
 * Access: institutional_pd sees their own generations + any on a tenant
 * they belong to. super_admin sees all.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import { toast } from "sonner";
import { ChevronLeft, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";

type Outcome = "pending" | "saved" | "edited_then_saved" | "discarded" | "failed";

interface GenerationSummary {
  generation_id: string;
  created_by: string;
  created_by_email: string | null;
  tenant_id: string | null;
  prompt: string;
  scope_hints: Record<string, string>;
  outcome: Outcome;
  model: string;
  cost_usd: number;
  latency_ms: number | null;
  saved_protocol_id: string | null;
  created_at: string;
}

interface GenerationDetail extends GenerationSummary {
  draft_protocol: Record<string, unknown>;
  rag_chunks_used: Array<{ chunk_id: string; title: string; evidence_grade: string | null }>;
  validation_errors: Array<{ path: string; message: string }> | null;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
}

const OUTCOME_COLORS: Record<Outcome, string> = {
  pending: "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/30",
  saved: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
  edited_then_saved: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30",
  discarded: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30",
  failed: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30",
};

const OUTCOMES: ("all" | Outcome)[] = [
  "all",
  "pending",
  "saved",
  "edited_then_saved",
  "discarded",
  "failed",
];

export default function GenerationsAuditPage() {
  const router = useRouter();
  const [rows, setRows] = useState<GenerationSummary[] | null>(null);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState<"all" | Outcome>("all");
  const [selected, setSelected] = useState<GenerationDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    fetchList();
  }, [filter]);

  async function fetchList() {
    setRows(null);
    try {
      const qs = filter === "all" ? "" : `?outcome=${filter}`;
      const res = await fetch(`/api/v1/admin/enterprise/protocols/generations${qs}`);
      if (!res.ok) throw new Error("Failed to load generations");
      const data = await res.json();
      setRows(data.generations);
      setTotal(data.total ?? 0);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Load failed");
      setRows([]);
    }
  }

  async function openDetail(id: string) {
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/v1/admin/enterprise/protocols/generations/${id}`);
      if (!res.ok) throw new Error("Failed to load detail");
      const data = await res.json();
      setSelected(data.generation);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Load failed");
    } finally {
      setDetailLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push("/admin/enterprise/protocols")}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Sparkles className="size-4 text-primary" />
              Protocol Generations
            </h1>
            <p className="text-xs text-muted-foreground">
              Audit trail of prompt-driven PD protocol drafts.
              {rows !== null && ` ${total} total.`}
            </p>
          </div>
        </div>
      </div>

      {/* Filter bar */}
      <Card className="p-2">
        <div className="flex flex-wrap gap-1">
          {OUTCOMES.map((o) => (
            <button
              key={o}
              onClick={() => setFilter(o)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                filter === o
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-muted/50 text-muted-foreground border-border hover:bg-muted"
              }`}
            >
              {o}
            </button>
          ))}
        </div>
      </Card>

      {/* Table */}
      <Card>
        {rows === null ? (
          <div className="p-4 space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No generations yet. Open the protocol builder and use{" "}
            <span className="font-medium">Generate from description</span>.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">When</TableHead>
                <TableHead className="text-xs">Outcome</TableHead>
                <TableHead className="text-xs">Prompt</TableHead>
                <TableHead className="text-xs">Model</TableHead>
                <TableHead className="text-xs text-right">Cost</TableHead>
                <TableHead className="text-xs text-right">Latency</TableHead>
                <TableHead className="text-xs">Saved as</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow
                  key={r.generation_id}
                  className="cursor-pointer"
                  onClick={() => openDetail(r.generation_id)}
                >
                  <TableCell className="text-xs whitespace-nowrap">
                    {new Date(r.created_at).toLocaleString()}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`${OUTCOME_COLORS[r.outcome]} text-[10px]`}>
                      {r.outcome.replace(/_/g, " ")}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs max-w-md truncate">{r.prompt}</TableCell>
                  <TableCell className="text-xs whitespace-nowrap">{r.model}</TableCell>
                  <TableCell className="text-xs text-right whitespace-nowrap">
                    ${r.cost_usd.toFixed(4)}
                  </TableCell>
                  <TableCell className="text-xs text-right whitespace-nowrap">
                    {r.latency_ms ? `${r.latency_ms}ms` : "—"}
                  </TableCell>
                  <TableCell className="text-xs">
                    {r.saved_protocol_id ? (
                      <Link
                        href={`/admin/enterprise/protocols/builder?id=${r.saved_protocol_id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="text-primary hover:underline font-mono"
                      >
                        {r.saved_protocol_id.slice(0, 8)}…
                      </Link>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {/* Detail drawer (inline panel, not a modal) */}
      {selected && (
        <Card className="p-4 border-primary/30">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-xs text-muted-foreground">Generation</p>
              <p className="font-mono text-xs">{selected.generation_id}</p>
            </div>
            <Button size="sm" variant="ghost" onClick={() => setSelected(null)}>
              Close
            </Button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <Kv k="Created by" v={selected.created_by_email ?? selected.created_by} />
            <Kv k="Created at" v={new Date(selected.created_at).toLocaleString()} />
            <Kv k="Outcome" v={selected.outcome} />
            <Kv k="Model" v={selected.model} />
            <Kv k="Input tokens" v={String(selected.input_tokens)} />
            <Kv k="Output tokens" v={String(selected.output_tokens)} />
            <Kv k="Cache read" v={String(selected.cache_read_tokens)} />
            <Kv k="Cache write" v={String(selected.cache_write_tokens)} />
          </div>

          <div className="mt-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
              Prompt
            </p>
            <div className="rounded border bg-background/50 p-2 text-xs whitespace-pre-wrap">
              {selected.prompt}
            </div>
          </div>

          {Object.keys(selected.scope_hints || {}).length > 0 && (
            <div className="mt-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                Scope hints
              </p>
              <pre className="rounded border bg-background/50 p-2 text-[11px] font-mono">
                {JSON.stringify(selected.scope_hints, null, 2)}
              </pre>
            </div>
          )}

          {selected.validation_errors && selected.validation_errors.length > 0 && (
            <div className="mt-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-destructive mb-1">
                Validation errors
              </p>
              <ul className="list-disc list-inside text-xs space-y-0.5 text-muted-foreground">
                {selected.validation_errors.map((e, i) => (
                  <li key={i}>
                    <span className="font-mono text-[11px]">{e.path || "$"}</span>: {e.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
              Draft protocol JSON
            </p>
            <pre className="rounded border bg-background/50 p-2 text-[11px] font-mono max-h-80 overflow-auto">
              {JSON.stringify(selected.draft_protocol, null, 2)}
            </pre>
          </div>

          {selected.rag_chunks_used && selected.rag_chunks_used.length > 0 && (
            <div className="mt-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                Grounding chunks ({selected.rag_chunks_used.length})
              </p>
              <ul className="space-y-0.5">
                {selected.rag_chunks_used.map((c) => (
                  <li key={c.chunk_id} className="text-[11px] text-muted-foreground">
                    [Grade {c.evidence_grade ?? "—"}] {c.title}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      )}

      {detailLoading && (
        <Card className="p-4">
          <Skeleton className="h-24 w-full" />
        </Card>
      )}
    </div>
  );
}

function Kv({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase text-muted-foreground">{k}</p>
      <p className="text-xs break-all">{v}</p>
    </div>
  );
}
