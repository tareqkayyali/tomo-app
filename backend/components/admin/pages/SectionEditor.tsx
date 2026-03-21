"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface SectionConfig {
  sectionId: string;
  title: string;
  subtitle?: string;
  visible: boolean;
  sortOrder?: number;
  cardVariant?: string;
  spacing?: {
    marginTop?: number;
    marginBottom?: number;
    paddingHorizontal?: number;
  };
  style?: Record<string, unknown>;
}

interface SectionEditorProps {
  section: SectionConfig;
  onChange: (s: SectionConfig) => void;
}

const CARD_VARIANTS = [
  "blob",
  "rounded",
  "glass",
  "muted",
  "elevated",
  "outlined",
] as const;

export function SectionEditor({ section, onChange }: SectionEditorProps) {
  function update(field: string, value: unknown) {
    onChange({ ...section, [field]: value });
  }

  function updateSpacing(field: string, value: number) {
    onChange({
      ...section,
      spacing: { ...(section.spacing || {}), [field]: value },
    });
  }

  return (
    <div className="space-y-4 pl-8 border-l-2 border-muted">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Title</Label>
          <Input
            value={section.title}
            onChange={(e) => update("title", e.target.value)}
            placeholder="Section title"
          />
        </div>
        <div className="space-y-2">
          <Label>Subtitle</Label>
          <Input
            value={section.subtitle || ""}
            onChange={(e) => update("subtitle", e.target.value)}
            placeholder="Section subtitle"
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label>Card Variant</Label>
          <Select
            value={section.cardVariant || "rounded"}
            onValueChange={(v) => update("cardVariant", v ?? "rounded")}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CARD_VARIANTS.map((variant) => (
                <SelectItem key={variant} value={variant} className="capitalize">
                  {variant}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Margin Top (px)</Label>
          <Input
            type="number"
            value={section.spacing?.marginTop ?? 0}
            onChange={(e) => updateSpacing("marginTop", Number(e.target.value))}
            min={0}
          />
        </div>
        <div className="space-y-2">
          <Label>Padding Horizontal (px)</Label>
          <Input
            type="number"
            value={section.spacing?.paddingHorizontal ?? 0}
            onChange={(e) =>
              updateSpacing("paddingHorizontal", Number(e.target.value))
            }
            min={0}
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Switch
          checked={section.visible}
          onCheckedChange={(checked) => update("visible", checked)}
        />
        <Label>Visible</Label>
      </div>
    </div>
  );
}
