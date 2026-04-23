"use client";

/**
 * CV References — identity-verification queue.
 *
 * Lists cv_references rows in 'submitted' state. Admin verifies (auto-publishes
 * the reference on the athlete's CV) or rejects (row moves to 'rejected' with
 * a reason). FIFO ordering — oldest submission surfaces first.
 */

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";

interface PendingReference {
  id: string;
  athlete_id: string;
  referee_name: string;
  referee_role: string;
  club_institution: string;
  email: string | null;
  relationship: string | null;
  submitted_at: string;
  submitted_rating: number | null;
  submitted_note: string | null;
  athlete?: { id: string; name: string | null; email: string | null; avatar_url: string | null };
}

export default function CVReferencesReviewPage() {
  const [rows, setRows] = useState<PendingReference[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/admin/cv-references", { credentials: "include" });
      if (!res.ok) {
        toast.error("Failed to load queue");
        return;
      }
      const body = await res.json();
      setRows(body.references ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  const act = useCallback(async (id: string, action: "verify" | "reject", reason?: string) => {
    setBusyId(id);
    try {
      const res = await fetch(`/api/v1/admin/cv-references/${id}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reason }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(body?.error ?? "Action failed");
        return;
      }
      toast.success(action === "verify" ? "Published to CV" : "Rejected");
      setRows((prev) => prev.filter((r) => r.id !== id));
    } finally {
      setBusyId(null);
    }
  }, []);

  const handleVerify = (row: PendingReference) => act(row.id, "verify");
  const handleReject = (row: PendingReference) => {
    const reason = window.prompt(`Reject reference from ${row.referee_name}?\n\nReason (required):`);
    if (!reason) return;
    act(row.id, "reject", reason);
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">CV References — Identity Check</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Verify that each referee actually coached or scouted the athlete before their reference
            is published on the public CV.
          </p>
        </div>
        <Button variant="outline" onClick={fetchRows} disabled={loading}>
          {loading ? "Loading…" : "Refresh"}
        </Button>
      </header>

      {rows.length === 0 && !loading ? (
        <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
          Queue empty — no references awaiting identity check.
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Athlete</TableHead>
              <TableHead>Referee</TableHead>
              <TableHead>Role · Club</TableHead>
              <TableHead>Rating</TableHead>
              <TableHead>Note</TableHead>
              <TableHead>Submitted</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id} className={busyId === row.id ? "opacity-50" : ""}>
                <TableCell>
                  <div className="font-medium">{row.athlete?.name ?? row.athlete_id.slice(0, 8)}</div>
                  <div className="text-xs text-muted-foreground">{row.athlete?.email ?? ""}</div>
                </TableCell>
                <TableCell>
                  <div className="font-medium">{row.referee_name}</div>
                  <div className="text-xs text-muted-foreground">{row.email ?? "—"}</div>
                </TableCell>
                <TableCell>
                  <div>{row.referee_role}</div>
                  <div className="text-xs text-muted-foreground">{row.club_institution}</div>
                </TableCell>
                <TableCell>
                  {row.submitted_rating != null ? (
                    <Badge variant="secondary">{row.submitted_rating}/5</Badge>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="max-w-[320px]">
                  <div className="line-clamp-3 text-sm italic">
                    {row.submitted_note ?? "—"}
                  </div>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {formatRelative(row.submitted_at)}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex gap-2 justify-end">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleReject(row)}
                      disabled={busyId === row.id}
                    >
                      Reject
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => handleVerify(row)}
                      disabled={busyId === row.id}
                    >
                      Verify & publish
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

function formatRelative(iso: string): string {
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
