"use client";

import { useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

/**
 * Bulk Import/Export — Phase 10
 * Reusable component for importing/exporting protocols and knowledge chunks.
 * Supports JSON and CSV formats.
 *
 * Used in:
 * - Protocol Hierarchy page
 * - Knowledge Base page
 */

type ResourceType = "protocols" | "knowledge";
type ExportFormat = "json" | "csv";

interface BulkImportExportProps {
  resourceType: ResourceType;
  onImportComplete?: () => void;
}

// ── CSV Parser ──────────────────────────────────────────────────────────────

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
  return lines.slice(1).map((line) => {
    const values = line.split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = values[i] || "";
    });
    return row;
  });
}

function toCSV(data: Record<string, unknown>[]): string {
  if (data.length === 0) return "";
  const headers = Object.keys(data[0]);
  const rows = data.map((row) =>
    headers
      .map((h) => {
        const val = row[h];
        if (val === null || val === undefined) return "";
        if (Array.isArray(val)) return `"${val.join("; ")}"`;
        if (typeof val === "object") return `"${JSON.stringify(val)}"`;
        return `"${String(val).replace(/"/g, '""')}"`;
      })
      .join(",")
  );
  return [headers.map((h) => `"${h}"`).join(","), ...rows].join("\n");
}

// ── Component ──────────────────────────────────────────────────────────────

export function BulkImportExport({
  resourceType,
  onImportComplete,
}: BulkImportExportProps) {
  const [importOpen, setImportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [exportFormat, setExportFormat] = useState<ExportFormat>("json");
  const [preview, setPreview] = useState<Record<string, unknown>[] | null>(
    null
  );
  const fileInputRef = useRef<HTMLInputElement>(null);

  const label = resourceType === "protocols" ? "Protocols" : "Knowledge Chunks";
  const apiBase =
    resourceType === "protocols"
      ? "/api/v1/admin/enterprise/protocols"
      : "/api/v1/admin/enterprise/knowledge/chunks";

  // ── Export ────────────────────────────────────────────────────────────────

  async function handleExport() {
    setExporting(true);
    try {
      const res = await fetch(apiBase);
      if (!res.ok) throw new Error("Failed to fetch data for export");
      const data = await res.json();
      const items = data.protocols || data.chunks || [];

      if (items.length === 0) {
        toast.error("No data to export");
        return;
      }

      let content: string;
      let filename: string;
      let mimeType: string;

      if (exportFormat === "json") {
        content = JSON.stringify(items, null, 2);
        filename = `tomo_${resourceType}_export_${new Date().toISOString().slice(0, 10)}.json`;
        mimeType = "application/json";
      } else {
        content = toCSV(items);
        filename = `tomo_${resourceType}_export_${new Date().toISOString().slice(0, 10)}.csv`;
        mimeType = "text/csv";
      }

      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success(`Exported ${items.length} ${label.toLowerCase()}`);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Export failed";
      toast.error(message);
    } finally {
      setExporting(false);
    }
  }

  // ── Import ────────────────────────────────────────────────────────────────

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        let parsed: Record<string, unknown>[];

        if (file.name.endsWith(".json")) {
          const json = JSON.parse(text);
          parsed = Array.isArray(json) ? json : [json];
        } else if (file.name.endsWith(".csv")) {
          parsed = parseCSV(text);
        } else {
          toast.error("Unsupported format. Use .json or .csv");
          return;
        }

        if (parsed.length === 0) {
          toast.error("File is empty");
          return;
        }

        setPreview(parsed);
        toast.info(`Parsed ${parsed.length} records. Review before importing.`);
      } catch {
        toast.error("Failed to parse file");
      }
    };
    reader.readAsText(file);
  }

  async function handleImport() {
    if (!preview || preview.length === 0) return;
    setImporting(true);

    try {
      const res = await fetch(`${apiBase}/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: preview }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Import failed");
      }

      const data = await res.json();
      toast.success(
        `Imported ${data.imported || preview.length} ${label.toLowerCase()}`
      );
      setPreview(null);
      setImportOpen(false);
      onImportComplete?.();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Import failed";
      toast.error(message);
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="flex gap-2">
      {/* Export */}
      <div className="flex gap-1">
        <Select
          value={exportFormat}
          onValueChange={(v) => setExportFormat(v as ExportFormat)}
        >
          <SelectTrigger className="w-20 h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="json">JSON</SelectItem>
            <SelectItem value="csv">CSV</SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="sm"
          onClick={handleExport}
          disabled={exporting}
        >
          {exporting ? "Exporting..." : "Export"}
        </Button>
      </div>

      {/* Import */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogTrigger render={<Button variant="outline" size="sm" />}>
          Import
        </DialogTrigger>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Import {label}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Upload a JSON or CSV file. Records will be upserted (existing
              records updated, new records created).
            </p>

            <input
              ref={fileInputRef}
              type="file"
              accept=".json,.csv"
              onChange={handleFileSelect}
              className="hidden"
            />
            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              className="w-full"
            >
              Choose File (.json or .csv)
            </Button>

            {/* Preview */}
            {preview && (
              <Card className="p-3 max-h-48 overflow-y-auto">
                <div className="flex items-center justify-between mb-2">
                  <Badge variant="secondary" className="text-xs">
                    {preview.length} records
                  </Badge>
                  <button
                    onClick={() => setPreview(null)}
                    className="text-xs text-muted-foreground hover:text-destructive"
                  >
                    Clear
                  </button>
                </div>
                <div className="space-y-1">
                  {preview.slice(0, 5).map((row, i) => (
                    <div
                      key={i}
                      className="text-xs p-1 rounded bg-muted truncate"
                    >
                      {(row.name as string) ||
                        (row.title as string) ||
                        JSON.stringify(row).slice(0, 80)}
                    </div>
                  ))}
                  {preview.length > 5 && (
                    <p className="text-xs text-muted-foreground text-center">
                      ...and {preview.length - 5} more
                    </p>
                  )}
                </div>
              </Card>
            )}

            <Button
              onClick={handleImport}
              disabled={!preview || importing}
              className="w-full"
            >
              {importing
                ? "Importing..."
                : `Import ${preview?.length || 0} Records`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
