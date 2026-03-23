"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

const AGE_BANDS = ["U14", "U17", "U19", "U20+"] as const;

interface AgeBandSelectorProps {
  selected: string[];
  onChange: (selected: string[]) => void;
}

export function AgeBandSelector({ selected, onChange }: AgeBandSelectorProps) {
  function toggleBand(band: string) {
    if (selected.includes(band)) {
      onChange(selected.filter((s) => s !== band));
    } else {
      onChange([...selected, band]);
    }
  }

  return (
    <div className="flex items-center gap-6">
      {AGE_BANDS.map((band) => (
        <div key={band} className="flex items-center gap-2">
          <Checkbox
            checked={selected.includes(band)}
            onCheckedChange={() => toggleBand(band)}
            id={`age-${band}`}
          />
          <Label
            htmlFor={`age-${band}`}
            className="text-sm font-normal cursor-pointer"
          >
            {band}
          </Label>
        </div>
      ))}
    </div>
  );
}
