"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface DerivedMetricDef {
  key: string;
  label: string;
  unit: string;
  normMetricName: string;
}

interface DerivedMetricEditorProps {
  metrics: DerivedMetricDef[];
  onChange: (metrics: DerivedMetricDef[]) => void;
}

const EMPTY_METRIC: DerivedMetricDef = {
  key: "",
  label: "",
  unit: "",
  normMetricName: "",
};

export function DerivedMetricEditor({
  metrics,
  onChange,
}: DerivedMetricEditorProps) {
  function updateMetric(index: number, patch: Partial<DerivedMetricDef>) {
    const updated = metrics.map((m, i) =>
      i === index ? { ...m, ...patch } : m
    );
    onChange(updated);
  }

  function addMetric() {
    onChange([...metrics, { ...EMPTY_METRIC }]);
  }

  function removeMetric(index: number) {
    onChange(metrics.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-3">
      {metrics.length > 0 && (
        <div className="grid grid-cols-4 gap-2 px-1">
          <Label className="text-xs text-muted-foreground">Key *</Label>
          <Label className="text-xs text-muted-foreground">Label *</Label>
          <Label className="text-xs text-muted-foreground">Unit</Label>
          <Label className="text-xs text-muted-foreground">
            Norm Metric Name
          </Label>
        </div>
      )}
      {metrics.map((metric, index) => (
        <div key={index} className="flex items-center gap-2">
          <div className="flex-1 grid grid-cols-4 gap-2">
            <Input
              value={metric.key}
              onChange={(e) => updateMetric(index, { key: e.target.value })}
              placeholder="estMaxSpeed"
              className="h-8 text-sm"
            />
            <Input
              value={metric.label}
              onChange={(e) => updateMetric(index, { label: e.target.value })}
              placeholder="Est. Max Speed"
              className="h-8 text-sm"
            />
            <Input
              value={metric.unit}
              onChange={(e) => updateMetric(index, { unit: e.target.value })}
              placeholder="km/h"
              className="h-8 text-sm"
            />
            <Input
              value={metric.normMetricName}
              onChange={(e) =>
                updateMetric(index, { normMetricName: e.target.value })
              }
              placeholder="Max Sprint Speed"
              className="h-8 text-sm"
            />
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-xs text-destructive shrink-0"
            onClick={() => removeMetric(index)}
          >
            Remove
          </Button>
        </div>
      ))}

      <Button type="button" variant="outline" onClick={addMetric}>
        + Add Derived Metric
      </Button>
    </div>
  );
}
