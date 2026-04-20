"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface SubAttribute {
  name: string;
  weight: number;
  description: string;
  unit: string;
}

interface SubAttributeBuilderProps {
  value: SubAttribute[];
  onChange: (value: SubAttribute[]) => void;
}

export function SubAttributeBuilder({
  value,
  onChange,
}: SubAttributeBuilderProps) {
  function addRow() {
    onChange([...value, { name: "", weight: 0, description: "", unit: "" }]);
  }

  function removeRow(index: number) {
    onChange(value.filter((_, i) => i !== index));
  }

  function updateRow(index: number, field: keyof SubAttribute, val: string | number) {
    const updated = value.map((row, i) =>
      i === index ? { ...row, [field]: val } : row
    );
    onChange(updated);
  }

  const totalWeight = value.reduce((sum, r) => sum + (r.weight || 0), 0);
  const weightWarning = value.length > 0 && Math.abs(totalWeight - 1.0) > 0.01;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-base font-semibold">Sub-Attributes</Label>
        <Button type="button" variant="outline" size="sm" onClick={addRow}>
          + Add Sub-Attribute
        </Button>
      </div>

      {value.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No sub-attributes. Click &quot;Add Sub-Attribute&quot; to begin.
        </p>
      )}

      {value.map((row, i) => (
        <div
          key={i}
          className="grid grid-cols-[1fr_80px_1fr_80px_32px] gap-2 items-end"
        >
          <div className="space-y-1">
            {i === 0 && (
              <Label className="text-xs text-muted-foreground">Name</Label>
            )}
            <Input
              value={row.name}
              onChange={(e) => updateRow(i, "name", e.target.value)}
              placeholder="Sprint Speed"
            />
          </div>
          <div className="space-y-1">
            {i === 0 && (
              <Label className="text-xs text-muted-foreground">Weight</Label>
            )}
            <Input
              type="number"
              step={0.01}
              min={0}
              max={1}
              value={row.weight}
              onChange={(e) => updateRow(i, "weight", parseFloat(e.target.value) || 0)}
            />
          </div>
          <div className="space-y-1">
            {i === 0 && (
              <Label className="text-xs text-muted-foreground">Description</Label>
            )}
            <Input
              value={row.description}
              onChange={(e) => updateRow(i, "description", e.target.value)}
              placeholder="Top speed in sprints"
            />
          </div>
          <div className="space-y-1">
            {i === 0 && (
              <Label className="text-xs text-muted-foreground">Unit</Label>
            )}
            <Input
              value={row.unit}
              onChange={(e) => updateRow(i, "unit", e.target.value)}
              placeholder="km/h"
            />
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-destructive h-9 w-9 p-0"
            onClick={() => removeRow(i)}
          >
            x
          </Button>
        </div>
      ))}

      {value.length > 0 && (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Total weight:</span>
          <span className={weightWarning ? "text-destructive font-medium" : "font-medium"}>
            {totalWeight.toFixed(2)}
          </span>
          {weightWarning && (
            <span className="text-destructive text-xs">
              (should be ~1.00)
            </span>
          )}
        </div>
      )}
    </div>
  );
}
