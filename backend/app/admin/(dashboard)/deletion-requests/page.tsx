"use client";

/**
 * Admin → Deletion Requests review surface.
 *
 * Lists GDPR Art. 17 / CCPA / PDPL deletion requests with their current
 * pipeline state. The daily pg_cron job handles due purges automatically;
 * the Force Purge button here is the out-of-band escape hatch for
 * regulator / forensic flows and is only enabled on status='pending'.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Status = "pending" | "cancelled" | "purging" | "purged" | "failed";

interface Row {
  id: string;
  userId: string;
  email: string | null;
  requestedAt: string;
  scheduledPurgeAt: string;
  jurisdiction: "GDPR" | "CCPA" | "PDPL" | "CUSTOM";
  method: string;
  status: Status;
  gracePeriodDays: number;
  cancelledAt: string | null;
  cancelledReason: string | null;
  purgeStartedAt: string | null;
  purgeCompletedAt: string | null;
  failureReason: string | null;
  failureCount: number;
  tombstoneId: string | null;
}

const STATUS_FILTERS: ReadonlyArray<{ label: string; value: Status | "all" }> = [
  { label: "All", value: "all" },
  { label: "Pending", value: "pending" },
  { label: "Purged", value: "purged" },
  { label: "Cancelled", value: "cancelled" },
  { label: "Failed", value: "failed" },
];

const STATUS_BADGE: Record<Status, "default" | "secondary" | "destructive" | "outline"> = {
  pending: "default",
  purging: "default",
  purged: "secondary",
  cancelled: "outline",
  failed: "destructive",
};

function daysBetween(a: string, b: string): number {
  return Math.round(
    (new Date(a).getTime() - new Date(b).getTime()) / (24 * 60 * 60 * 1000)
  );
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toISOString().slice(0, 16).replace("T", " ");
}

interface ForcePurgeTarget {
  requestId: string;
  userLabel: string;
}

interface ForcePurgeResult {
  kind: "success" | "error";
  requestId: string;
  message: string;
}

export default function DeletionRequestsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Status | "all">("all");
  const [error, setError] = useState<string | null>(null);
  const [purgeTarget, setPurgeTarget] = useState<ForcePurgeTarget | null>(null);
  const [purgeInFlight, setPurgeInFlight] = useState(false);
  const [purgeResult, setPurgeResult] = useState<ForcePurgeResult | null>(null);

  const fetchRows = useCallback(async (status: Status | "all") => {
    setLoading(true);
    setError(null);
    const qs = status === "all" ? "" : `?status=${status}`;
    try {
      const res = await fetch(`/api/v1/admin/deletion-requests${qs}`, {
        credentials: "include",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body?.error ?? `HTTP ${res.status}`);
        setRows([]);
        return;
      }
      const data = await res.json();
      setRows(data.rows ?? []);
    } catch (e) {
      setError((e as Error)?.message ?? "Network error");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRows(filter);
  }, [fetchRows, filter]);

  const runForcePurge = useCallback(async () => {
    if (!purgeTarget) return;
    setPurgeInFlight(true);
    try {
      const res = await fetch(
        `/api/v1/admin/deletion-requests/${purgeTarget.requestId}/force-purge`,
        { method: "POST", credentials: "include" }
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const parts = [body?.error ?? `HTTP ${res.status}`];
        if (body?.failureReason) parts.push(`Reason: ${body.failureReason}`);
        if (typeof body?.failureCount === "number" && body.failureCount > 0) {
          parts.push(`Failures: ${body.failureCount}`);
        }
        setPurgeResult({
          kind: "error",
          requestId: purgeTarget.requestId,
          message: parts.join(" — "),
        });
      } else {
        setPurgeResult({
          kind: "success",
          requestId: purgeTarget.requestId,
          message: `Purged. Tombstone ${String(body?.tombstoneId ?? "").slice(0, 8)}…`,
        });
      }
      setPurgeTarget(null);
      await fetchRows(filter);
    } catch (e) {
      setPurgeResult({
        kind: "error",
        requestId: purgeTarget.requestId,
        message: (e as Error)?.message ?? "Network error",
      });
      setPurgeTarget(null);
    } finally {
      setPurgeInFlight(false);
    }
  }, [purgeTarget, fetchRows, filter]);

  const counts = useMemo(() => {
    const c: Record<Status | "all", number> = {
      all: rows.length,
      pending: 0,
      purging: 0,
      purged: 0,
      cancelled: 0,
      failed: 0,
    };
    for (const r of rows) c[r.status] += 1;
    return c;
  }, [rows]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Deletion Requests</h1>
        <p className="text-muted-foreground">
          GDPR Art. 17 / CCPA / PDPL right-to-erasure pipeline. The daily
          pg_cron job ({" "}
          <code className="rounded bg-muted px-1">
            tomo-deletion-purge-daily
          </code>{" "}
          at 03:15 UTC) handles due purges. Use{" "}
          <strong>Force purge now</strong> only for regulator / forensic
          flows that require bypassing the grace window.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map((f) => (
          <Button
            key={f.value}
            variant={filter === f.value ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter(f.value)}
          >
            {f.label}
            <Badge variant="secondary" className="ml-2">
              {filter === f.value ? counts.all : ""}
            </Badge>
          </Button>
        ))}
      </div>

      {error && (
        <div className="rounded-md border border-destructive p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Status</TableHead>
              <TableHead>User</TableHead>
              <TableHead>Jurisdiction</TableHead>
              <TableHead>Method</TableHead>
              <TableHead>Requested</TableHead>
              <TableHead>Scheduled purge</TableHead>
              <TableHead>Days remaining</TableHead>
              <TableHead>Failures</TableHead>
              <TableHead>Tombstone</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                  Loading…
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                  No deletion requests.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => {
                const daysRemaining =
                  r.status === "pending"
                    ? Math.max(0, daysBetween(r.scheduledPurgeAt, new Date().toISOString()))
                    : null;
                return (
                  <TableRow key={r.id}>
                    <TableCell>
                      <Badge variant={STATUS_BADGE[r.status]}>{r.status}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      <div className="truncate max-w-xs">{r.email ?? r.userId}</div>
                      {r.email && (
                        <div className="text-muted-foreground truncate max-w-xs">
                          {r.userId}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{r.jurisdiction}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {r.method}
                    </TableCell>
                    <TableCell className="text-xs font-mono">
                      {formatDate(r.requestedAt)}
                    </TableCell>
                    <TableCell className="text-xs font-mono">
                      {formatDate(r.scheduledPurgeAt)}
                    </TableCell>
                    <TableCell>
                      {daysRemaining === null ? (
                        <span className="text-muted-foreground">—</span>
                      ) : daysRemaining <= 7 ? (
                        <span className="text-destructive font-medium">
                          {daysRemaining}d
                        </span>
                      ) : (
                        <span>{daysRemaining}d</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {r.failureCount > 0 ? (
                        <span className="text-destructive">{r.failureCount}</span>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {r.tombstoneId ? (
                        <span className="truncate max-w-xs inline-block">
                          {r.tombstoneId.slice(0, 8)}…
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {r.status === "pending" ? (
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() =>
                            setPurgeTarget({
                              requestId: r.id,
                              userLabel: r.email ?? r.userId,
                            })
                          }
                        >
                          Force purge now
                        </Button>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {purgeResult && (
        <div
          className={
            purgeResult.kind === "success"
              ? "rounded-md border border-emerald-600/40 bg-emerald-600/10 p-3 text-sm"
              : "rounded-md border border-destructive p-3 text-sm text-destructive"
          }
        >
          <div className="font-mono text-xs mb-1">
            {purgeResult.requestId.slice(0, 8)}…
          </div>
          <div>{purgeResult.message}</div>
          <Button
            variant="ghost"
            size="sm"
            className="mt-2"
            onClick={() => setPurgeResult(null)}
          >
            Dismiss
          </Button>
        </div>
      )}

      <Dialog
        open={purgeTarget !== null}
        onOpenChange={(open) => {
          if (!open && !purgeInFlight) setPurgeTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Force purge now?</DialogTitle>
            <DialogDescription>
              This bypasses the grace-period window and invokes{" "}
              <code className="rounded bg-muted px-1">tomo_purge_user()</code>{" "}
              immediately. The user&apos;s auth row cascades to every
              athlete-scoped table; audit tables are anonymised. This action
              cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {purgeTarget && (
            <div className="rounded-md border p-3 text-sm space-y-1">
              <div>
                <span className="text-muted-foreground">User: </span>
                <span className="font-mono">{purgeTarget.userLabel}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Request: </span>
                <span className="font-mono">{purgeTarget.requestId}</span>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setPurgeTarget(null)}
              disabled={purgeInFlight}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={runForcePurge}
              disabled={purgeInFlight}
            >
              {purgeInFlight ? "Purging…" : "Force purge"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
