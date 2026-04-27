"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PageGuide } from "@/components/admin/PageGuide";

interface Snapshot {
  id: string;
  label: string;
  notes: string | null;
  directive_count: number;
  is_live: boolean;
  published_at: string;
  retired_at: string | null;
}

interface DirectiveSummary {
  total: number;
  approved: number;
  proposed: number;
  published: number;
}

export default function SnapshotsPage() {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [summary, setSummary] = useState<DirectiveSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [rollbackBusy, setRollbackBusy] = useState<string | null>(null);

  // Publish dialog
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [notes, setNotes] = useState("");

  async function load() {
    setLoading(true);
    try {
      const [snapsRes, dirsRes] = await Promise.all([
        fetch("/api/v1/admin/pd/instructions/snapshots", { credentials: "include" }),
        fetch("/api/v1/admin/pd/instructions/directives", { credentials: "include" }),
      ]);
      if (!snapsRes.ok) throw new Error("snapshots fetch failed");
      const snapsData = await snapsRes.json();
      setSnapshots(snapsData.snapshots ?? []);
      if (dirsRes.ok) {
        const ds: any[] = (await dirsRes.json()).directives ?? [];
        setSummary({
          total: ds.length,
          proposed: ds.filter((d) => d.status === "proposed").length,
          approved: ds.filter((d) => d.status === "approved").length,
          published: ds.filter((d) => d.status === "published").length,
        });
      }
    } catch {
      toast.error("Couldn't load snapshots");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function publish() {
    if (!label.trim()) {
      toast.error("Give your snapshot a label so you can find it later.");
      return;
    }
    setPublishing(true);
    try {
      const res = await fetch("/api/v1/admin/pd/instructions/snapshots", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: label.trim(), notes: notes.trim() || undefined }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Publish failed");
      }
      toast.success("Snapshot published. Live now.");
      setOpen(false);
      setLabel("");
      setNotes("");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't publish");
    } finally {
      setPublishing(false);
    }
  }

  async function rollback(s: Snapshot) {
    if (s.is_live) return;
    if (
      !confirm(
        `Roll back to "${s.label}"?\n\nThe rules from this snapshot will become Tomo's live rules. ` +
          `The current live snapshot will be retired.`,
      )
    )
      return;
    setRollbackBusy(s.id);
    try {
      const res = await fetch(`/api/v1/admin/pd/instructions/snapshots/${s.id}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ _action: "rollback" }),
      });
      if (!res.ok) throw new Error("Rollback failed");
      toast.success(`Rolled back to "${s.label}".`);
      await load();
    } catch {
      toast.error("Couldn't roll back");
    } finally {
      setRollbackBusy(null);
    }
  }

  const liveSnap = snapshots.find((s) => s.is_live) ?? null;
  const canPublish = (summary?.approved ?? 0) > 0;

  return (
    <div className="space-y-5">
      <PageGuide
        summary="Snapshots are immutable, dated points in time. Publishing a snapshot makes the rules you've approved go live for every athlete, coach, and parent. Older snapshots stay around so you can roll back any time with one click."
        details={[
          "Only one snapshot is live at a time. Publishing replaces the current live snapshot.",
          "Approved rules become 'Live' when you publish them in a snapshot. Rules you haven't approved yet are not included.",
          "Rolling back instantly switches the live rules to a previous snapshot — no parsing, no re-approval needed.",
        ]}
        impact="The live snapshot is what Tomo actually applies for every athlete. Treat publishing like signing your name to a release."
        warning="If there are no approved rules, publishing won't do anything yet. Approve some rules in the Rules tab first."
        storageKey="pd-instructions-snapshots"
      />

      {/* Status row */}
      <div className="rounded-md border bg-background p-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="space-y-0.5">
            <div className="text-sm font-semibold">
              {liveSnap ? <>Live: <span className="text-blue-700">{liveSnap.label}</span></> : "No snapshot live yet"}
            </div>
            {liveSnap && (
              <div className="text-xs text-muted-foreground">
                {liveSnap.directive_count} rule{liveSnap.directive_count === 1 ? "" : "s"} ·
                {" "}published {new Date(liveSnap.published_at).toLocaleString()}
              </div>
            )}
            {summary && (
              <div className="text-xs text-muted-foreground">
                {summary.approved > 0
                  ? `${summary.approved} approved rule${summary.approved === 1 ? "" : "s"} ready to publish.`
                  : "No approved rules waiting to publish."}
                {summary.proposed > 0 && (
                  <> {summary.proposed} more waiting for your review.</>
                )}
              </div>
            )}
          </div>

          <Button
            disabled={!canPublish || publishing}
            onClick={() => setOpen(true)}
            title={!canPublish ? "Approve some rules first" : ""}
          >
            Publish a new snapshot
          </Button>
        </div>
      </div>

      {/* Publish dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Publish a new snapshot</DialogTitle>
            <DialogDescription>
              You're about to make {summary?.approved ?? 0} approved rule
              {summary?.approved === 1 ? "" : "s"} live for everyone. The current live snapshot
              will be retired (you can roll back any time).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="snap-label">Label this snapshot</Label>
              <Input
                id="snap-label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. Spring 2026 — U15 conservative defaults"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="snap-notes">Notes (optional)</Label>
              <Textarea
                id="snap-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="What changed in this snapshot? Anyone reading the audit log will see this note."
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={publishing}>
              Cancel
            </Button>
            <Button onClick={publish} disabled={publishing}>
              {publishing ? "Publishing…" : "Publish now"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* History */}
      <div>
        <h2 className="mb-2 text-base font-semibold">History</h2>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : snapshots.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No snapshots published yet. Approve some rules and publish your first snapshot.
          </p>
        ) : (
          <ul className="space-y-2">
            {snapshots.map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between gap-3 rounded border bg-background p-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{s.label}</span>
                    {s.is_live && <Badge variant="default">Live</Badge>}
                    {!s.is_live && s.retired_at && (
                      <Badge variant="outline" className="text-xs">Retired</Badge>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {s.directive_count} rule{s.directive_count === 1 ? "" : "s"}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Published {new Date(s.published_at).toLocaleString()}
                    {s.retired_at && (
                      <> · retired {new Date(s.retired_at).toLocaleString()}</>
                    )}
                  </div>
                  {s.notes && (
                    <p className="mt-1 text-xs italic text-muted-foreground line-clamp-2">
                      {s.notes}
                    </p>
                  )}
                </div>
                {!s.is_live && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => rollback(s)}
                    disabled={rollbackBusy === s.id}
                  >
                    {rollbackBusy === s.id ? "…" : "Roll back to this"}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
