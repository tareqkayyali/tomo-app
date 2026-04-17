"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export interface PageColorOverrides {
  dark?: Record<string, string>;
  light?: Record<string, string>;
}

// Common color keys that can be overridden per page
const OVERRIDABLE_KEYS = [
  { key: "accent1", label: "Accent 1 (Orange)" },
  { key: "accent2", label: "Accent 2 (Teal)" },
  { key: "accent1Dark", label: "Accent 1 Dark" },
  { key: "accent1Light", label: "Accent 1 Light" },
  { key: "background", label: "Background" },
  { key: "backgroundElevated", label: "Background Elevated" },
  { key: "textHeader", label: "Text Header" },
  { key: "textOnDark", label: "Text Primary" },
  { key: "textMuted", label: "Text Muted" },
  { key: "textInactive", label: "Text Inactive" },
  { key: "glowOrange", label: "Glow Orange" },
  { key: "glowCyan", label: "Glow Cyan" },
  { key: "glass", label: "Glass" },
  { key: "glassBorder", label: "Glass Border" },
];

const HEX_REGEX = /^#([0-9A-Fa-f]{3,8})$/;

function isValidHex(value: string): boolean {
  return HEX_REGEX.test(value);
}

function getPickerValue(val: string): string {
  if (!val) return "#888888";
  if (val.startsWith("#") && (val.length === 4 || val.length === 7 || val.length === 9))
    return val.slice(0, 7);
  return "#888888";
}

type Mode = "dark" | "light";

interface PageColorEditorProps {
  colorOverrides: PageColorOverrides;
  onChange: (overrides: PageColorOverrides) => void;
}

export function PageColorEditor({ colorOverrides, onChange }: PageColorEditorProps) {
  const [activeMode, setActiveMode] = useState<Mode>("dark");

  const modeOverrides = colorOverrides[activeMode] || {};
  const activeKeys = Object.keys(modeOverrides);

  function updateColor(key: string, value: string) {
    const updated = { ...modeOverrides, [key]: value };
    onChange({ ...colorOverrides, [activeMode]: updated });
  }

  function removeColor(key: string) {
    const updated = { ...modeOverrides };
    delete updated[key];
    // Clean up empty object
    if (Object.keys(updated).length === 0) {
      const next = { ...colorOverrides };
      delete next[activeMode];
      onChange(next);
    } else {
      onChange({ ...colorOverrides, [activeMode]: updated });
    }
  }

  function addColor(key: string) {
    updateColor(key, "#FF6B35");
  }

  const availableKeys = OVERRIDABLE_KEYS.filter((k) => !activeKeys.includes(k.key));

  return (
    <div className="space-y-4">
      {/* Mode tabs */}
      <div className="border-b">
        <div className="flex gap-0">
          {(["dark", "light"] as const).map((mode) => {
            const count = Object.keys(colorOverrides[mode] || {}).length;
            return (
              <button
                key={mode}
                type="button"
                onClick={() => setActiveMode(mode)}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  activeMode === mode
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {mode === "dark" ? "Dark Mode" : "Light Mode"}
                {count > 0 && (
                  <span className="ml-1.5 text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Active overrides */}
      {activeKeys.length > 0 ? (
        <div className="space-y-3">
          {activeKeys.map((key) => {
            const value = modeOverrides[key];
            const label = OVERRIDABLE_KEYS.find((k) => k.key === key)?.label || key;
            const valid = !value || isValidHex(value);

            return (
              <div key={key} className="flex items-center gap-3">
                <input
                  type="color"
                  value={getPickerValue(value)}
                  onChange={(e) => updateColor(key, e.target.value)}
                  className="w-9 h-9 rounded-md border cursor-pointer shrink-0 p-0.5 bg-transparent"
                />
                <div className="flex-1 space-y-1">
                  <Label className="text-xs text-muted-foreground">{label}</Label>
                  <Input
                    value={value}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (!v || isValidHex(v)) updateColor(key, v);
                    }}
                    placeholder="#RRGGBB"
                    className={`h-8 font-mono text-sm ${!valid ? "border-destructive" : ""}`}
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeColor(key)}
                  className="text-destructive shrink-0"
                >
                  ×
                </Button>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground py-2">
          No color overrides for {activeMode} mode. Add one below.
        </p>
      )}

      {/* Add color dropdown */}
      {availableKeys.length > 0 && (
        <div className="pt-2 border-t">
          <Label className="text-xs text-muted-foreground mb-2 block">Add a color override</Label>
          <div className="flex flex-wrap gap-1.5">
            {availableKeys.map((k) => (
              <Badge
                key={k.key}
                variant="outline"
                className="cursor-pointer hover:bg-muted text-xs"
                onClick={() => addColor(k.key)}
              >
                + {k.label}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
