"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface ColorGroupEditorProps {
  colors: Record<string, unknown>;
  onChange: (c: Record<string, unknown>) => void;
  mode: "dark" | "light";
}

const COLOR_GROUPS: { label: string; keys: string[] }[] = [
  {
    label: "Brand",
    keys: ["accent1", "accent2", "accent1Dark", "accent1Light", "accent2Dark", "accent2Light"],
  },
  {
    label: "Background",
    keys: ["background", "backgroundElevated"],
  },
  {
    label: "Text",
    keys: ["textHeader", "textOnDark", "textOnLight", "textInactive", "textMuted", "textSecondary"],
  },
  {
    label: "Semantic",
    keys: ["success", "warning", "error", "info"],
  },
  {
    label: "Readiness",
    keys: ["readinessGreen", "readinessYellow", "readinessRed"],
  },
  {
    label: "Events",
    keys: ["eventTraining", "eventMatch", "eventRecovery", "eventStudyBlock", "eventExam"],
  },
  {
    label: "Glass",
    keys: ["glass", "glassBorder", "glassHighlight"],
  },
  {
    label: "Shadows",
    keys: ["glowOrange", "glowCyan"],
  },
  {
    label: "Radar Chart",
    keys: [
      "radarFill",
      "radarFillBenchmark",
      "radarGrid",
      "radarAxisLine",
      "radarVertexDot",
      "radarLabelText",
      "radarScoreText",
    ],
  },
  {
    label: "Benchmarks & Normative Lines",
    keys: [
      "benchmarkElite",
      "benchmarkGood",
      "benchmarkAverage",
      "benchmarkDeveloping",
      "benchmarkBelow",
      "normLineP25",
      "normLineP50",
      "normLineP75",
      "normPlayerDot",
      "normGhostDot",
    ],
  },
];

const HEX_REGEX = /^#([0-9A-Fa-f]{3,8})$/;

function isValidHex(value: string): boolean {
  return HEX_REGEX.test(value);
}

function formatLabel(key: string): string {
  return key.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());
}

function rgbaToHex(rgba: string): string {
  // Convert rgba(...) or rgb(...) to #hex for the color picker
  const match = rgba.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (match) {
    const r = parseInt(match[1]).toString(16).padStart(2, "0");
    const g = parseInt(match[2]).toString(16).padStart(2, "0");
    const b = parseInt(match[3]).toString(16).padStart(2, "0");
    return `#${r}${g}${b}`;
  }
  return rgba;
}

function getPickerValue(val: string): string {
  if (!val) return "#888888";
  if (val.startsWith("rgba") || val.startsWith("rgb")) return rgbaToHex(val);
  if (val.startsWith("#") && (val.length === 4 || val.length === 7 || val.length === 9)) return val.slice(0, 7);
  return "#888888";
}

function ColorInput({
  colorKey,
  value,
  onChange,
}: {
  colorKey: string;
  value: string;
  onChange: (key: string, val: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const valid = !draft || isValidHex(draft) || draft.startsWith("rgba") || draft.startsWith("rgb");

  return (
    <div className="flex items-center gap-2">
      {/* Native color picker — includes palette + eyedropper on Chrome/Edge/Safari */}
      <input
        type="color"
        value={getPickerValue(draft)}
        onChange={(e) => {
          const hex = e.target.value;
          setDraft(hex);
          onChange(colorKey, hex);
        }}
        className="w-9 h-9 rounded-md border cursor-pointer shrink-0 p-0.5 bg-transparent"
        title="Click to pick color (includes eyedropper)"
      />
      <div className="flex-1 space-y-1">
        <Label className="text-xs text-muted-foreground">{formatLabel(colorKey)}</Label>
        <Input
          value={draft}
          onChange={(e) => {
            const v = e.target.value;
            setDraft(v);
            if (!v || isValidHex(v)) {
              onChange(colorKey, v);
            }
          }}
          placeholder="#RRGGBB"
          className={`h-8 font-mono text-sm ${!valid ? "border-destructive" : ""}`}
        />
      </div>
    </div>
  );
}

export function ColorGroupEditor({ colors, onChange, mode }: ColorGroupEditorProps) {
  function handleColorChange(key: string, value: string) {
    onChange({ ...colors, [key]: value });
  }

  return (
    <div className="space-y-6">
      {COLOR_GROUPS.map((group) => (
        <CollapsibleGroup key={group.label} label={group.label}>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {group.keys.map((key) => (
              <ColorInput
                key={key}
                colorKey={key}
                value={(colors[key] as string) || ""}
                onChange={handleColorChange}
              />
            ))}
          </div>
        </CollapsibleGroup>
      ))}
    </div>
  );
}

function CollapsibleGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);

  return (
    <div className="border rounded-lg">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold hover:bg-muted/50 transition-colors"
      >
        <span>{label}</span>
        <span className="text-muted-foreground">{open ? "\u25B2" : "\u25BC"}</span>
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}
