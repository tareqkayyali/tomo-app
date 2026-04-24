"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface AuditRow {
  id: string;
  actor: string;
  action: string;
  target_table: string;
  target_id: string | null;
  reason: string | null;
  created_at: string;
}

const ACTION_FILTERS = [
  "all",
  "toggle_enabled",
  "fix_applied",
  "fix_verified",
  "fix_reverted",
  "baseline_promoted",
  "pattern_toggled",
  "issue_triaged",
  "config_updated",
] as const;

const TABLE_FILTERS = [
  "all",
  "ai_auto_heal_config",
  "ai_fixes",
  "ai_issues",
  "ai_eval_baselines",
  "auto_repair_patterns",
] as const;

const LIMIT_OPTIONS = ["50", "100", "200"] as const;

function fmtDate(iso: string): string {
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
}

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(diff) || diff < 0) return "—";
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

export default function AuditPage() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState<string>("all");
  const [table, setTable] = useState<string>("all");
  const [limit, setLimit] = useState<string>("100");

  const fetchAudit = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ limit });
      if (action !== "all") qs.set("action", action);
      if (table !== "all") qs.set("target_table", table);
      const res = await fetch(`/api/v1/admin/ai-health/audit?${qs}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      const body = await res.json();
      setRows(body.audit ?? []);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to load audit log");
    } finally {
      setLoading(false);
    }
  }, [action, table, limit]);

  useEffect(() => { fetchAudit(); }, [fetchAudit]);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Audit Log</h1>
        <p className="text-sm text-muted-foreground">
          Append-only record of every auto-heal state transition — config changes,
          fix applications, baseline promotions, pattern toggles, and issue triage.
          Written by both crons and super_admin actions.
        </p>
      </header>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Action</span>
          <Select value={action} onValueChange={(v) => setAction(v ?? "all")}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ACTION_FILTERS.map((a) => (
                <SelectItem key={a} value={a}>{a === "all" ? "All actions" : a}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Table</span>
          <Select value={table} onValueChange={(v) => setTable(v ?? "all")}>
            <SelectTrigger className="w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TABLE_FILTERS.map((t) => (
                <SelectItem key={t} value={t}>{t === "all" ? "All tables" : t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Limit</span>
          <Select value={limit} onValueChange={(v) => setLimit(v ?? "100")}>
            <SelectTrigger className="w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LIMIT_OPTIONS.map((l) => (
                <SelectItem key={l} value={l}>{l} rows</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button size="sm" variant="outline" onClick={fetchAudit}>Refresh</Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {loading ? "Loading…" : `${rows.length} event${rows.length === 1 ? "" : "s"}`}
          </CardTitle>
          <CardDescription>Newest first</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : rows.length === 0 ? (
            <div className="rounded-lg border p-6 text-center text-sm text-muted-foreground">
              No audit events match the current filters.
            </div>
          ) : (
            <div className="border rounded-md divide-y">
              {rows.map((row) => (
                <div key={row.id} className="px-3 py-2 text-sm">
                  <div className="flex items-baseline gap-3">
                    <Badge variant="outline" className="font-mono text-[10px] shrink-0">
                      {row.action}
                    </Badge>
                    <span className="text-xs text-zinc-500 shrink-0">{row.target_table}</span>
                    {row.target_id && (
                      <code className="text-[10px] text-zinc-400 truncate">{row.target_id}</code>
                    )}
                    <span className="text-xs text-zinc-400 ml-auto shrink-0" title={fmtDate(row.created_at)}>
                      {relTime(row.created_at)}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-3 text-xs">
                    <span className="text-zinc-600 font-mono text-[10px]">{row.actor}</span>
                    {row.reason && (
                      <span className="text-zinc-500 italic truncate">{row.reason}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
