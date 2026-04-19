"use client";

/**
 * Position Training Matrix — admin CRUD.
 *
 * One row per (sport_id, position) pair. Each row holds GPS / strength /
 * speed targets (JSONB) plus arrays of mandatory and recommended
 * training_program IDs consumed by the recommendation engine.
 *
 * For now this is a pragmatic JSON-first editor — the drag-drop heatmap
 * matrix is scheduled for Phase 6 polish. Operators can paste or hand-edit
 * the JSON blobs; validation happens server-side on save.
 */

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";

interface MatrixRow {
  id: string;
  sport_id: string;
  position: string;
  gps_targets: Record<string, unknown>;
  strength_targets: Record<string, unknown>;
  speed_targets: Record<string, unknown>;
  mandatory_programs: string[];
  recommended_programs: string[];
  weekly_structure: Record<string, unknown>;
  updated_at: string;
}

interface FormState {
  id?: string;
  sport_id: string;
  position: string;
  gpsJson: string;
  strengthJson: string;
  speedJson: string;
  mandatoryIds: string;
  recommendedIds: string;
  weeklyJson: string;
}

const EMPTY_FORM: FormState = {
  sport_id: "football",
  position: "",
  gpsJson: "{}",
  strengthJson: "{}",
  speedJson: "{}",
  mandatoryIds: "",
  recommendedIds: "",
  weeklyJson: "{}",
};

export default function PositionMatrixPage() {
  const [rows, setRows] = useState<MatrixRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/admin/position-matrix", {
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { rows: MatrixRow[] };
      setRows(data.rows ?? []);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to load";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  function openCreate() {
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  }

  function openEdit(row: MatrixRow) {
    setForm({
      id: row.id,
      sport_id: row.sport_id,
      position: row.position,
      gpsJson: JSON.stringify(row.gps_targets, null, 2),
      strengthJson: JSON.stringify(row.strength_targets, null, 2),
      speedJson: JSON.stringify(row.speed_targets, null, 2),
      mandatoryIds: row.mandatory_programs.join(", "),
      recommendedIds: row.recommended_programs.join(", "),
      weeklyJson: JSON.stringify(row.weekly_structure, null, 2),
    });
    setDialogOpen(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const parseJson = (src: string, field: string): Record<string, unknown> => {
        if (!src.trim()) return {};
        try {
          const v = JSON.parse(src);
          if (typeof v !== "object" || v === null || Array.isArray(v)) {
            throw new Error(`${field}: must be a JSON object, not an array or scalar`);
          }
          return v as Record<string, unknown>;
        } catch (e) {
          throw new Error(
            `${field}: invalid JSON (${e instanceof Error ? e.message : String(e)})`
          );
        }
      };

      const toStrArr = (csv: string): string[] =>
        csv
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);

      const payload = {
        sport_id: form.sport_id.trim(),
        position: form.position.trim(),
        gps_targets: parseJson(form.gpsJson, "GPS targets"),
        strength_targets: parseJson(form.strengthJson, "Strength targets"),
        speed_targets: parseJson(form.speedJson, "Speed targets"),
        mandatory_programs: toStrArr(form.mandatoryIds),
        recommended_programs: toStrArr(form.recommendedIds),
        weekly_structure: parseJson(form.weeklyJson, "Weekly structure"),
      };

      if (!payload.sport_id || !payload.position) {
        throw new Error("sport_id and position are required");
      }

      const url = form.id
        ? `/api/v1/admin/position-matrix/${form.id}`
        : "/api/v1/admin/position-matrix";
      const method = form.id ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }

      toast.success(form.id ? "Updated" : "Created");
      setDialogOpen(false);
      await fetchRows();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Save failed";
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this row?")) return;
    try {
      const res = await fetch(`/api/v1/admin/position-matrix/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success("Deleted");
      await fetchRows();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Delete failed";
      toast.error(message);
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Position Training Matrix
          </h1>
          <p className="text-sm text-muted-foreground">
            One row per (sport, position). Holds GPS / strength / speed
            targets plus mandatory and recommended training programs fed into
            the recommendation engine.
          </p>
        </div>
        <Button onClick={openCreate}>New row</Button>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {form.id ? "Edit matrix row" : "New matrix row"}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Sport ID</Label>
                  <Input
                    value={form.sport_id}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, sport_id: e.target.value }))
                    }
                    placeholder="football"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Position</Label>
                  <Input
                    value={form.position}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, position: e.target.value }))
                    }
                    placeholder="CM, ST, GK, ..."
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>GPS Targets (JSON)</Label>
                <Textarea
                  rows={4}
                  value={form.gpsJson}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, gpsJson: e.target.value }))
                  }
                  className="font-mono text-xs"
                />
              </div>

              <div className="space-y-2">
                <Label>Strength Targets (JSON)</Label>
                <Textarea
                  rows={4}
                  value={form.strengthJson}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, strengthJson: e.target.value }))
                  }
                  className="font-mono text-xs"
                />
              </div>

              <div className="space-y-2">
                <Label>Speed Targets (JSON)</Label>
                <Textarea
                  rows={4}
                  value={form.speedJson}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, speedJson: e.target.value }))
                  }
                  className="font-mono text-xs"
                />
              </div>

              <div className="space-y-2">
                <Label>Mandatory Program IDs (comma-separated UUIDs)</Label>
                <Textarea
                  rows={2}
                  value={form.mandatoryIds}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, mandatoryIds: e.target.value }))
                  }
                  placeholder="uuid-1, uuid-2, ..."
                  className="font-mono text-xs"
                />
              </div>

              <div className="space-y-2">
                <Label>Recommended Program IDs (comma-separated)</Label>
                <Textarea
                  rows={2}
                  value={form.recommendedIds}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, recommendedIds: e.target.value }))
                  }
                  className="font-mono text-xs"
                />
              </div>

              <div className="space-y-2">
                <Label>Weekly Structure (JSON)</Label>
                <Textarea
                  rows={4}
                  value={form.weeklyJson}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, weeklyJson: e.target.value }))
                  }
                  className="font-mono text-xs"
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setDialogOpen(false)}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? "Saving..." : "Save"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </header>

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading...</div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border p-8 text-center text-sm text-muted-foreground">
          No rows yet. Click <strong>New row</strong> to seed the first one.
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Sport</TableHead>
              <TableHead>Position</TableHead>
              <TableHead>Mandatory</TableHead>
              <TableHead>Recommended</TableHead>
              <TableHead>Updated</TableHead>
              <TableHead className="w-32 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="font-medium">{row.sport_id}</TableCell>
                <TableCell>
                  <Badge variant="outline">{row.position}</Badge>
                </TableCell>
                <TableCell>{row.mandatory_programs.length}</TableCell>
                <TableCell>{row.recommended_programs.length}</TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {new Date(row.updated_at).toLocaleDateString()}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => openEdit(row)}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive"
                    onClick={() => handleDelete(row.id)}
                  >
                    Delete
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
