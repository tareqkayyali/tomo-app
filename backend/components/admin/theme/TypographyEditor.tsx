"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface TypographyEditorProps {
  typography: Record<string, unknown>;
  onChange: (t: Record<string, unknown>) => void;
}

const STYLE_NAMES = [
  "display",
  "h1",
  "h2",
  "h3",
  "body",
  "bodyLarge",
  "bodyLight",
  "metadata",
  "caption",
  "button",
  "wordmark",
  "radarLabel",
  "radarScore",
  "benchmarkZone",
  "benchmarkPercentile",
  "benchmarkDelta",
  "normValue",
] as const;

const FONT_WEIGHTS = [
  { value: "300", label: "300 (Light)" },
  { value: "400", label: "400 (Regular)" },
  { value: "500", label: "500 (Medium)" },
  { value: "600", label: "600 (SemiBold)" },
  { value: "700", label: "700 (Bold)" },
];

interface TypoStyle {
  fontSize: number;
  fontWeight: string;
  letterSpacing: number;
}

function getStyle(typography: Record<string, unknown>, name: string): TypoStyle {
  const entry = typography[name] as Record<string, unknown> | undefined;
  return {
    fontSize: (entry?.fontSize as number) ?? 16,
    fontWeight: String((entry?.fontWeight as number | string) ?? "400"),
    letterSpacing: (entry?.letterSpacing as number) ?? 0,
  };
}

function formatLabel(name: string): string {
  return name.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());
}

export function TypographyEditor({ typography, onChange }: TypographyEditorProps) {
  function updateStyle(name: string, field: keyof TypoStyle, value: string | number) {
    const current = getStyle(typography, name);
    const updated = { ...current, [field]: value };
    onChange({ ...typography, [name]: updated });
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-[1fr_100px_160px_120px] gap-3 items-center px-2 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        <span>Style Name</span>
        <span>Font Size</span>
        <span>Font Weight</span>
        <span>Letter Spacing</span>
      </div>

      {STYLE_NAMES.map((name) => {
        const style = getStyle(typography, name);
        return (
          <div
            key={name}
            className="grid grid-cols-[1fr_100px_160px_120px] gap-3 items-center px-2 py-2 rounded-md hover:bg-muted/50"
          >
            <Label className="font-medium">{formatLabel(name)}</Label>

            <Input
              type="number"
              value={style.fontSize}
              onChange={(e) =>
                updateStyle(name, "fontSize", Number(e.target.value))
              }
              min={8}
              max={72}
              className="h-8 text-sm"
            />

            <Select
              value={style.fontWeight}
              onValueChange={(v) =>
                updateStyle(name, "fontWeight", v ?? "400")
              }
            >
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FONT_WEIGHTS.map((fw) => (
                  <SelectItem key={fw.value} value={fw.value}>
                    {fw.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Input
              type="number"
              value={style.letterSpacing}
              onChange={(e) =>
                updateStyle(name, "letterSpacing", Number(e.target.value))
              }
              step={0.1}
              className="h-8 text-sm"
            />
          </div>
        );
      })}
    </div>
  );
}
