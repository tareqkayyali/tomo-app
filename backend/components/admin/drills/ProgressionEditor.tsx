"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";

interface ProgressionItem {
  level: number;
  label: string;
  description: string;
  duration_minutes?: number;
}

interface ProgressionEditorProps {
  progressions: ProgressionItem[];
  onChange: (progressions: ProgressionItem[]) => void;
}

export function ProgressionEditor({
  progressions,
  onChange,
}: ProgressionEditorProps) {
  function handleChange(
    index: number,
    field: keyof ProgressionItem,
    value: string | number | undefined
  ) {
    const updated = [...progressions];
    updated[index] = { ...updated[index], [field]: value };
    onChange(updated);
  }

  function handleAdd() {
    if (progressions.length >= 3) return;
    const nextLevel = progressions.length + 1;
    onChange([
      ...progressions,
      { level: nextLevel, label: "", description: "" },
    ]);
  }

  return (
    <div className="space-y-4">
      {progressions.map((item, index) => (
        <div
          key={item.level}
          className="border rounded-lg p-4 space-y-3"
        >
          <div className="flex items-center gap-2">
            <Badge variant="secondary">Level {item.level}</Badge>
          </div>
          <div className="space-y-2">
            <Label>Label</Label>
            <Input
              value={item.label}
              onChange={(e) => handleChange(index, "label", e.target.value)}
              placeholder={`Level ${item.level} label (e.g., Beginner)`}
            />
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea
              value={item.description}
              onChange={(e) =>
                handleChange(index, "description", e.target.value)
              }
              placeholder="Describe this progression level..."
              rows={2}
            />
          </div>
          <div className="space-y-2">
            <Label>Duration (minutes, optional)</Label>
            <Input
              type="number"
              min={1}
              value={item.duration_minutes ?? ""}
              onChange={(e) => {
                const val = e.target.value;
                handleChange(
                  index,
                  "duration_minutes",
                  val === "" ? undefined : parseInt(val) || undefined
                );
              }}
              placeholder="e.g., 15"
              className="w-32"
            />
          </div>
        </div>
      ))}
      {progressions.length < 3 && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleAdd}
        >
          + Add Level {progressions.length + 1}
        </Button>
      )}
    </div>
  );
}
