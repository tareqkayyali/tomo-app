"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

interface Position {
  key: string;
  label: string;
}

interface PositionMultiSelectProps {
  selected: string[];
  onChange: (selected: string[]) => void;
  positions: Position[];
}

export function PositionMultiSelect({
  selected,
  onChange,
  positions,
}: PositionMultiSelectProps) {
  function togglePosition(key: string) {
    if (selected.includes(key)) {
      onChange(selected.filter((s) => s !== key));
    } else {
      onChange([...selected, key]);
    }
  }

  if (positions.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No positions defined for this sport
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {positions.map((pos) => (
        <div key={pos.key} className="flex items-center gap-2">
          <Checkbox
            checked={selected.includes(pos.key)}
            onCheckedChange={() => togglePosition(pos.key)}
            id={`pos-${pos.key}`}
          />
          <Label
            htmlFor={`pos-${pos.key}`}
            className="text-sm font-normal cursor-pointer"
          >
            {pos.label}
          </Label>
        </div>
      ))}
    </div>
  );
}
