"use client";

/**
 * Dual Load Thresholds — editable bucketized advice for the Dual Load Index.
 *
 * Each row defines the zone label, DLI min/max, description, and a JSON
 * list of recommended actions. Consumed by the recommendation engine
 * when it evaluates an athlete's current DLI.
 *
 * Part of Phase 5 "fill remaining CMS gaps" per the memory rule about
 * PDIL (Planning Intelligence) completeness.
 */

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";

interface Threshold {
  id: string;
  zone: string;
  dli_min: number;
  dli_max: number;
  description: string | null;
  recommended_actions: unknown;
  sort_order: number | null;
  created_at: string | null;
  updated_at: string | null;
}

export default function DualLoadPage() {
  const [rows, setRows] = useState<Threshold[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Threshold | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state for the inline editor
  const [zone, setZone] = useState("");
  const [min, setMin] = useState("0");
  const [max, setMax] = useState("0");
  const [desc, setDesc] = useState("");
  const [actionsJson, setActionsJson] = useState("[]");

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/admin/dual-load-thresholds", {
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { thresholds: Threshold[] };
      setRows(data.thresholds ?? []);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  function openEdit(r: Threshold) {
    setEditing(r);
    setZone(r.zone);
    setMin(String(r.dli_min));
    setMax(String(r.dli_max));
    setDesc(r.description ?? "");
    setActionsJson(JSON.stringify(r.recommended_actions ?? [], null, 2));
  }

  function cancelEdit() {
    setEditing(null);
  }

  async function handleSave() {
    if (!editing) return;
    setSaving(true);
    try {
      let parsedActions: unknown;
      try {
        parsedActions = actionsJson.trim() ? JSON.parse(actionsJson) : [];
      } catch (e) {
        throw new Error(
          `Invalid JSON in recommended_actions: ${e instanceof Error ? e.message : String(e)}`
        );
      }

      const minNum = Number(min);
      const maxNum = Number(max);
      if (!Number.isFinite(minNum) || !Number.isFinite(maxNum)) {
        throw new Error("dli_min and dli_max must be numbers");
      }
      if (minNum >= maxNum) {
        throw new Error("dli_min must be less than dli_max");
      }

      const res = await fetch("/api/v1/admin/dual-load-thresholds", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          id: editing.id,
          zone,
          dli_min: minNum,
          dli_max: maxNum,
          description: desc || null,
          recommended_actions: parsedActions,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }

      toast.success("Updated");
      setEditing(null);
      await fetchRows();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          Dual Load Thresholds
        </h1>
        <p className="text-sm text-muted-foreground">
          Bucketized advice by Dual Load Index. Each row defines a zone
          (e.g. SAFE / CAUTION / HIGH) with its DLI band and recommended
          actions, consumed by the recommendation engine.
        </p>
      </header>

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading...</div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Zone</TableHead>
              <TableHead className="text-right">DLI min</TableHead>
              <TableHead className="text-right">DLI max</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="text-right">Actions</TableHead>
              <TableHead className="w-24 text-right"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.zone}</TableCell>
                <TableCell className="text-right font-mono text-xs">
                  {r.dli_min}
                </TableCell>
                <TableCell className="text-right font-mono text-xs">
                  {r.dli_max}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground max-w-xs truncate">
                  {r.description || "—"}
                </TableCell>
                <TableCell className="text-right text-xs text-muted-foreground">
                  {Array.isArray(r.recommended_actions)
                    ? `${r.recommended_actions.length} action(s)`
                    : "—"}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => openEdit(r)}
                  >
                    Edit
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {editing ? (
        <div className="rounded-lg border bg-card p-4 space-y-4">
          <h2 className="font-semibold">Edit — {editing.zone}</h2>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label>Zone</Label>
              <Input value={zone} onChange={(e) => setZone(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>DLI min</Label>
              <Input
                type="number"
                step="0.01"
                value={min}
                onChange={(e) => setMin(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>DLI max</Label>
              <Input
                type="number"
                step="0.01"
                value={max}
                onChange={(e) => setMax(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Description</Label>
            <Textarea
              rows={2}
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label>Recommended Actions (JSON array)</Label>
            <Textarea
              rows={6}
              className="font-mono text-xs"
              value={actionsJson}
              onChange={(e) => setActionsJson(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </Button>
            <Button variant="outline" onClick={cancelEdit} disabled={saving}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
