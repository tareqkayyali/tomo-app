"use client";

import { useState, useCallback, useMemo } from "react";
import { Input } from "@/components/ui/input";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";

const AGE_COLS = Array.from({ length: 11 }, (_, i) => i + 13);

export interface NormativeRow {
  id: string;
  sport_id: string;
  metric_name: string;
  unit: string;
  attribute_key: string;
  direction: "higher" | "lower";
  age_min: number;
  age_max: number;
  means: number[];
  sds: number[];
  position_key?: string;
  created_at: string;
  updated_at: string;
}

const POSITION_OPTIONS = [
  { value: "ALL", label: "All Positions (Universal)" },
  { value: "ST", label: "ST — Striker" },
  { value: "CAM", label: "CAM — Attacking Mid" },
  { value: "WM", label: "WM — Wide Mid" },
  { value: "CM", label: "CM — Central Mid" },
  { value: "FB", label: "FB — Full Back" },
  { value: "CB", label: "CB — Centre Back" },
  { value: "GK", label: "GK — Goalkeeper" },
];

interface NormativeSpreadsheetProps {
  rows: NormativeRow[];
  onSaved: () => void;
  onDeleted: (id: string) => void;
}

type ViewMode = "means" | "sds";

interface DirtyCell {
  rowId: string;
  ageIndex: number;
  field: ViewMode;
}

export default function NormativeSpreadsheet({
  rows,
  onSaved,
  onDeleted,
}: NormativeSpreadsheetProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("means");
  const [positionFilter, setPositionFilter] = useState<string>("ALL");
  const filteredRows = useMemo(() =>
    rows.filter((r) => (r.position_key ?? "ALL") === positionFilter),
    [rows, positionFilter]
  );
  const [localData, setLocalData] = useState<Map<string, { means: number[]; sds: number[] }>>(
    () => {
      const map = new Map<string, { means: number[]; sds: number[] }>();
      rows.forEach((r) => map.set(r.id, { means: [...r.means], sds: [...r.sds] }));
      return map;
    }
  );
  const [dirtyCells, setDirtyCells] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [detailRow, setDetailRow] = useState<NormativeRow | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // Sync localData when rows change from parent
  useMemo(() => {
    const map = new Map<string, { means: number[]; sds: number[] }>();
    rows.forEach((r) => map.set(r.id, { means: [...r.means], sds: [...r.sds] }));
    setLocalData(map);
    setDirtyCells(new Set());
  }, [rows]);

  const cellKey = (rowId: string, ageIndex: number, field: ViewMode) =>
    `${rowId}:${ageIndex}:${field}`;

  const handleCellChange = useCallback(
    (rowId: string, ageIndex: number, value: string) => {
      const numVal = value === "" ? 0 : parseFloat(value);
      if (isNaN(numVal)) return;

      setLocalData((prev) => {
        const next = new Map(prev);
        const existing = next.get(rowId);
        if (!existing) return prev;

        const clone = {
          means: [...existing.means],
          sds: [...existing.sds],
        };
        clone[viewMode][ageIndex] = numVal;
        next.set(rowId, clone);
        return next;
      });

      setDirtyCells((prev) => {
        const next = new Set(prev);
        next.add(cellKey(rowId, ageIndex, viewMode));
        return next;
      });
    },
    [viewMode]
  );

  const isDirty = dirtyCells.size > 0;

  const handleSaveAll = async () => {
    // Collect all modified rows
    const modifiedRowIds = new Set<string>();
    dirtyCells.forEach((key) => {
      const rowId = key.split(":")[0];
      modifiedRowIds.add(rowId);
    });

    const updates = Array.from(modifiedRowIds).map((id) => {
      const data = localData.get(id)!;
      return { id, means: data.means, sds: data.sds };
    });

    if (updates.length === 0) return;

    setSaving(true);
    try {
      const res = await fetch("/api/v1/admin/normative-data/bulk-update", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates }),
      });

      const result = await res.json();
      if (res.ok) {
        toast.success(`Saved ${result.succeeded} of ${result.total} rows`);
        setDirtyCells(new Set());
        onSaved();
      } else {
        toast.error(result.error || "Save failed");
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/v1/admin/normative-data/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) {
        toast.success("Metric deleted");
        setDeleteConfirm(null);
        onDeleted(id);
      } else {
        toast.error("Failed to delete metric");
      }
    } catch {
      toast.error("Failed to delete metric");
    }
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <div className="flex rounded-md border">
          <button
            onClick={() => setViewMode("means")}
            className={`px-3 py-1.5 text-sm font-medium transition-colors ${
              viewMode === "means"
                ? "bg-primary text-primary-foreground"
                : "hover:bg-muted"
            }`}
          >
            Means
          </button>
          <button
            onClick={() => setViewMode("sds")}
            className={`px-3 py-1.5 text-sm font-medium transition-colors ${
              viewMode === "sds"
                ? "bg-primary text-primary-foreground"
                : "hover:bg-muted"
            }`}
          >
            SDs
          </button>
        </div>

        <select
          value={positionFilter}
          onChange={(e) => setPositionFilter(e.target.value)}
          className="px-3 py-1.5 text-sm font-medium border rounded-md bg-background"
        >
          {POSITION_OPTIONS.map((p) => (
            <option key={p.value} value={p.value}>{p.label}</option>
          ))}
        </select>

        <div className="flex-1" />

        {isDirty && (
          <Badge variant="secondary" className="animate-pulse">
            {dirtyCells.size} unsaved change{dirtyCells.size !== 1 ? "s" : ""}
          </Badge>
        )}

        <Button onClick={handleSaveAll} disabled={!isDirty || saving}>
          {saving ? "Saving..." : "Save All Changes"}
        </Button>
      </div>

      {/* Spreadsheet */}
      {filteredRows.length === 0 ? (
        <div className="rounded-md border p-8 text-center text-muted-foreground">
          No normative data found for {positionFilter === "ALL" ? "universal" : positionFilter} norms. {positionFilter !== "ALL" && "Position-specific norms may not be seeded yet."}
        </div>
      ) : (
        <div className="rounded-md border overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="sticky left-0 bg-background z-10 min-w-[200px]">
                  Metric ({positionFilter})
                </TableHead>
                {AGE_COLS.map((age) => (
                  <TableHead key={age} className="text-center min-w-[80px]">
                    Age {age}
                  </TableHead>
                ))}
                <TableHead className="w-20 text-center">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRows.map((row) => {
                const data = localData.get(row.id);
                if (!data) return null;

                const values = viewMode === "means" ? data.means : data.sds;
                const isHigher = row.direction === "higher";

                return (
                  <TableRow key={row.id}>
                    <TableCell
                      className="sticky left-0 bg-background z-10 cursor-pointer hover:bg-muted/50"
                      onClick={() => setDetailRow(row)}
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-xs ${isHigher ? "text-green-500" : "text-blue-500"}`}
                          title={isHigher ? "Higher is better" : "Lower is better"}
                        >
                          {isHigher ? "\u2191" : "\u2193"}
                        </span>
                        <div>
                          <div className="font-medium text-sm">
                            {row.metric_name}
                          </div>
                          {row.unit && (
                            <div className="text-xs text-muted-foreground">
                              {row.unit}
                            </div>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    {AGE_COLS.map((age, ageIdx) => {
                      const key = cellKey(row.id, ageIdx, viewMode);
                      const cellDirty = dirtyCells.has(key);

                      return (
                        <TableCell
                          key={age}
                          className={`p-0.5 ${
                            isHigher
                              ? "bg-green-500/5"
                              : "bg-blue-500/5"
                          } ${cellDirty ? "ring-1 ring-yellow-400/60" : ""}`}
                        >
                          <Input
                            type="number"
                            step="any"
                            value={values[ageIdx] ?? 0}
                            onChange={(e) =>
                              handleCellChange(row.id, ageIdx, e.target.value)
                            }
                            className="h-8 text-center text-sm border-0 bg-transparent [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          />
                        </TableCell>
                      );
                    })}
                    <TableCell className="text-center">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setDeleteConfirm(row.id)}
                      >
                        Delete
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Detail Dialog */}
      <Dialog
        open={!!detailRow}
        onOpenChange={(v) => {
          if (!v) setDetailRow(null);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{detailRow?.metric_name}</DialogTitle>
            <DialogDescription>Metric details</DialogDescription>
          </DialogHeader>
          {detailRow && (
            <div className="grid gap-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Unit</span>
                <span>{detailRow.unit || "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Attribute Key</span>
                <span className="font-mono text-xs">{detailRow.attribute_key}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Direction</span>
                <Badge variant={detailRow.direction === "higher" ? "default" : "secondary"}>
                  {detailRow.direction === "higher" ? "\u2191 Higher is better" : "\u2193 Lower is better"}
                </Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Age Range</span>
                <span>{detailRow.age_min} – {detailRow.age_max}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Sport</span>
                <span className="capitalize">{detailRow.sport_id}</span>
              </div>
            </div>
          )}
          <DialogFooter showCloseButton />
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog
        open={!!deleteConfirm}
        onOpenChange={(v) => {
          if (!v) setDeleteConfirm(null);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Metric</DialogTitle>
            <DialogDescription>
              Are you sure you want to permanently delete this normative data
              row? This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteConfirm(null)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirm && handleDelete(deleteConfirm)}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
