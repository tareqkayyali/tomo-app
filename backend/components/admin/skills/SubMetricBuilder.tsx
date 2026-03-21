"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface SubMetric {
  key: string;
  label: string;
  unit: string;
  description: string;
}

interface SubMetricBuilderProps {
  subMetrics: SubMetric[];
  onChange: (subMetrics: SubMetric[]) => void;
}

export function SubMetricBuilder({ subMetrics, onChange }: SubMetricBuilderProps) {
  function addRow() {
    onChange([...subMetrics, { key: "", label: "", unit: "", description: "" }]);
  }

  function removeRow(index: number) {
    onChange(subMetrics.filter((_, i) => i !== index));
  }

  function updateRow(index: number, field: keyof SubMetric, value: string) {
    const updated = subMetrics.map((m, i) =>
      i === index ? { ...m, [field]: value } : m
    );
    onChange(updated);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label>Sub-Metrics</Label>
        <Button type="button" variant="outline" size="sm" onClick={addRow}>
          + Add Sub-Metric
        </Button>
      </div>

      {subMetrics.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No sub-metrics defined. Click &quot;Add Sub-Metric&quot; to add one.
        </p>
      )}

      {subMetrics.map((metric, index) => (
        <div
          key={index}
          className="grid grid-cols-[1fr_1fr_80px_1fr_auto] gap-2 items-end rounded-md border p-3"
        >
          <div className="space-y-1">
            <Label className="text-xs">Key</Label>
            <Input
              value={metric.key}
              onChange={(e) => updateRow(index, "key", e.target.value)}
              placeholder="e.g., accuracy"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Label</Label>
            <Input
              value={metric.label}
              onChange={(e) => updateRow(index, "label", e.target.value)}
              placeholder="e.g., Accuracy"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Unit</Label>
            <Input
              value={metric.unit}
              onChange={(e) => updateRow(index, "unit", e.target.value)}
              placeholder="%"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Description</Label>
            <Input
              value={metric.description}
              onChange={(e) => updateRow(index, "description", e.target.value)}
              placeholder="Short description"
            />
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => removeRow(index)}
            className="text-destructive"
          >
            Remove
          </Button>
        </div>
      ))}
    </div>
  );
}
