"use client";

/**
 * CV AI Summaries — ops view of every athlete's player-profile summary.
 *
 * Read-only. Lets the content team spot stale or mis-generated summaries.
 * Editing happens inside the athlete's mobile app (Regenerate / Approve).
 */

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";

interface SummaryRow {
  athlete_id: string;
  ai_summary: string | null;
  ai_summary_status: "draft" | "approved" | "needs_update" | null;
  ai_summary_last_generated: string | null;
  ai_summary_approved_at: string | null;
  is_published: boolean;
  athlete: { name: string | null; email: string | null; sport: string | null } | null;
}

type StatusFilter = "all" | "draft" | "approved" | "needs_update";

const STATUS_META: Record<NonNullable<SummaryRow["ai_summary_status"]>, { label: string; variant: "default" | "secondary" | "outline" }> = {
  draft:         { label: "Draft",         variant: "outline" },
  approved:      { label: "Approved",      variant: "default" },
  needs_update:  { label: "Needs update",  variant: "secondary" },
};

export default function CVAISummariesPage() {
  const [rows, setRows] = useState<SummaryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [expanded, setExpanded] = useState<string | null>(null);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const qs = filter === "all" ? "" : `?status=${filter}`;
      const res = await fetch(`/api/v1/admin/cv-ai-summaries${qs}`, { credentials: "include" });
      if (!res.ok) {
        toast.error("Failed to load summaries");
        return;
      }
      const body = await res.json();
      setRows(body.summaries ?? []);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  return (
    <div className="flex flex-col gap-6 p-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">CV AI Summaries</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Current player-profile summary per athlete. Editing and approval happen in the
            athlete's mobile app; this is a read-only ops view.
          </p>
        </div>
        <div className="flex gap-2">
          {(["all", "draft", "needs_update", "approved"] as const).map((f) => (
            <Button
              key={f}
              size="sm"
              variant={filter === f ? "default" : "outline"}
              onClick={() => setFilter(f)}
            >
              {f === "all" ? "All" : f === "needs_update" ? "Needs update" : f.charAt(0).toUpperCase() + f.slice(1)}
            </Button>
          ))}
        </div>
      </header>

      {rows.length === 0 && !loading ? (
        <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
          No summaries in this bucket.
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Athlete</TableHead>
              <TableHead>Sport</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Published</TableHead>
              <TableHead>Last generated</TableHead>
              <TableHead>Summary</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const meta = r.ai_summary_status ? STATUS_META[r.ai_summary_status] : null;
              const isExpanded = expanded === r.athlete_id;
              return (
                <TableRow
                  key={r.athlete_id}
                  onClick={() => setExpanded(isExpanded ? null : r.athlete_id)}
                  className="cursor-pointer"
                >
                  <TableCell>
                    <div className="font-medium">{r.athlete?.name ?? r.athlete_id.slice(0, 8)}</div>
                    <div className="text-xs text-muted-foreground">{r.athlete?.email ?? ""}</div>
                  </TableCell>
                  <TableCell className="capitalize">{r.athlete?.sport ?? "—"}</TableCell>
                  <TableCell>
                    {meta ? <Badge variant={meta.variant}>{meta.label}</Badge> : <Badge variant="outline">No status</Badge>}
                  </TableCell>
                  <TableCell>{r.is_published ? <Badge>Live</Badge> : <Badge variant="outline">Draft</Badge>}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatRelative(r.ai_summary_last_generated)}
                  </TableCell>
                  <TableCell className="max-w-[420px]">
                    <div className={isExpanded ? "" : "line-clamp-2"} style={{ fontStyle: "italic" }}>
                      {r.ai_summary ?? "—"}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

function formatRelative(iso: string | null): string {
  if (!iso) return "—";
  try {
    const ms = Date.now() - new Date(iso).getTime();
    const hours = Math.floor(ms / 3600_000);
    if (hours < 1) return `${Math.floor(ms / 60_000)}m ago`;
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(iso).toLocaleDateString();
  } catch {
    return iso;
  }
}
