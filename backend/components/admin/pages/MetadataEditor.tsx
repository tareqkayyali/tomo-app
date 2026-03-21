"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface PageMetadata {
  pageTitle?: string;
  subtitle?: string;
  tabLabels?: Record<string, string>;
  emptyStates?: Record<string, string>;
}

interface MetadataEditorProps {
  metadata: PageMetadata;
  onChange: (m: PageMetadata) => void;
}

/**
 * Convert Record<string,string> to/from array for editing.
 * The DB stores {key: value} objects, the UI edits as rows.
 */
function recordToEntries(
  rec: Record<string, string> | { key: string; value: string }[] | undefined
): { key: string; value: string }[] {
  if (!rec) return [];
  // Already an array (legacy format)
  if (Array.isArray(rec)) return rec;
  // Convert Record to array
  return Object.entries(rec).map(([key, value]) => ({ key, value }));
}

function entriesToRecord(entries: { key: string; value: string }[]): Record<string, string> {
  const rec: Record<string, string> = {};
  for (const e of entries) {
    if (e.key.trim()) rec[e.key.trim()] = e.value;
  }
  return rec;
}

export function MetadataEditor({ metadata, onChange }: MetadataEditorProps) {
  const tabEntries = recordToEntries(metadata.tabLabels);
  const emptyEntries = recordToEntries(metadata.emptyStates);

  function updateField(field: keyof PageMetadata, value: unknown) {
    onChange({ ...metadata, [field]: value });
  }

  function updateKvList(
    field: "tabLabels" | "emptyStates",
    entries: { key: string; value: string }[],
    index: number,
    prop: "key" | "value",
    val: string
  ) {
    const list = [...entries];
    list[index] = { ...list[index], [prop]: val };
    updateField(field, entriesToRecord(list));
  }

  function addKvItem(field: "tabLabels" | "emptyStates", entries: { key: string; value: string }[]) {
    const list = [...entries, { key: "", value: "" }];
    updateField(field, entriesToRecord(list));
  }

  function removeKvItem(field: "tabLabels" | "emptyStates", entries: { key: string; value: string }[], index: number) {
    const list = entries.filter((_, i) => i !== index);
    updateField(field, entriesToRecord(list));
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Page Title</Label>
          <Input
            value={metadata.pageTitle || ""}
            onChange={(e) => updateField("pageTitle", e.target.value)}
            placeholder="e.g., My Timeline"
          />
        </div>
        <div className="space-y-2">
          <Label>Subtitle</Label>
          <Input
            value={metadata.subtitle || ""}
            onChange={(e) => updateField("subtitle", e.target.value)}
            placeholder="e.g., Plan your week"
          />
        </div>
      </div>

      {/* Tab Labels */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium">Tab Labels</Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => addKvItem("tabLabels", tabEntries)}
          >
            + Add Tab Label
          </Button>
        </div>
        {tabEntries.length === 0 && (
          <p className="text-sm text-muted-foreground">No tab labels configured.</p>
        )}
        {tabEntries.map((item, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input
              value={item.key}
              onChange={(e) => updateKvList("tabLabels", tabEntries, i, "key", e.target.value)}
              placeholder="Key (e.g., dayflow)"
              className="flex-1"
            />
            <Input
              value={item.value}
              onChange={(e) => updateKvList("tabLabels", tabEntries, i, "value", e.target.value)}
              placeholder="Label (e.g., My Flow)"
              className="flex-1"
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => removeKvItem("tabLabels", tabEntries, i)}
              className="text-destructive shrink-0"
            >
              Remove
            </Button>
          </div>
        ))}
      </div>

      {/* Empty States */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium">Empty States</Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => addKvItem("emptyStates", emptyEntries)}
          >
            + Add Empty State
          </Button>
        </div>
        {emptyEntries.length === 0 && (
          <p className="text-sm text-muted-foreground">No empty states configured.</p>
        )}
        {emptyEntries.map((item, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input
              value={item.key}
              onChange={(e) => updateKvList("emptyStates", emptyEntries, i, "key", e.target.value)}
              placeholder="Key (e.g., noData)"
              className="flex-1"
            />
            <Input
              value={item.value}
              onChange={(e) => updateKvList("emptyStates", emptyEntries, i, "value", e.target.value)}
              placeholder="Message"
              className="flex-1"
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => removeKvItem("emptyStates", emptyEntries, i)}
              className="text-destructive shrink-0"
            >
              Remove
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
