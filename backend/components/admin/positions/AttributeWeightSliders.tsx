"use client";

import { useEffect, useState } from "react";
import { Label } from "@/components/ui/label";

interface Attribute {
  key: string;
  full_name: string;
  color: string;
}

interface AttributeWeightSlidersProps {
  weights: Record<string, number>;
  onChange: (weights: Record<string, number>) => void;
  sportId: string;
}

export function AttributeWeightSliders({
  weights,
  onChange,
  sportId,
}: AttributeWeightSlidersProps) {
  const [attributes, setAttributes] = useState<Attribute[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/v1/content/bundle")
      .then((r) => r.json())
      .then((bundle) => {
        const attrs = (bundle.sport_attributes || [])
          .filter((a: Record<string, unknown>) => a.sport_id === sportId)
          .map((a: Record<string, unknown>) => ({
            key: a.key as string,
            full_name: a.full_name as string,
            color: (a.color as string) || "#888888",
          }));
        setAttributes(attrs);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [sportId]);

  function handleSliderChange(attrKey: string, value: number) {
    onChange({ ...weights, [attrKey]: value });
  }

  const totalWeight = Object.values(weights).reduce((sum, v) => sum + v, 0);

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading attributes...</p>;
  }

  if (attributes.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No attributes found for this sport. Add attributes first.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <Label>Attribute Weights</Label>

      {attributes.map((attr) => (
        <div key={attr.key} className="flex items-center gap-3">
          <div
            className="h-3 w-3 rounded-full flex-shrink-0"
            style={{ backgroundColor: attr.color }}
          />
          <span className="text-sm w-32 flex-shrink-0">{attr.full_name}</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={weights[attr.key] ?? 0}
            onChange={(e) =>
              handleSliderChange(attr.key, parseFloat(e.target.value))
            }
            className="flex-1"
          />
          <span className="text-sm font-mono w-12 text-right">
            {(weights[attr.key] ?? 0).toFixed(2)}
          </span>
        </div>
      ))}

      <div className="flex items-center justify-end gap-2 pt-2 border-t">
        <span className="text-sm font-medium">Total:</span>
        <span
          className={`text-sm font-mono font-bold ${
            Math.abs(totalWeight - 1) < 0.05
              ? "text-green-600"
              : "text-yellow-600"
          }`}
        >
          {totalWeight.toFixed(2)}
        </span>
        {Math.abs(totalWeight - 1) >= 0.05 && (
          <span className="text-xs text-yellow-600">(should be ~1.00)</span>
        )}
      </div>
    </div>
  );
}
