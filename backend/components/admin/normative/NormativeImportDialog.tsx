"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import Papa from "papaparse";
import { toast } from "sonner";

interface NormativeImportDialogProps {
  sportId: string;
  onImported: () => void;
}

interface PreviewRow {
  metric_name: string;
  unit: string;
  attribute_key: string;
  direction: string;
  [key: string]: string | number;
}

export default function NormativeImportDialog({
  sportId,
  onImported,
}: NormativeImportDialogProps) {
  const [open, setOpen] = useState(false);
  const [csvText, setCsvText] = useState("");
  const [preview, setPreview] = useState<PreviewRow[]>([]);
  const [parseError, setParseError] = useState("");
  const [importing, setImporting] = useState(false);

  function handleParse() {
    setParseError("");
    setPreview([]);

    if (!csvText.trim()) {
      setParseError("Please paste CSV content");
      return;
    }

    const result = Papa.parse<PreviewRow>(csvText, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: true,
    });

    if (result.errors.length > 0) {
      setParseError(
        result.errors
          .slice(0, 5)
          .map((e) => `Row ${e.row}: ${e.message}`)
          .join("; ")
      );
      return;
    }

    if (!result.data.length) {
      setParseError("No data rows found in CSV");
      return;
    }

    // Check required columns
    const firstRow = result.data[0];
    const requiredCols = ["metric_name", "attribute_key", "direction"];
    const missing = requiredCols.filter(
      (col) => !(col in firstRow)
    );
    if (missing.length > 0) {
      setParseError(`Missing required columns: ${missing.join(", ")}`);
      return;
    }

    setPreview(result.data);
  }

  async function handleImport() {
    setImporting(true);
    try {
      const res = await fetch("/api/v1/admin/normative-data/import", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sport_id: sportId, csv: csvText }),
      });

      const data = await res.json();
      if (res.ok) {
        toast.success(
          `Imported ${data.succeeded} of ${data.total} metrics`
        );
        setCsvText("");
        setPreview([]);
        setOpen(false);
        onImported();
      } else {
        toast.error(data.error || "Import failed");
        if (data.validationErrors) {
          setParseError(
            data.validationErrors
              .slice(0, 5)
              .map(
                (e: { row: number; errors: string[] }) =>
                  `Row ${e.row}: ${e.errors.join(", ")}`
              )
              .join("; ")
          );
        }
      }
    } finally {
      setImporting(false);
    }
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target?.result as string;
      setCsvText(text);
    };
    reader.readAsText(file);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) {
          setCsvText("");
          setPreview([]);
          setParseError("");
        }
      }}
    >
      <DialogTrigger render={<Button variant="outline" />}>
        Import CSV
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import Normative Data from CSV</DialogTitle>
          <DialogDescription>
            Upload a CSV file or paste CSV content. Expected columns:
            metric_name, unit, attribute_key, direction, age_13_mean,
            age_13_sd, ... age_23_mean, age_23_sd
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-1.5">
            <Label>Upload CSV File</Label>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={handleFileUpload}
              className="text-sm"
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="csv-text">Or paste CSV content</Label>
            <Textarea
              id="csv-text"
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              rows={8}
              placeholder="metric_name,unit,attribute_key,direction,age_13_mean,age_13_sd,..."
              className="font-mono text-xs"
            />
          </div>

          <Button variant="outline" onClick={handleParse} disabled={!csvText.trim()}>
            Preview
          </Button>

          {parseError && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {parseError}
            </div>
          )}

          {preview.length > 0 && (
            <div className="rounded-md border overflow-auto max-h-60">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Metric</TableHead>
                    <TableHead>Unit</TableHead>
                    <TableHead>Attribute</TableHead>
                    <TableHead>Direction</TableHead>
                    <TableHead>Values (sample)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.slice(0, 10).map((row, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium">
                        {row.metric_name}
                      </TableCell>
                      <TableCell>{row.unit}</TableCell>
                      <TableCell>{row.attribute_key}</TableCell>
                      <TableCell>{row.direction}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {row.age_13_mean ?? "?"}, {row.age_14_mean ?? "?"}, ...
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {preview.length > 10 && (
                <p className="p-2 text-xs text-muted-foreground text-center">
                  ...and {preview.length - 10} more rows
                </p>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            onClick={handleImport}
            disabled={importing || preview.length === 0}
          >
            {importing
              ? "Importing..."
              : `Import ${preview.length} Metric${preview.length !== 1 ? "s" : ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
