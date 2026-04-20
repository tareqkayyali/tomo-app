"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import NormativeSpreadsheet, {
  type NormativeRow,
} from "@/components/admin/normative/NormativeSpreadsheet";
import AddMetricDialog from "@/components/admin/normative/AddMetricDialog";
import NormativeImportDialog from "@/components/admin/normative/NormativeImportDialog";
import { toast } from "sonner";

const SPORTS = [
  { id: "football", label: "Football" },
  { id: "soccer", label: "Soccer" },
  { id: "basketball", label: "Basketball" },
  { id: "tennis", label: "Tennis" },
  { id: "padel", label: "Padel" },
];

export default function NormativeDataPage() {
  const [sportId, setSportId] = useState<string>("football");
  const [rows, setRows] = useState<NormativeRow[]>([]);
  const [attributeKeys, setAttributeKeys] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/v1/admin/normative-data?sport_id=${sportId}`,
        { credentials: "include" }
      );
      if (res.ok) {
        const data = await res.json();
        setRows(data.rows ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [sportId]);

  const fetchAttributes = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/v1/admin/normative-data?sport_id=${sportId}`,
        { credentials: "include" }
      );
      if (res.ok) {
        const data = await res.json();
        const keys = new Set<string>();
        (data.rows ?? []).forEach((r: NormativeRow) => {
          if (r.attribute_key) keys.add(r.attribute_key);
        });
        // Also try to fetch sport attributes
        try {
          const attrRes = await fetch(
            `/api/v1/content/items?type=sport_attribute&sport_id=${sportId}`,
            { credentials: "include" }
          );
          if (attrRes.ok) {
            const attrData = await attrRes.json();
            (attrData.items ?? attrData ?? []).forEach(
              (item: { key?: string; attribute_key?: string }) => {
                if (item.key) keys.add(item.key);
                if (item.attribute_key) keys.add(item.attribute_key);
              }
            );
          }
        } catch {
          // Content endpoint may not exist; fall back to common keys
        }

        // Add common fallback keys if none found
        if (keys.size === 0) {
          [
            "speed",
            "endurance",
            "strength",
            "agility",
            "power",
            "flexibility",
            "balance",
            "coordination",
            "reaction_time",
            "stamina",
          ].forEach((k) => keys.add(k));
        }

        setAttributeKeys(Array.from(keys).sort());
      }
    } catch {
      // Fallback attribute keys
      setAttributeKeys([
        "speed",
        "endurance",
        "strength",
        "agility",
        "power",
        "flexibility",
        "balance",
        "coordination",
        "reaction_time",
        "stamina",
      ]);
    }
  }, [sportId]);

  useEffect(() => {
    fetchData();
    fetchAttributes();
  }, [fetchData, fetchAttributes]);

  async function handleExport() {
    try {
      const res = await fetch(
        `/api/v1/admin/normative-data/export?sport_id=${sportId}`,
        { credentials: "include" }
      );
      if (!res.ok) {
        toast.error("Export failed");
        return;
      }

      const csv = await res.text();
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `normative-data-${sportId}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("CSV exported");
    } catch {
      toast.error("Export failed");
    }
  }

  function handleDeleted(id: string) {
    setRows((prev) => prev.filter((r) => r.id !== id));
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Normative Data
          </h1>
          <p className="text-muted-foreground">
            {rows.length} metric{rows.length !== 1 ? "s" : ""} for{" "}
            {SPORTS.find((s) => s.id === sportId)?.label ?? sportId}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <NormativeImportDialog sportId={sportId} onImported={fetchData} />
          <Button variant="outline" onClick={handleExport}>
            Export CSV
          </Button>
          <AddMetricDialog
            sportId={sportId}
            attributeKeys={attributeKeys}
            onCreated={fetchData}
          />
        </div>
      </div>

      {/* Sport Selector */}
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium">Sport:</span>
        <Select
          value={sportId}
          onValueChange={(v) => {
            if (v) setSportId(v);
          }}
        >
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SPORTS.map((sport) => (
              <SelectItem key={sport.id} value={sport.id}>
                {sport.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Spreadsheet */}
      {loading ? (
        <div className="rounded-md border p-8 text-center text-muted-foreground">
          Loading normative data...
        </div>
      ) : (
        <NormativeSpreadsheet
          rows={rows}
          onSaved={fetchData}
          onDeleted={handleDeleted}
        />
      )}
    </div>
  );
}
