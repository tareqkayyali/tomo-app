"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

interface Attribute {
  key: string;
  full_name: string;
  color: string;
}

interface AttributeMultiSelectProps {
  selected: string[];
  onChange: (selected: string[]) => void;
  attributes: Attribute[];
}

export function AttributeMultiSelect({
  selected,
  onChange,
  attributes,
}: AttributeMultiSelectProps) {
  function toggleAttribute(key: string) {
    if (selected.includes(key)) {
      onChange(selected.filter((s) => s !== key));
    } else {
      onChange([...selected, key]);
    }
  }

  if (attributes.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No attributes defined for this sport
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {attributes.map((attr) => (
        <div key={attr.key} className="flex items-center gap-2">
          <Checkbox
            checked={selected.includes(attr.key)}
            onCheckedChange={() => toggleAttribute(attr.key)}
            id={`attr-${attr.key}`}
          />
          <span
            className="inline-block size-2.5 rounded-full shrink-0"
            style={{ backgroundColor: attr.color }}
          />
          <Label
            htmlFor={`attr-${attr.key}`}
            className="text-sm font-normal cursor-pointer"
          >
            {attr.full_name}
          </Label>
        </div>
      ))}
    </div>
  );
}
